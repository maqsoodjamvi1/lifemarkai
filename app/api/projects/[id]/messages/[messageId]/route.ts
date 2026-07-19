// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextResponse } from "next/server";
import { assertChatAccess } from "@/lib/project/chat-access";

/** Patch rating / metadata (reactions, branch markers) on a single message. */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const { id, messageId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await assertChatAccess(supabase, id, user.id, "write");
  if ("error" in access) return access.error;

  let body: {
    rating?: 1 | -1 | null;
    metadata?: Record<string, unknown> | null;
    mergeMetadata?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { data: row, error: fetchError } = await (supabase as any)
    .from("messages")
    .select("id, metadata, rating")
    .eq("id", messageId)
    .eq("project_id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const update: Record<string, unknown> = {};
  if ("rating" in body) {
    if (body.rating !== null && body.rating !== 1 && body.rating !== -1) {
      return NextResponse.json({ error: "rating must be 1, -1, or null" }, { status: 400 });
    }
    update.rating = body.rating ?? null;
  }
  if ("metadata" in body) {
    if (body.mergeMetadata !== false && body.metadata && typeof body.metadata === "object") {
      const prev = (row.metadata && typeof row.metadata === "object" ? row.metadata : {}) as Record<
        string,
        unknown
      >;
      update.metadata = { ...prev, ...body.metadata };
    } else {
      update.metadata = body.metadata ?? null;
    }
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { data, error } = await (supabase as any)
    .from("messages")
    .update(update)
    .eq("id", messageId)
    .eq("project_id", id)
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, message: data });
}

/** Delete a single message from a project conversation. */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string; messageId: string }> },
) {
  const { id, messageId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await assertChatAccess(supabase, id, user.id, "write");
  if ("error" in access) return access.error;

  const { data: row, error: fetchError } = await (supabase as any)
    .from("messages")
    .select("id")
    .eq("id", messageId)
    .eq("project_id", id)
    .maybeSingle();

  if (fetchError) {
    return NextResponse.json({ error: fetchError.message }, { status: 500 });
  }
  if (!row) {
    return NextResponse.json({ error: "Message not found" }, { status: 404 });
  }

  const { error } = await (supabase as any)
    .from("messages")
    .delete()
    .eq("id", messageId)
    .eq("project_id", id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
