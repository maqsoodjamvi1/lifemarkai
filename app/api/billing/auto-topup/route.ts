// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";
import { stripe } from "@/lib/stripe/client";
import { CREDIT_PACKS } from "@/lib/stripe/plans";

// GET — return current auto top-up settings for the signed-in user
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select(
      "auto_topup_enabled, auto_topup_threshold, auto_topup_amount, " +
      "auto_topup_pm_id, stripe_customer_id"
    )
    .eq("id", user.id)
    .single();

  // Fetch saved card details from Stripe if we have a PM ID
  let card: { brand: string; last4: string; expMonth: number; expYear: number } | null = null;
  if (profile?.auto_topup_pm_id) {
    try {
      const pm = await stripe.paymentMethods.retrieve(profile.auto_topup_pm_id);
      if (pm.card) {
        card = {
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year,
        };
      }
    } catch {
      // PM may have been deleted — clear it
      await (createAdminClient() as any)
        .from("profiles")
        .update({ auto_topup_pm_id: null })
        .eq("id", user.id);
    }
  }

  return NextResponse.json({
    enabled: profile?.auto_topup_enabled ?? false,
    threshold: profile?.auto_topup_threshold ?? 50,
    amount: profile?.auto_topup_amount ?? 200,
    hasCard: !!card,
    card,
  });
}

// POST — update settings OR create a Stripe SetupIntent for card capture
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();

  // ── Action: setup-card — return a Stripe SetupIntent client secret ─────────
  if (body.action === "setup-card") {
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("stripe_customer_id, email")
      .eq("id", user.id)
      .single();

    // Ensure Stripe customer exists
    let customerId: string = profile?.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: profile?.email ?? user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await (createAdminClient() as any)
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ["card"],
      usage: "off_session",
      metadata: { user_id: user.id },
    });

    return NextResponse.json({ clientSecret: setupIntent.client_secret });
  }

  // ── Action: save-card — store the PaymentMethod ID after SetupIntent confirms ─
  if (body.action === "save-card") {
    const { paymentMethodId } = body;
    if (!paymentMethodId) return NextResponse.json({ error: "paymentMethodId required" }, { status: 400 });

    await (createAdminClient() as any)
      .from("profiles")
      .update({ auto_topup_pm_id: paymentMethodId })
      .eq("id", user.id);

    // Attach PM to Stripe customer
    const { data: profile } = await (supabase as any)
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();

    if (profile?.stripe_customer_id) {
      await stripe.paymentMethods.attach(paymentMethodId, {
        customer: profile.stripe_customer_id,
      }).catch(() => {}); // may already be attached
      await stripe.customers.update(profile.stripe_customer_id, {
        invoice_settings: { default_payment_method: paymentMethodId },
      }).catch(() => {});
    }

    return NextResponse.json({ ok: true });
  }

  // ── Action: remove-card ────────────────────────────────────────────────────
  if (body.action === "remove-card") {
    await (createAdminClient() as any)
      .from("profiles")
      .update({ auto_topup_pm_id: null, auto_topup_enabled: false })
      .eq("id", user.id);
    return NextResponse.json({ ok: true });
  }

  // ── Default: update settings (enabled, threshold, amount) ─────────────────
  const { enabled, threshold, amount } = body;

  // Validate amount matches a known credit pack
  const validAmounts = CREDIT_PACKS.map((p) => p.credits);
  if (amount !== undefined && !validAmounts.includes(amount)) {
    return NextResponse.json({ error: "Invalid top-up amount" }, { status: 400 });
  }
  if (threshold !== undefined && (threshold < 10 || threshold > 500)) {
    return NextResponse.json({ error: "Threshold must be between 10 and 500" }, { status: 400 });
  }

  const updates: Record<string, unknown> = {};
  if (enabled !== undefined) updates.auto_topup_enabled = enabled;
  if (threshold !== undefined) updates.auto_topup_threshold = threshold;
  if (amount !== undefined) updates.auto_topup_amount = amount;

  await (createAdminClient() as any)
    .from("profiles")
    .update(updates)
    .eq("id", user.id);

  return NextResponse.json({ ok: true });
}
