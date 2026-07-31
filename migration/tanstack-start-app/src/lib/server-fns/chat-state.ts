/**
 * Native project chat-state — plain helpers for API routes.
 * (createServerFn from route handlers 500s in production — see project-files.ts)
 */
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { assertChatAccess } from "@/lib/project/chat-access";

const EMPTY_STATE = {
  pinned_message_id: null as string | null,
  bookmarked_ids: [] as string[],
  prompt_queue: [] as unknown[],
  preview_annotations: [] as unknown[],
  updated_at: null as string | null,
};

export async function getChatState(input: { projectId: string }) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const access = await assertChatAccess(supabase, input.projectId, user.id, "read");
  if (!access.ok) {
    return { status: "denied" as const, httpStatus: access.status, error: access.error };
  }

  const { data: row, error } = await (supabase as any)
    .from("project_chat_state")
    .select("pinned_message_id, bookmarked_ids, prompt_queue, preview_annotations, updated_at")
    .eq("project_id", input.projectId)
    .maybeSingle();

  if (error) return { status: "error" as const, message: error.message };
  if (!row) return { status: "ok" as const, state: EMPTY_STATE };

  return {
    status: "ok" as const,
    state: {
      pinned_message_id: row.pinned_message_id ?? null,
      bookmarked_ids: Array.isArray(row.bookmarked_ids) ? row.bookmarked_ids.map(String) : [],
      prompt_queue: Array.isArray(row.prompt_queue) ? row.prompt_queue : [],
      preview_annotations: Array.isArray(row.preview_annotations)
        ? row.preview_annotations
        : [],
      updated_at: row.updated_at ?? null,
    },
  };
}

export async function patchChatState(input: {
  projectId: string;
  pinned_message_id?: string | null;
  bookmarked_ids?: string[];
  prompt_queue?: unknown[];
  preview_annotations?: unknown[];
}) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const access = await assertChatAccess(supabase, input.projectId, user.id, "write");
  if (!access.ok) {
    return { status: "denied" as const, httpStatus: access.status, error: access.error };
  }

  const patch: Record<string, unknown> = { project_id: input.projectId };
  if ("pinned_message_id" in input) patch.pinned_message_id = input.pinned_message_id ?? null;
  if ("bookmarked_ids" in input && input.bookmarked_ids) {
    patch.bookmarked_ids = input.bookmarked_ids.filter((x) => typeof x === "string");
  }
  if ("prompt_queue" in input && input.prompt_queue) {
    patch.prompt_queue = input.prompt_queue.slice(0, 50);
  }
  if ("preview_annotations" in input && input.preview_annotations) {
    patch.preview_annotations = input.preview_annotations.slice(0, 200);
  }
  if (Object.keys(patch).length <= 1) {
    return { status: "error" as const, message: "No fields to update" };
  }

  const { data: row, error } = await (supabase as any)
    .from("project_chat_state")
    .upsert(patch, { onConflict: "project_id" })
    .select("pinned_message_id, bookmarked_ids, prompt_queue, preview_annotations, updated_at")
    .single();

  if (error || !row) {
    return { status: "error" as const, message: error?.message ?? "Update failed" };
  }

  return {
    status: "ok" as const,
    state: {
      pinned_message_id: row.pinned_message_id ?? null,
      bookmarked_ids: Array.isArray(row.bookmarked_ids) ? row.bookmarked_ids.map(String) : [],
      prompt_queue: Array.isArray(row.prompt_queue) ? row.prompt_queue : [],
      preview_annotations: Array.isArray(row.preview_annotations)
        ? row.preview_annotations
        : [],
      updated_at: row.updated_at ?? null,
    },
  };
}
