import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string }> }

export async function GET(_: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Fetch pool
  const { data: pool } = await (supabase as any)
    .from("workspace_credit_pools")
    .select("*")
    .eq("team_id", id)
    .maybeSingle();

  // Fetch members with their usage
  const { data: members } = await (supabase as any)
    .from("team_members")
    .select("user_id, role, profiles(email, full_name)")
    .eq("team_id", id);

  const { data: caps } = await (supabase as any)
    .from("workspace_member_caps")
    .select("*")
    .eq("team_id", id);

  // Aggregate per-member usage from credit_logs this month
  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { data: logs } = await (supabase as any)
    .from("credit_logs")
    .select("user_id, amount")
    .gte("created_at", startOfMonth.toISOString())
    .in("user_id", (members ?? []).map((m: { user_id: string }) => m.user_id));

  // Sum usage per user
  const usageMap: Record<string, number> = {};
  for (const log of (logs ?? [])) {
    const uid = log.user_id as string;
    usageMap[uid] = (usageMap[uid] ?? 0) + Math.abs(log.amount as number);
  }

  const capMap: Record<string, number> = {};
  for (const cap of (caps ?? [])) {
    capMap[cap.user_id as string] = cap.monthly_cap as number;
  }

  const memberData = (members ?? []).map((m: { user_id: string; role: string; profiles?: { email?: string; full_name?: string } | null }) => ({
    userId: m.user_id,
    email: m.profiles?.email ?? "",
    name: m.profiles?.full_name ?? m.profiles?.email ?? "Member",
    role: m.role,
    used: usageMap[m.user_id] ?? 0,
    cap: capMap[m.user_id] ?? 0,
  }));

  return NextResponse.json({
    teamId: id,
    totalCredits: pool?.total_credits ?? 0,
    usedCredits: pool?.used_credits ?? 0,
    resetDay: pool?.reset_day ?? 1,
    members: memberData,
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { amount } = await req.json() as { amount: number };
  if (!amount || amount <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });

  await (supabase as any).rpc("add_workspace_credits", { p_team_id: id, p_amount: amount });
  return NextResponse.json({ ok: true });
}
