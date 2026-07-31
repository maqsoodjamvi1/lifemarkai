/**
 * Native project env vars (.env.local in project_files). Values never returned in clear.
 * Plain helpers — not createServerFn (see project-files.ts).
 */
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import {
  canReadProjectFiles,
  canWriteProjectFiles,
  getProjectAccess,
} from "@/lib/project/access";
import { ENV_FILE_PATH, parseEnvFile, serializeEnvFile } from "@/lib/project/env-file";

async function loadEnvRecord(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectId: string,
) {
  const { data } = await (supabase as any)
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
  const row = await loadEnvRecord(supabase, input.projectId);
  const vars = parseEnvFile(row?.content ?? "");
  vars[key] = input.value;
  const content = serializeEnvFile(vars);

  if (row) {
    await (supabase as any)
      .from("project_files")
      .update({ content, updated_at: new Date().toISOString() })
      .eq("id", row.id);
  } else {
    await (supabase as any).from("project_files").insert({
      project_id: input.projectId,
      path: ENV_FILE_PATH,
      content,
      language: "plaintext",
    });
  }

  return { status: "ok" as const, key };
}

export async function deleteEnvVar(input: { projectId: string; key: string }) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const access = await getProjectAccess(supabase, input.projectId, user.id);
  if (!canWriteProjectFiles(access)) return { status: "not_found" as const };

  const key = input.key.trim();
  const row = await loadEnvRecord(supabase, input.projectId);
  if (!row) return { status: "ok" as const, key, deleted: false };

  const vars = parseEnvFile(row.content ?? "");
  if (!(key in vars)) return { status: "ok" as const, key, deleted: false };
  delete vars[key];
  const content = serializeEnvFile(vars);
  await (supabase as any)
    .from("project_files")
    .update({ content, updated_at: new Date().toISOString() })
    .eq("id", row.id);

  return { status: "ok" as const, key, deleted: true };
}
