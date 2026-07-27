import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
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

export const getChatState = createServerFn({ method: "GET" })
  .validator(zodValidator(z.object({ projectId: z.string().uuid() })))
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await assertChatAccess(supabase, data.projectId, user.id, "read");
    if (!access.ok) {
      return { status: "denied" as const, httpStatus: access.status, error: access.error };
    }

    const { data: row, error } = await (supabase as any)
      .from("project_chat_state")
      .select("pinned_message_id, bookmarked_ids, prompt_queue, preview_annotations, updated_at")
      .eq("project_id", data.projectId)
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
  });

export const patchChatState = createServerFn({ method: "POST" })
  .validator(
    zodValidator(
      z.object({
        projectId: z.string().uuid(),
        pinned_message_id: z.string().uuid().nullable().optional(),
        bookmarked_ids: z.array(z.string()).optional(),
        prompt_queue: z.array(z.unknown()).optional(),
        preview_annotations: z.array(z.unknown()).optional(),
      }),
    ),
  )
  .handler(async ({ data }) => {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await assertChatAccess(supabase, data.projectId, user.id, "write");
    if (!access.ok) {
      return { status: "denied" as const, httpStatus: access.status, error: access.error };
    }

    const patch: Record<string, unknown> = { project_id: data.projectId };
    if ("pinned_message_id" in data) patch.pinned_message_id = data.pinned_message_id ?? null;
    if ("bookmarked_ids" in data && data.bookmarked_ids) {
      patch.bookmarked_ids = data.bookmarked_ids.filter((x) => typeof x === "string");
    }
    if ("prompt_queue" in data && data.prompt_queue) {
      patch.prompt_queue = data.prompt_queue.slice(0, 50);
    }
    if ("preview_annotations" in data && data.preview_annotations) {
      patch.preview_annotations = data.preview_annotations.slice(0, 200);
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
  });
