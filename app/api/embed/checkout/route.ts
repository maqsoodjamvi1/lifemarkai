// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/server";

// ─── POST /api/embed/checkout ────────────────────────────────────────────────
// Public checkout endpoint for monetized apps built with LifemarkAI.
// The paywall embed (public/embed/paywall.js) calls this from the deployed
// app; it creates a Stripe Checkout Session for the app's subscription.
//
// Request:  { projectId: string, email: string, successUrl?: string, cancelUrl?: string }
// Response: { url: string }  — Stripe-hosted checkout page
//
// Product/price objects are created lazily on first checkout and persisted to
// app_monetization (migration 025).

export const runtime = "nodejs";

function cors(origin: string): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

export async function POST(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";

  let body: { projectId?: string; email?: string; successUrl?: string; cancelUrl?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: cors(origin) });
  }
  const { projectId, email, successUrl, cancelUrl } = body;
  if (!projectId || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return NextResponse.json({ error: "projectId and a valid email are required" }, { status: 400, headers: cors(origin) });
  }

  const supabase = await createAdminClient();

  const [{ data: config }, { data: project }] = await Promise.all([
    supabase.from("app_monetization").select("*").eq("project_id", projectId).maybeSingle(),
    supabase.from("projects").select("id, name, deployed_url").eq("id", projectId).single(),
  ]);

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404, headers: cors(origin) });
  if (!config?.enabled || !config.price_cents || config.price_cents <= 0) {
    return NextResponse.json({ error: "Payments are not enabled for this app" }, { status: 403, headers: cors(origin) });
  }

  // Already subscribed?
  const { data: existing } = await supabase
    .from("app_subscriptions")
    .select("status")
    .eq("project_id", projectId)
    .eq("subscriber_email", email.toLowerCase())
    .maybeSingle();
  if (existing && ["active", "trialing"].includes(existing.status)) {
    return NextResponse.json({ error: "Already subscribed", alreadySubscribed: true }, { status: 409, headers: cors(origin) });
  }

  try {
    // Lazily create the Stripe product/price for this app
    let priceId: string | null = config.stripe_price_id;
    if (!priceId) {
      const product = config.stripe_product_id
        ? { id: config.stripe_product_id }
        : await stripe.products.create({
            name: `${project.name} — subscription`,
            metadata: { lifemark_project_id: projectId },
          });
      const price = await stripe.prices.create({
        product: product.id,
        unit_amount: config.price_cents,
        currency: config.currency ?? "usd",
        recurring: { interval: "month" },
        metadata: { lifemark_project_id: projectId },
      });
      priceId = price.id;
      await supabase
        .from("app_monetization")
        .update({ stripe_product_id: product.id, stripe_price_id: priceId, updated_at: new Date().toISOString() })
        .eq("project_id", projectId);
    }

    const appUrl = project.deployed_url ?? process.env.NEXT_PUBLIC_APP_URL ?? "";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer_email: email.toLowerCase(),
      line_items: [{ price: priceId, quantity: 1 }],
      ...(config.trial_days > 0
        ? { subscription_data: { trial_period_days: config.trial_days, metadata: { kind: "app_subscription", lifemark_project_id: projectId, subscriber_email: email.toLowerCase() } } }
        : { subscription_data: { metadata: { kind: "app_subscription", lifemark_project_id: projectId, subscriber_email: email.toLowerCase() } } }),
      success_url: successUrl ?? `${appUrl}?subscribed=1`,
      cancel_url: cancelUrl ?? appUrl,
      metadata: {
        kind: "app_subscription",
        lifemark_project_id: projectId,
        subscriber_email: email.toLowerCase(),
      },
    });

    return NextResponse.json({ url: session.url }, { headers: cors(origin) });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Checkout failed" },
      { status: 502, headers: cors(origin) }
    );
  }
}

export async function OPTIONS(req: NextRequest) {
  const origin = req.headers.get("origin") ?? "*";
  return new Response(null, { status: 204, headers: { ...cors(origin), "Access-Control-Max-Age": "86400" } });
}
