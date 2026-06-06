import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// POST — transfer credits to another user or team pool
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { toUserId, toTeamId, amount, note } = await req.json();

  if (!amount || amount <= 0) return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  if (!toUserId && !toTeamId) return NextResponse.json({ error: "Recipient required" }, { status: 400 });

  const { data: ok, error } = await (supabase as any).rpc("transfer_credits", {
    p_from_user_id: user.id,
    p_to_user_id: toUserId ?? null,
    p_to_team_id: toTeamId ?? null,
    p_amount: amount,
    p_note: note ?? null,
  });

  if (error || !ok) {
    return NextResponse.json({ error: "Transfer failed — insufficient credits or invalid recipient" }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
