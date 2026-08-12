/**
 * Native project env vars (.env.local in project_files). Values never returned in clear.
 * Plain helpers — not createServerFn (see project-files.ts).
 */
import { createClient } from "../supabase/server.ts";
import { getServerUser } from "../supabase/server-user.ts";
import {
canReadProjectFiles,
canWriteProjectFiles,
getProjectAccess,
} from "@/lib/project/access";
import { ENV_FILE_PATH,parseEnvFile,serializeEnvFile } from "../project/env-file.ts";

async function loadEnvRecord(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
) {
  const { data } = await supabase
    .from("project_files")
    .select("id, content")
    .eq("project_id", projectId)
    .eq("path", ENV_FILE_PATH)
    .maybeSingle();
  return data as { id: string; content: string } | null;
}

export async function listEnvKeys(input: { projectId: string }) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const access = await getProjectAccess(supabase, input.projectId, user.id);
  if (!canReadProjectFiles(access)) return { status: "not_found" as const };

  const row = await loadEnvRecord(supabase, input.projectId);
  const vars = parseEnvFile(row?.content ?? "");
  return {
    status: "ok" as const,
    envVars: Object.keys(vars).map((key) => ({ key, value: "***" })),
  };
}

/**
 * Serializes env writes for one project within this process.
 *
 * Every write here is a read-modify-write of a SINGLE row: load .env.local,
 * parse it, set one key, serialize, write it back. Run two of those
 * concurrently and both read the same pre-write content, so the second write
 * erases the first key. That is not hypothetical — the connectors panel fires
 * a connector's fields with `Promise.all`, so a three-field integration
 * (publishable key, secret key, webhook secret) persisted exactly one of
 * them, the tile said "Connected", and on the next mount its own
 * `fields.every(...)` check found the keys missing and flipped it back with no
 * explanation.
 *
 * A per-project promise chain makes concurrent calls queue instead of
 * interleave. It does not help across server instances — that needs a
 * transaction or an atomic column update — but the observed corruption is
 * same-instance, because it comes from one browser firing one `Promise.all`.
 */
const envWriteChains = new Map<string, Promise<unknown>>();

function withEnvLock<T>(projectId: string, work: () => Promise<T>): Promise<T> {
  const previous = envWriteChains.get(projectId) ?? Promise.resolve();
  const next = previous.then(work, work);
  // Never let a rejection poison the chain for later writers.
  envWriteChains.set(
    projectId,
    next.then(
      () => undefined,
      () => undefined,
    ),
  );
  return next;
}

export async function upsertEnvVar(input: {
  projectId: string;
  key: string;
  value: string;
}) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const access = await getProjectAccess(supabase, input.projectId, user.id);
  if (!canWriteProjectFiles(access)) return { status: "not_found" as const };

  const key = input.key.trim();

  return withEnvLock(input.projectId, async () => {
    const row = await loadEnvRecord(supabase, input.projectId);
    const vars = parseEnvFile(row?.content ?? "");
    vars[key] = input.value;
    const content = serializeEnvFile(vars);

    // The result was discarded, so the route above answered `{ ok: true }` for
    // a write that never landed — on the panel where the values are API keys.
    const { error } = row
      ? await supabase
          .from("project_files")
          .update({ content, updated_at: new Date().toISOString() })
          .eq("id", row.id)
      : await supabase.from("project_files").insert({
          project_id: input.projectId,
          path: ENV_FILE_PATH,
          content,
          language: "plaintext",
        });

    if (error) {
      return {
        status: "error" as const,
        key,
        message: error.message ?? "Could not save the variable.",
      };
    }
    return { status: "ok" as const, key };
  });
}

export async function deleteEnvVar(input: { projectId: string; key: string }) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const access = await getProjectAccess(supabase, input.projectId, user.id);
  if (!canWriteProjectFiles(access)) return { status: "not_found" as const };

  const key = input.key.trim();

  return withEnvLock(input.projectId, async () => {
    const row = await loadEnvRecord(supabase, input.projectId);
    if (!row) return { status: "ok" as const, key, deleted: false };

    const vars = parseEnvFile(row.content ?? "");
    if (!(key in vars)) return { status: "ok" as const, key, deleted: false };
    delete vars[key];
    const content = serializeEnvFile(vars);
    const { error } = await supabase
      .from("project_files")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("id", row.id);

    if (error) {
      return {
        status: "error" as const,
        key,
        deleted: false,
        message: error.message ?? "Could not remove the variable.",
      };
    }
    return { status: "ok" as const, key, deleted: true };
  });
}
