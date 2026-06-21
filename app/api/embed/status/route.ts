// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

// ─── GET /api/embed/status?projectId=...&email=... ──────────────────────────
// Public subscription-status check for the paywall embed. Returns the minimal
// information the paywall needs: whether this email has an active/trialing
// subscription and the app's price config.

export const runtime = "nodejs";

function cors(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function GET(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  const projectId = req.nextUrl.searchParams.get("projectId");
  const email = (req.nextUrl.searchParams.get("email") ?? "").toLowerCase();

  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400, headers: cors(origin) });
  }

  const supabase = await createAdminClient();
  const { data: config } = await supabase
    .from("app_monetization")
    .select("enabled, price_cents, currency, trial_days")
    .eq("project_id", projectId)
    .maybeSingle();

  if (!config?.enabled) {
    return NextResponse.json({ enabled: false, subscribed: true }, { headers: cors(origin) });
  }

  let subscribed = false;
  let status: string | null = null;
  if (email) {
    const { data: sub } = await supabase
      .from("app_subscriptions")
      .select("status")
      .eq("project_id", projectId)
      .eq("subscriber_email", email)
      .maybeSingle();
    status = sub?.status ?? null;
    subscribed = !!sub && ["active", "trialing"].includes(sub.status);
  }

  return NextResponse.json(
    {
      enabled: true,
      subscribed,
      status,
      price_cents: config.price_cents,
      currency: config.currency,
      trial_days: config.trial_days,
    },
    { headers: cors(origin) }
  );
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  return new Response(null, { status: 204, headers: { ...cors(origin), "Access-Control-Max-Age": "86400" } });
}
