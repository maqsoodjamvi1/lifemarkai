import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

// PATCH /api/snippets/[id] — edit title, content, tags, is_public
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const patch: Record<string, unknown> = {};

  if (typeof body.title === "string") {
    const t = body.title.trim();
    if (!t || t.length > 100) {
      return NextResponse.json({ error: "Title must be 1–100 characters." }, { status: 400 });
    }
    patch.title = t;
  }
  if (typeof body.content === "string") {
    const c = body.content.trim();
    if (!c || c.length > 4000) {
      return NextResponse.json({ error: "Content must be 1–4000 characters." }, { status: 400 });
    }
    patch.content = c;
  }
  if (Array.isArray(body.tags)) patch.tags = body.tags.map(String);
  if (typeof body.is_public === "boolean") patch.is_public = body.is_public;

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const { data, error } = await (supabase as any)
    .from("prompt_snippets")
    .update(patch)
    .eq("id", id)
    .eq("user_id", user.id)          // RLS + ownership
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Not found or forbidden" }, { status: 404 });

  return NextResponse.json(data);
}

// DELETE /api/snippets/[id]
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await (supabase as any)
    .from("prompt_snippets")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return new NextResponse(null, { status: 204 });
}

// POST /api/snippets/[id]/use — increment use_count (anyone who can view may call this)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Use an RPC to safely increment without race conditions
  const { error } = await (supabase as any).rpc("increment_snippet_use_count", { snippet_id: id });
  if (error) {
    // Fallback: manual increment (less safe but works without RPC)
    const { data: existing } = await (supabase as any)
      .from("prompt_snippets")
      .select("use_count")
      .eq("id", id)
      .maybeSingle();
    if (existing) {
      await (supabase as any)
        .from("prompt_snippets")
        .update({ use_count: (existing.use_count ?? 0) + 1 })
        .eq("id", id);
    }
  }

  return new NextResponse(null, { status: 204 });
}
