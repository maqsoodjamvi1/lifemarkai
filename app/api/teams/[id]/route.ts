// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/teams/[id] — full team detail with members
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: team } = await (supabase as any)
    .from("teams")
    .select("*")
    .eq("id", id)
    .single();

  if (!team) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data: members } = await (supabase as any)
    .from("team_members")
    .select(`
      id, role, credits_used, credit_allowance, accepted_at, created_at, invited_email,
      profiles (id, full_name, email, avatar_url)
    `)
    .eq("team_id", id)
    .order("created_at");

  const { data: projects } = await (supabase as any)
    .from("projects")
    .select("id, name, status, framework, deployed_url, created_at")
    .eq("team_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ team, members: members ?? [], projects: projects ?? [] });
}

// PATCH /api/teams/[id] — update team (name, avatar)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const updates: Record<string, unknown> = {};
  if (body.name) updates.name = body.name;
  if (body.avatar_url !== undefined) updates.avatar_url = body.avatar_url;

  const { data, error } = await (supabase as any)
    .from("teams")
    .update(updates)
    .eq("id", id)
    .eq("owner_id", user.id)   // only owner
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ team: data });
}

// DELETE /api/teams/[id] — delete team (owner only)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { error } = await (supabase as any)
    .from("teams")
    .delete()
    .eq("id", id)
    .eq("owner_id", user.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
