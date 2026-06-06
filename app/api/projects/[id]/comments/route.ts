import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

// GET /api/projects/[id]/comments — list all top-level comments + replies
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data, error } = await (supabase as any)
    .from("project_comments")
    .select(`
      *,
      author:profiles!project_comments_user_id_fkey(id, full_name, avatar_url, email)
    `)
    .eq("project_id", id)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data ?? []);
}

// POST /api/projects/[id]/comments — create a comment or reply
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { content, parent_id } = body;

  if (!content || typeof content !== "string" || content.trim().length === 0) {
    return NextResponse.json({ error: "Content is required" }, { status: 400 });
  }
  if (content.length > 4000) {
    return NextResponse.json({ error: "Comment too long (max 4000 chars)" }, { status: 400 });
  }

  const { data, error } = await (supabase as any)
    .from("project_comments")
    .insert({
      project_id: id,
      user_id: user.id,
      content: content.trim(),
      parent_id: parent_id ?? null,
    })
    .select(`
      *,
      author:profiles!project_comments_user_id_fkey(id, full_name, avatar_url, email)
    `)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json(data, { status: 201 });
}
