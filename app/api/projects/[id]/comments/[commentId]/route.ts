import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// PATCH /api/projects/[id]/comments/[commentId] — edit content OR toggle resolved
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const { id, commentId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};

  if (typeof body.content === "string") {
    if (body.content.trim().length === 0) {
      return NextResponse.json({ error: "Content cannot be empty" }, { status: 400 });
    }
    updates.content = body.content.trim();
  }

  if (typeof body.resolved === "boolean") {
    updates.resolved = body.resolved;
    updates.resolved_by = body.resolved ? user.id : null;
    updates.resolved_at = body.resolved ? new Date().toISOString() : null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "Nothing to update" }, { status: 400 });
  }

  const { data, error } = await (supabase as any)
    .from("project_comments")
    .update(updates)
    .eq("id", commentId)
    .eq("project_id", id)
    .select(`
      id,
      project_id,
      user_id,
      parent_id,
      content,
      resolved,
      resolved_by,
      resolved_at,
      created_at,
      updated_at,
      element_xpath,
      element_tag,
      page_path,
      element_preview,
      is_guest,
      guest_name
    `)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // FK is to auth.users — fetch profile separately for the author embed.
  let author: {
    id: string;
    full_name: string | null;
    avatar_url: string | null;
    email: string | null;
  } | null = null;
  if (data?.user_id) {
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("id, full_name, avatar_url, email")
      .eq("id", data.user_id)
      .maybeSingle();
    author = profile ?? null;
  }

  return NextResponse.json({ ...data, author });
}

// DELETE /api/projects/[id]/comments/[commentId]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; commentId: string }> }
) {
  const { id, commentId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await (supabase as any)
    .from("project_comments")
    .delete()
    .eq("id", commentId)
    .eq("project_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
