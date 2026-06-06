import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET /api/teams — list teams the user belongs to
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: memberships } = await (supabase as any)
    .from("team_members")
    .select(`
      role, credits_used, credit_allowance, accepted_at,
      teams (id, name, slug, plan, credits, max_members, avatar_url, owner_id, created_at)
    `)
    .eq("user_id", user.id)
    .not("accepted_at", "is", null);

  return NextResponse.json({ teams: memberships ?? [] });
}

// POST /api/teams — create a new team
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name } = await req.json();
  if (!name?.trim()) return NextResponse.json({ error: "Team name required" }, { status: 400 });

  // Generate slug from name
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") + "-" + Date.now().toString(36);

  const { data: teamId, error } = await (supabase as any).rpc("create_team", {
    p_name: name.trim(),
    p_slug: slug,
    p_owner_id: user.id,
  });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const { data: team } = await (supabase as any).from("teams").select("*").eq("id", teamId).single();
  return NextResponse.json({ team }, { status: 201 });
}
