// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// GET — team credit pool + member usage
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: team } = await (supabase as any)
    .from("teams")
    .select("credits, plan, max_members")
    .eq("id", id)
    .single();

  const { data: members } = await (supabase as any)
    .from("team_members")
    .select("user_id, credits_used, credit_allowance, role, profiles(full_name, email, avatar_url)")
    .eq("team_id", id)
    .not("accepted_at", "is", null);

  const { data: logs } = await (supabase as any)
    .from("credit_logs")
    .select("amount, action, description, created_at")
    .ilike("description", `%${id}%`)
    .order("created_at", { ascending: false })
    .limit(50);

  return NextResponse.json({ pool: team?.credits ?? 0, members: members ?? [], logs: logs ?? [] });
}

// POST — add credits to team pool (via transfer from user's personal balance)
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { amount, note } = await req.json();
  if (!amount || amount <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });

  const { data: ok, error } = await (supabase as any).rpc("transfer_credits", {
    p_from_user_id: user.id,
    p_to_team_id: id,
    p_amount: amount,
    p_note: note ?? `Topped up team pool`,
  });

  if (error || !ok) return NextResponse.json({ error: "Insufficient credits or transfer failed" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
