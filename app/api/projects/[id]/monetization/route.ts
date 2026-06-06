import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

interface Params { params: Promise<{ id: string }> }

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const [{ data: config }, { data: subscribers }] = await Promise.all([
    (supabase as any).from("app_monetization").select("*").eq("project_id", id).maybeSingle(),
    (supabase as any).from("app_subscriptions").select("subscriber_email,status,trial_end,current_period_end,created_at").eq("project_id", id).order("created_at", { ascending: false }),
  ]);

  return NextResponse.json({
    config: config ?? { enabled: false, price_cents: 900, currency: "usd", trial_days: 7 },
    subscribers: subscribers ?? [],
  });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Verify ownership
  const { data: project } = await (supabase as any).from("projects").select("user_id").eq("id", id).single();
  if (!project || project.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json() as {
    enabled: boolean;
    price_cents: number;
    currency: string;
    trial_days: number;
  };

  await (supabase as any).from("app_monetization").upsert({
    project_id: id,
    enabled: body.enabled,
    price_cents: body.price_cents,
    currency: body.currency,
    trial_days: body.trial_days,
    updated_at: new Date().toISOString(),
  }, { onConflict: "project_id" });

  return NextResponse.json({ ok: true });
}
