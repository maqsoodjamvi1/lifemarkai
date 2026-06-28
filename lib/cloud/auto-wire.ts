/**
 * Backend auto-wiring — Lovable Cloud parity.
 *
 * When a build needs a backend (auth, database, storage), this module:
 *   1. Auto-enables Lifemark Cloud for the project (managed Supabase project
 *      when the Management API is configured, local mode otherwise)
 *   2. Injects VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY into the generated
 *      app's .env.local (browser-safe, Vite build-time vars — same convention
 *      Lovable documents)
 *   3. Scaffolds src/lib/supabase.ts and adds @supabase/supabase-js to
 *      package.json so generated code can `import { supabase } from "./lib/supabase"`
 *   4. Applies generated supabase/migrations/*.sql to the project's dedicated
 *      backend via the Management API (when the Database permission allows)
 *
 * Wired into the chat (build/patch) and agent routes after files are saved.
 * Every step is best-effort — wiring failures never fail the build.
 */

import { ENV_FILE_PATH, parseEnvFile, serializeEnvFile } from "@/lib/project/env-file";
import {
  isManagementConfigured,
  createManagedProject,
  managedProjectUrl,
  runManagedSql,
} from "@/lib/cloud/management";
import {
  parseCloudToolPermissions,
  type CloudToolId,
  type CloudToolPermission,
} from "@/lib/cloud/permissions";

export interface AutoWireResult {
  intentDetected: boolean;
  cloudEnabled: boolean;       // enabled during this call
  credsInjected: boolean;
  scaffoldAdded: boolean;
  migrationsApplied: number;
  migrationsPending: number;   // generated but not auto-applied (permission "ask")
  notes: string[];
}

interface GeneratedFile {
  path: string;
  content: string;
  language?: string;
}

const BACKEND_INTENT_RE =
  /\b(log\s?in|login|sign\s?up|signup|auth(entication)?|user account|register user|database|db\b|save (the )?data|store (the )?data|persist|backend|supabase|postgres|crud|user profile|password|session|upload file|file storage)\b/i;

/** Does this prompt / generated output need a backend? */
export function detectBackendIntent(prompt: string, files: GeneratedFile[]): boolean {
  if (BACKEND_INTENT_RE.test(prompt)) return true;
  return files.some(
    (f) =>
      /supabase\/migrations\/.*\.sql$/.test(f.path) ||
      /@supabase\/supabase-js|supabase\.auth\.|from\(["']/.test(f.content ?? "") && /supabase/i.test(f.content ?? "")
  );
}

const SUPABASE_CLIENT_SCAFFOLD = `import { createClient } from "@supabase/supabase-js";

// Auto-configured by Lifemark Cloud — credentials live in .env.local
// (VITE_* vars are build-time, browser-safe values).
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

if (!supabaseUrl || !supabaseAnonKey) {
  // eslint-disable-next-line no-console
  console.warn("Supabase credentials missing — backend features are disabled until the project finishes provisioning.");
}

export const supabase = createClient(supabaseUrl ?? "", supabaseAnonKey ?? "");
`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SupabaseClient = any;

async function upsertProjectFile(
  supabase: SupabaseClient,
  projectId: string,
  path: string,
  content: string,
  language = "typescript"
): Promise<void> {
  await supabase.from("project_files").upsert(
    { project_id: projectId, path, content, language },
    { onConflict: "project_id,path" }
  );
}

/**
 * Main entry — call after generated files are persisted.
 */
export async function autoWireBackend(opts: {
  supabase: SupabaseClient;
  projectId: string;
  userId: string;
  prompt: string;
  generatedFiles: GeneratedFile[];
  /** profiles.cloud_tool_permissions (raw JSONB) */
  cloudToolPermissionsRaw?: unknown;
  emit?: (status: string) => void;
}): Promise<AutoWireResult | null> {
  const { supabase, projectId, userId, prompt, generatedFiles } = opts;
  const emit = opts.emit ?? (() => {});
  const result: AutoWireResult = {
    intentDetected: false,
    cloudEnabled: false,
    credsInjected: false,
    scaffoldAdded: false,
    migrationsApplied: 0,
    migrationsPending: 0,
    notes: [],
  };

  // Default-on backend (Lovable Cloud parity): when LIFEMARK_CLOUD_DEFAULT_ON is
  // set, every new app gets a managed backend automatically — not only when the
  // prompt/output mentions one. Off by default (keyword detection) so it stays
  // opt-in: provisioning a backend per app costs resources, and the "database"
  // tool permission below can still force-skip it.
  const cloudDefaultOn =
    process.env.LIFEMARK_CLOUD_DEFAULT_ON === "true" || process.env.LIFEMARK_CLOUD_DEFAULT_ON === "1";
  if (!cloudDefaultOn && !detectBackendIntent(prompt, generatedFiles)) return null;
  result.intentDetected = true;

  const perms = parseCloudToolPermissions(opts.cloudToolPermissionsRaw);
  const dbPerm: CloudToolPermission = perms["database" as CloudToolId] ?? "ask";
  if (dbPerm === "never") {
    result.notes.push("Cloud database tools are set to Never — backend wiring skipped.");
    return result;
  }

  // ── Project cloud state ─────────────────────────────────────────────────────
  const { data: project } = await supabase
    .from("projects")
    .select("*")
    .eq("id", projectId)
    .single();
  if (!project) return result;

  let cloudUrl: string | null = project.cloud_supabase_url ?? null;
  const anonKey: string | null = project.cloud_anon_key ?? null;
  const serviceRef: string | null = project.cloud_project_ref ?? null;

  // ── 1. Auto-enable Cloud when the app needs a backend ──────────────────────
  if (!project.cloud_enabled) {
    emit("Connecting a backend to your app…");
    try {
      if (isManagementConfigured()) {
        const { ref } = await createManagedProject({
          projectId,
          region: project.cloud_region ?? "americas",
        });
        await supabase
          .from("projects")
          .update({
            cloud_enabled: true,
            cloud_region: project.cloud_region ?? "americas",
            cloud_instance: project.cloud_instance ?? "tiny",
            cloud_status: "provisioning",
            cloud_project_ref: ref,
            cloud_supabase_url: managedProjectUrl(ref),
            cloud_provisioned_at: new Date().toISOString(),
          })
          .eq("id", projectId);
        cloudUrl = managedProjectUrl(ref);
        result.cloudEnabled = true;
        result.notes.push(
          "Dedicated backend is booting (1–2 min). Credentials connect automatically when it's ready."
        );
      } else {
        await supabase
          .from("projects")
          .update({
            cloud_enabled: true,
            cloud_region: project.cloud_region ?? "americas",
            cloud_status: "active",
            cloud_provisioned_at: new Date().toISOString(),
          })
          .eq("id", projectId);
        result.cloudEnabled = true;
        result.notes.push(
          "Cloud enabled (local mode). Connect a Supabase project in the Cloud panel for live data."
        );
      }
    } catch (err) {
      result.notes.push(
        `Cloud auto-enable failed: ${err instanceof Error ? err.message : "unknown error"}`
      );
    }
  }

  // ── 2. Inject credentials into the generated app's .env.local ──────────────
  if (cloudUrl && anonKey) {
    const { data: envRow } = await supabase
      .from("project_files")
      .select("id, content")
      .eq("project_id", projectId)
      .eq("path", ENV_FILE_PATH)
      .maybeSingle();
    const env = parseEnvFile(envRow?.content ?? "");
    if (env.VITE_SUPABASE_URL !== cloudUrl || env.VITE_SUPABASE_ANON_KEY !== anonKey) {
      env.VITE_SUPABASE_URL = cloudUrl;
      env.VITE_SUPABASE_ANON_KEY = anonKey;
      await upsertProjectFile(supabase, projectId, ENV_FILE_PATH, serializeEnvFile(env), "plaintext");
      result.credsInjected = true;
      emit("Backend credentials connected ✓");
    } else {
      result.credsInjected = true; // already wired
    }
  }

  // ── 3. Scaffold the supabase client + dependency ────────────────────────────
  const usesBackendCode =
    generatedFiles.some((f) => /@supabase\/supabase-js|supabase\./.test(f.content ?? "")) ||
    BACKEND_INTENT_RE.test(prompt);
  if (usesBackendCode) {
    const { data: existing } = await supabase
      .from("project_files")
      .select("id")
      .eq("project_id", projectId)
      .in("path", ["src/lib/supabase.ts", "src/lib/supabase.js"])
      .limit(1)
      .maybeSingle();
    if (!existing) {
      await upsertProjectFile(supabase, projectId, "src/lib/supabase.ts", SUPABASE_CLIENT_SCAFFOLD);
      result.scaffoldAdded = true;
    }

    // Ensure @supabase/supabase-js in package.json
    const { data: pkgRow } = await supabase
      .from("project_files")
      .select("id, content")
      .eq("project_id", projectId)
      .eq("path", "package.json")
      .maybeSingle();
    if (pkgRow?.content) {
      try {
        const pkg = JSON.parse(pkgRow.content);
        pkg.dependencies = pkg.dependencies ?? {};
        if (!pkg.dependencies["@supabase/supabase-js"]) {
          pkg.dependencies["@supabase/supabase-js"] = "^2.45.0";
          await upsertProjectFile(supabase, projectId, "package.json", JSON.stringify(pkg, null, 2), "json");
        }
      } catch {
        /* malformed package.json — leave it to the validator */
      }
    }
  }

  // ── 4. Apply generated SQL migrations to the dedicated backend ─────────────
  const migrations = generatedFiles
    .filter((f) => /supabase\/migrations\/.*\.sql$/.test(f.path))
    .sort((a, b) => a.path.localeCompare(b.path));

  if (migrations.length > 0) {
    if (serviceRef && isManagementConfigured() && dbPerm === "allow") {
      for (const m of migrations) {
        emit(`Applying migration ${m.path.split("/").pop()}…`);
        const res = await runManagedSql(serviceRef, m.content);
        if (res.ok) {
          result.migrationsApplied += 1;
        } else {
          result.migrationsPending += 1;
          result.notes.push(`Migration ${m.path.split("/").pop()} failed: ${res.error?.slice(0, 160)}`);
        }
      }
      if (result.migrationsApplied > 0) emit(`Database schema updated (${result.migrationsApplied} migration${result.migrationsApplied === 1 ? "" : "s"}) ✓`);
    } else {
      result.migrationsPending = migrations.length;
      if (dbPerm !== "allow") {
        result.notes.push(
          `${migrations.length} migration${migrations.length === 1 ? "" : "s"} generated — set Database to "Always allow" in Cloud permissions to apply them automatically.`
        );
      } else {
        result.notes.push(
          `${migrations.length} migration${migrations.length === 1 ? "" : "s"} generated — they apply automatically once the backend finishes provisioning.`
        );
      }
    }
  }

  // touch userId so the param stays meaningful for future audit logging
  void userId;

  return result;
}
