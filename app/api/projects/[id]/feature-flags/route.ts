import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await (supabase as any)
    .from("feature_flags")
    .select("*")
    .eq("project_id", id)
    .order("created_at", { ascending: false });

  return NextResponse.json({ flags: data ?? [] });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { key: string; description?: string; enabled?: boolean; rollout_pct?: number };

  const { data, error } = await (supabase as any)
    .from("feature_flags")
    .insert({
      project_id:  id,
      key:         body.key,
      description: body.description ?? null,
      enabled:     body.enabled ?? false,
      rollout_pct: body.rollout_pct ?? 100,
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ flag: data });
}
