import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string }> }

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { userId, cap } = await req.json() as { userId: string; cap: number };

  const { error } = await (supabase as any)
    .from("workspace_member_caps")
    .upsert({
      team_id: id,
      user_id: userId,
      monthly_cap: cap ?? 0,
      updated_at: new Date().toISOString(),
    }, { onConflict: "team_id,user_id" });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
