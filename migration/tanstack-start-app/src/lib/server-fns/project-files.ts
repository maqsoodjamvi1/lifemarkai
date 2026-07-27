/**
 * Native project files — editor hot path (list / upsert / patch / delete).
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
import { sanitizeGeneratedFile } from "@/lib/ai/html-sanity";

async function requireUser() {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  return { supabase, user };
}

export const listProjectFiles = createServerFn({ method: "GET" })
  .validator(zodValidator(z.object({ projectId: z.string().uuid() })))
  .handler(async ({ data }) => {
    const { supabase, user } = await requireUser();
    if (!user) return { status: "unauthorized" as const };

    const access = await getProjectAccess(supabase, data.projectId, user.id);
    if (!canReadProjectFiles(access)) return { status: "not_found" as const };

    const { data: files, error } = await (supabase as any)
      .from("project_files")
      .select("*")
      .eq("project_id", data.projectId)
      .order("path");

    if (error) return { status: "error" as const, message: error.message };
    return { status: "ok" as const, files: files ?? [] };
  });

const upsertFileSchema = z.object({
  projectId: z.string().uuid(),
  path: z.string().min(1),
  content: z.string().optional(),
  language: z.string().optional(),
});

export const upsertProjectFile = createServerFn({ method: "POST" })
  .validator(zodValidator(upsertFileSchema))
  .handler(async ({ data }) => {
    const { supabase, user } = await requireUser();
    if (!user) return { status: "unauthorized" as const };

    const access = await getProjectAccess(supabase, data.projectId, user.id);
    if (!canWriteProjectFiles(access)) return { status: "not_found" as const };

    const content = sanitizeGeneratedFile(data.path, String(data.content ?? ""));
    const { data: file, error } = await (supabase as any)
      .from("project_files")
      .upsert(
        {
          project_id: data.projectId,
          path: data.path,
          content,
          language: data.language ?? "plaintext",
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
  });

const patchFileSchema = z.object({
  projectId: z.string().uuid(),
  fileId: z.string().uuid(),
  content: z.string().optional(),
  path: z.string().optional(),
});

export const patchProjectFile = createServerFn({ method: "POST" })
  .validator(zodValidator(patchFileSchema))
  .handler(async ({ data }) => {
    const { supabase, user } = await requireUser();
    if (!user) return { status: "unauthorized" as const };

    const access = await getProjectAccess(supabase, data.projectId, user.id);
    if (!canWriteProjectFiles(access)) return { status: "not_found" as const };

    const updatePayload: Record<string, string> = {
      updated_at: new Date().toISOString(),
    };

    if (data.content !== undefined) {
      let effectivePath = data.path ?? "";
      if (!effectivePath) {
        const { data: row } = await (supabase as any)
          .from("project_files")
          .select("path")
          .eq("id", data.fileId)
          .eq("project_id", data.projectId)
          .maybeSingle();
        effectivePath = row?.path ?? "";
      }
      updatePayload.content = sanitizeGeneratedFile(effectivePath, String(data.content));
    }
    if (data.path !== undefined) updatePayload.path = data.path;

    const { data: file, error } = await (supabase as any)
      .from("project_files")
      .update(updatePayload)
      .eq("id", data.fileId)
      .eq("project_id", data.projectId)
      .select()
      .single();

    if (error || !file) {
      return { status: "error" as const, message: error?.message ?? "Update failed" };
    }
    return { status: "ok" as const, file };
  });

export const deleteProjectFile = createServerFn({ method: "POST" })
  .validator(
    zodValidator(
      z.object({
        projectId: z.string().uuid(),
        fileId: z.string().uuid(),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const { supabase, user } = await requireUser();
    if (!user) return { status: "unauthorized" as const };

    const access = await getProjectAccess(supabase, data.projectId, user.id);
    if (!canWriteProjectFiles(access)) return { status: "not_found" as const };

    const { error } = await (supabase as any)
      .from("project_files")
      .delete()
      .eq("id", data.fileId)
      .eq("project_id", data.projectId);

    if (error) return { status: "error" as const, message: error.message };
    return { status: "ok" as const, success: true };
  });
