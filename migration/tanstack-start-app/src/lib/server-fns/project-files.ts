/**
 * Native project files — editor hot path (list / upsert / patch / delete).
 *
 * These are PLAIN server-side functions, not createServerFn wrappers. They are
 * only ever called from the /api/projects/$id/files route handler, and calling
 * a createServerFn from a server route handler in the production build goes
 * through the server-fn HTTP fetcher, which threw an unhandled HTTPError and
 * turned every editor save into a 500. Plain functions have no such indirection.
 */
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import {
  canReadProjectFiles,
  canWriteProjectFiles,
  getProjectAccess,
} from "@/lib/project/access";
import { sanitizeGeneratedFile } from "@/lib/ai/html-sanity";

async function requireUser() {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  return { supabase, user };
}

export async function listProjectFiles(projectId: string) {
  const { supabase, user } = await requireUser();
  if (!user) return { status: "unauthorized" as const };

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canReadProjectFiles(access)) return { status: "not_found" as const };

  const { data: files, error } = await (supabase as any)
    .from("project_files")
    .select("*")
    .eq("project_id", projectId)
    .order("path");

  if (error) return { status: "error" as const, message: error.message };
  return { status: "ok" as const, files: files ?? [] };
}

export async function upsertProjectFile(input: {
  projectId: string;
  path: string;
  content?: string;
  language?: string;
}) {
  const { supabase, user } = await requireUser();
  if (!user) return { status: "unauthorized" as const };

  const access = await getProjectAccess(supabase, input.projectId, user.id);
  if (!canWriteProjectFiles(access)) return { status: "not_found" as const };

  const content = sanitizeGeneratedFile(input.path, String(input.content ?? ""));
  const { data: file, error } = await (supabase as any)
    .from("project_files")
    .upsert(
      {
        project_id: input.projectId,
        path: input.path,
        content,
        language: input.language ?? "plaintext",
        updated_at: new Date().toISOString(),
      },
      { onConflict: "project_id,path" },
    )
    .select()
    .single();

  if (error || !file) {
    return { status: "error" as const, message: "Could not save the file. Try again." };
  }
  return { status: "ok" as const, file };
}

export async function patchProjectFile(input: {
  projectId: string;
  fileId: string;
  content?: string;
  path?: string;
}) {
  const { supabase, user } = await requireUser();
  if (!user) return { status: "unauthorized" as const };

  const access = await getProjectAccess(supabase, input.projectId, user.id);
  if (!canWriteProjectFiles(access)) return { status: "not_found" as const };

  const updatePayload: Record<string, string> = {
    updated_at: new Date().toISOString(),
  };

  if (input.content !== undefined) {
    let effectivePath = input.path ?? "";
    if (!effectivePath) {
      const { data: row } = await (supabase as any)
        .from("project_files")
        .select("path")
        .eq("id", input.fileId)
        .eq("project_id", input.projectId)
        .maybeSingle();
      effectivePath = row?.path ?? "";
    }
    updatePayload.content = sanitizeGeneratedFile(effectivePath, String(input.content));
  }
  if (input.path !== undefined) updatePayload.path = input.path;

  const { data: file, error } = await (supabase as any)
    .from("project_files")
    .update(updatePayload)
    .eq("id", input.fileId)
    .eq("project_id", input.projectId)
    .select()
    .single();

  if (error || !file) {
    return { status: "error" as const, message: error?.message ?? "Update failed" };
  }
  return { status: "ok" as const, file };
}

export async function deleteProjectFile(input: { projectId: string; fileId: string }) {
  const { supabase, user } = await requireUser();
  if (!user) return { status: "unauthorized" as const };

  const access = await getProjectAccess(supabase, input.projectId, user.id);
  if (!canWriteProjectFiles(access)) return { status: "not_found" as const };

  const { error } = await (supabase as any)
    .from("project_files")
    .delete()
    .eq("id", input.fileId)
    .eq("project_id", input.projectId);

  if (error) return { status: "error" as const, message: error.message };
  return { status: "ok" as const, success: true };
}
