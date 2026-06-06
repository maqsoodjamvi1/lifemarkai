import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data } = await (supabase as any)
    .from("workspace_branding")
    .select("*")
    .eq("team_id", id)
    .maybeSingle();

  return NextResponse.json({ branding: data ?? null });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    logo_url?: string;
    primary_color?: string;
    company_name?: string;
    support_email?: string;
    custom_domain?: string;
    hide_powered_by?: boolean;
  };

  await (supabase as any).from("workspace_branding").upsert({
    team_id:        id,
    logo_url:       body.logo_url       ?? null,
    primary_color:  body.primary_color  ?? "#8b5cf6",
    company_name:   body.company_name   ?? null,
    support_email:  body.support_email  ?? null,
    custom_domain:  body.custom_domain  ?? null,
    hide_powered_by: body.hide_powered_by ?? false,
    updated_at:     new Date().toISOString(),
  }, { onConflict: "team_id" });

  return NextResponse.json({ ok: true });
}
