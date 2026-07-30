/**
 * Native project env vars (.env.local in project_files). Values never returned in clear.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
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

export const listEnvKeys = createServerFn({ method: "GET" })
  .validator(zodValidator(z.object({ projectId: z.string().uuid() })))
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await getProjectAccess(supabase, data.projectId, user.id);
    if (!canReadProjectFiles(access)) return { status: "not_found" as const };

    const row = await loadEnvRecord(supabase, data.projectId);
    const vars = parseEnvFile(row?.content ?? "");
    return {
      status: "ok" as const,
      envVars: Object.keys(vars).map((key) => ({ key, value: "***" })),
    };
  });

export const upsertEnvVar = createServerFn({ method: "POST" })
  .validator(
    zodValidator(
      z.object({
        projectId: z.string().uuid(),
        key: z.string().min(1),
        value: z.string(),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await getProjectAccess(supabase, data.projectId, user.id);
    if (!canWriteProjectFiles(access)) return { status: "not_found" as const };

    const key = data.key.trim();
    const row = await loadEnvRecord(supabase, data.projectId);
    const vars = parseEnvFile(row?.content ?? "");
    vars[key] = data.value;
    const content = serializeEnvFile(vars);

    if (row) {
      await (supabase as any)
        .from("project_files")
        .update({ content, updated_at: new Date().toISOString() })
        .eq("id", row.id);
    } else {
      await (supabase as any).from("project_files").insert({
        project_id: data.projectId,
        path: ENV_FILE_PATH,
        content,
        language: "plaintext",
      });
    }

    return { status: "ok" as const, key };
  });

export const deleteEnvVar = createServerFn({ method: "POST" })
  .validator(
    zodValidator(
      z.object({
        projectId: z.string().uuid(),
        key: z.string().min(1),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await getProjectAccess(supabase, data.projectId, user.id);
    if (!canWriteProjectFiles(access)) return { status: "not_found" as const };

    const key = data.key.trim();
    const row = await loadEnvRecord(supabase, data.projectId);
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
  });
