import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

/**
 * GET /api/skills
 * Returns user's custom skills + built-in skills
 *
 * POST /api/skills
 * Create a new skill
 *
 * PATCH /api/skills?id=xxx
 * Update a skill
 *
 * DELETE /api/skills?id=xxx
 * Delete a skill
 */

export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [userSkills, builtinSkills] = await Promise.all([
    (supabase as any)
      .from("workspace_skills")
      .select("*")
      .eq("user_id", user.id)
      .order("use_count", { ascending: false })
      .order("created_at", { ascending: false }),
    (supabase as any)
      .from("builtin_skills")
      .select("*")
      .order("sort_order", { ascending: true }),
  ]);

  return NextResponse.json({
    custom: userSkills.data ?? [],
    builtin: builtinSkills.data ?? [],
  });
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { name?: string; description?: string; prompt?: string; icon?: string; tags?: string[] };
  const { name, description, prompt, icon = "⚡", tags = [] } = body;

  if (!name?.trim() || !prompt?.trim()) {
    return NextResponse.json({ error: "name and prompt are required" }, { status: 400 });
  }

  const { data, error } = await (supabase as any)
    .from("workspace_skills")
    .insert({ user_id: user.id, name: name.trim(), description: description?.trim() ?? null, prompt: prompt.trim(), icon, tags })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data, { status: 201 });
}

export async function PATCH(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { name?: string; description?: string; prompt?: string; icon?: string; tags?: string[]; incrementUse?: boolean };

  if (body.incrementUse) {
    // Just increment use_count (called when applying a skill).
    // Note: supabase-js rpc() reports failures via `error`, it does NOT throw —
    // the old .catch() fallback never ran (and used a nonexistent .raw() API).
    const { error: rpcError } = await (supabase as any).rpc("increment_skill_use", { skill_id: id });
    if (rpcError) console.warn("[skills] increment_skill_use failed:", rpcError.message);
    return NextResponse.json({ ok: true });
  }

  const updates: Record<string, unknown> = {};
  if (body.name !== undefined) updates.name = body.name.trim();
  if (body.description !== undefined) updates.description = body.description?.trim() ?? null;
  if (body.prompt !== undefined) updates.prompt = body.prompt.trim();
  if (body.icon !== undefined) updates.icon = body.icon;
  if (body.tags !== undefined) updates.tags = body.tags;

  const { data, error } = await (supabase as any)
    .from("workspace_skills")
    .update(updates)
    .eq("id", id)
    .eq("user_id", user.id)
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await (supabase as any)
    .from("workspace_skills")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
