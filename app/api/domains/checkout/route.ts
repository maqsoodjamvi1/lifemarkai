// @ts-nocheck
/**
 * POST /api/domains/checkout — Stripe checkout for in-product domain purchase.
 * Body: { projectId, domain, priceCents, years?, contact }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { stripe, getOrCreateCustomer } from "@/lib/stripe/client";
import { getRegistrar, isPurchaseEnabled, type RegistrantContact } from "@/lib/domains/registrar";
import { requireFeature } from "@/lib/plans/gating";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const gate = await requireFeature(user.id, "workspace_domains");
  if (!gate.ok) {
    return NextResponse.json({ error: gate.error, requiredPlan: gate.requiredPlan }, { status: gate.status });
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 501 });
  }
  if (!isPurchaseEnabled()) {
    return NextResponse.json({ error: "Domain registrar is not configured" }, { status: 501 });
  }

  const { projectId, domain, priceCents, years = 1, contact } = (await req.json().catch(() => ({}))) as {
    projectId?: string;
    domain?: string;
    priceCents?: number;
    years?: number;
    contact?: RegistrantContact;
  };

  if (!projectId || !domain || !contact || !priceCents || priceCents < 100) {
    return NextResponse.json({ error: "projectId, domain, contact, and priceCents are required" }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const yr = Math.min(Math.max(years, 1), 10);
  const registrar = getRegistrar();
  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("stripe_customer_id, email, full_name")
    .eq("id", user.id)
    .single();

  let customerId = profile?.stripe_customer_id ?? "";
  if (!customerId) {
    customerId = await getOrCreateCustomer(user.id, profile?.email ?? user.email ?? "", profile?.full_name ?? undefined);
    await (supabase as any).from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
  }

  const { data: pending } = await (supabase as any)
    .from("domain_registrations")
    .upsert({
      project_id: projectId,
      user_id: user.id,
      domain: domain.toLowerCase(),
      registrar: registrar.id,
      status: "pending_payment",
      price_cents: priceCents,
      years: yr,
      auto_renew: true,
      metadata: { contact },
    }, { onConflict: "domain" })
    .select("id")
    .single();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode: "payment",
    payment_method_types: ["card"],
    line_items: [{
      price_data: {
        currency: "usd",
        unit_amount: priceCents,
        product_data: {
          name: `Domain registration — ${domain}`,
          description: `${yr}-year registration + auto DNS wiring`,
        },
      },
      quantity: 1,
    }],
    success_url: `${appUrl}/editor/${projectId}?panel=domains&domain_purchased=1`,
    cancel_url: `${appUrl}/editor/${projectId}?panel=domains&domain_cancelled=1`,
    metadata: {
      kind: "domain_purchase",
      userId: user.id,
      projectId,
      domain: domain.toLowerCase(),
      years: String(yr),
      registrationId: pending?.id ?? "",
      contactJson: JSON.stringify(contact),
    },
  });

  await (supabase as any)
    .from("domain_registrations")
    .update({ stripe_ref: session.id })
    .eq("domain", domain.toLowerCase());

  return NextResponse.json({ url: session.url, sessionId: session.id });
}
