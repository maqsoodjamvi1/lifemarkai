// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { assertChatAccess } from "@/lib/project/chat-access";

const EMPTY_STATE = {
  pinned_message_id: null as string | null,
  bookmarked_ids: [] as string[],
  prompt_queue: [] as unknown[],
  preview_annotations: [] as unknown[],
};

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await assertChatAccess(supabase, id, user.id, "read");
  if ("error" in access) return access.error;

  const { data, error } = await (supabase as any)
    .from("project_chat_state")
    .select("pinned_message_id, bookmarked_ids, prompt_queue, preview_annotations, updated_at")
    .eq("project_id", id)
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!data) {
    return NextResponse.json({ ...EMPTY_STATE, updated_at: null });
  }

  return NextResponse.json({
    pinned_message_id: data.pinned_message_id ?? null,
    bookmarked_ids: Array.isArray(data.bookmarked_ids) ? data.bookmarked_ids : [],
    prompt_queue: Array.isArray(data.prompt_queue) ? data.prompt_queue : [],
    preview_annotations: Array.isArray(data.preview_annotations) ? data.preview_annotations : [],
    updated_at: data.updated_at ?? null,
  });
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await assertChatAccess(supabase, id, user.id, "write");
  if ("error" in access) return access.error;

  let body: {
    pinned_message_id?: string | null;
    bookmarked_ids?: string[];
    prompt_queue?: unknown[];
    preview_annotations?: unknown[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { project_id: id };
  if ("pinned_message_id" in body) {
    patch.pinned_message_id = body.pinned_message_id ?? null;
  }
  if ("bookmarked_ids" in body) {
    if (!Array.isArray(body.bookmarked_ids)) {
      return NextResponse.json({ error: "bookmarked_ids must be an array" }, { status: 400 });
    }
    patch.bookmarked_ids = body.bookmarked_ids.filter((x) => typeof x === "string");
  }
  if ("prompt_queue" in body) {
    if (!Array.isArray(body.prompt_queue)) {
      return NextResponse.json({ error: "prompt_queue must be an array" }, { status: 400 });
    }
    patch.prompt_queue = body.prompt_queue.slice(0, 50);
  }
  if ("preview_annotations" in body) {
    if (!Array.isArray(body.preview_annotations)) {
      return NextResponse.json({ error: "preview_annotations must be an array" }, { status: 400 });
    }
    patch.preview_annotations = body.preview_annotations.slice(0, 200);
  }

  if (Object.keys(patch).length <= 1) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await (supabase as any)
    .from("project_chat_state")
    .upsert(patch, { onConflict: "project_id" })
    .select("pinned_message_id, bookmarked_ids, prompt_queue, preview_annotations, updated_at")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({
    pinned_message_id: data.pinned_message_id ?? null,
    bookmarked_ids: Array.isArray(data.bookmarked_ids) ? data.bookmarked_ids : [],
    prompt_queue: Array.isArray(data.prompt_queue) ? data.prompt_queue : [],
    preview_annotations: Array.isArray(data.preview_annotations) ? data.preview_annotations : [],
    updated_at: data.updated_at ?? null,
  });
}
