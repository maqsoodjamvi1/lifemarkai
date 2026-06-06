import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string; flagId: string }> }

export async function PATCH(req: NextRequest, { params }: Params) {
  const { id, flagId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { enabled?: boolean; rollout_pct?: number };

  await (supabase as any)
    .from("feature_flags")
    .update({ ...body, updated_at: new Date().toISOString() })
    .eq("id", flagId)
    .eq("project_id", id);

  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: NextRequest, { params }: Params) {
  const { id, flagId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await (supabase as any)
    .from("feature_flags")
    .delete()
    .eq("id", flagId)
    .eq("project_id", id);

  return NextResponse.json({ ok: true });
}
