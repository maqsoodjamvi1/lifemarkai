/**
 * Auto top-up helper — charges the user's saved payment method and adds credits.
 *
 * Called server-side after any credit deduction. Idempotent: debounced by 60 s
 * using `auto_topup_last_triggered_at` so a rapid burst of AI calls only fires once.
 */

import { stripe } from "@/lib/stripe/client";
import { createAdminClient } from "@/lib/supabase/server";
import { CREDIT_PACKS } from "@/lib/stripe/plans";

/** Minimum seconds between two consecutive auto top-up charges for the same user. */
const DEBOUNCE_SECS = 60;

export interface AutoTopupResult {
  triggered: boolean;
  reason?: string;
  creditsAdded?: number;
}

export async function triggerAutoTopupIfNeeded(userId: string): Promise<AutoTopupResult> {
  const supabase = createAdminClient();

  // Fetch profile fields needed for auto top-up
  const { data: profile, error } = await (supabase as any)
    .from("profiles")
    .select(
      "credits, auto_topup_enabled, auto_topup_threshold, auto_topup_amount, " +
      "auto_topup_pm_id, auto_topup_last_triggered_at, stripe_customer_id, email"
    )
    .eq("id", userId)
    .single();

  if (error || !profile) return { triggered: false, reason: "profile_not_found" };

  // Guard: feature must be enabled
  if (!profile.auto_topup_enabled) return { triggered: false, reason: "disabled" };

  // Guard: must have a saved payment method
  if (!profile.auto_topup_pm_id) return { triggered: false, reason: "no_payment_method" };

  // Guard: must have a Stripe customer
  if (!profile.stripe_customer_id) return { triggered: false, reason: "no_stripe_customer" };

  // Guard: balance must actually be below threshold
  if ((profile.credits ?? 0) >= (profile.auto_topup_threshold ?? 50)) {
    return { triggered: false, reason: "balance_sufficient" };
  }

  // Guard: debounce — don't charge again within DEBOUNCE_SECS
  if (profile.auto_topup_last_triggered_at) {
    const lastMs = new Date(profile.auto_topup_last_triggered_at).getTime();
    if (Date.now() - lastMs < DEBOUNCE_SECS * 1000) {
      return { triggered: false, reason: "debounced" };
    }
  }

  // Resolve the matching credit pack
  const amount = profile.auto_topup_amount ?? 200;
  const pack = CREDIT_PACKS.find((p) => p.credits === amount) ?? CREDIT_PACKS[1]; // default: Builder 200

  try {
    // Mark triggered first (optimistic) to avoid race conditions if two requests arrive simultaneously
    await (supabase as any)
      .from("profiles")
      .update({ auto_topup_last_triggered_at: new Date().toISOString() })
      .eq("id", userId);

    // Create and immediately confirm an off-session PaymentIntent
    const paymentIntent = await stripe.paymentIntents.create({
      amount: pack.priceCents,
      currency: "usd",
      customer: profile.stripe_customer_id,
      payment_method: profile.auto_topup_pm_id,
      confirm: true,
      off_session: true,
      metadata: {
        user_id: userId,
        credits: String(pack.credits),
        type: "auto_topup",
      },
      description: `Auto top-up: ${pack.credits} LifemarkAI credits`,
    });

    if (paymentIntent.status !== "succeeded") {
      return { triggered: false, reason: `payment_status_${paymentIntent.status}` };
    }

    // Add credits atomically
    await (supabase as any).rpc("add_credits", { p_user_id: userId, p_amount: pack.credits });

    // Audit log
    await (supabase as any).from("credit_logs").insert({
      user_id: userId,
      amount: pack.credits,
      action: "auto_topup",
      description: `Auto top-up: ${pack.credits} credits ($${(pack.priceCents / 100).toFixed(2)})`,
    });

    return { triggered: true, creditsAdded: pack.credits };
  } catch (err: unknown) {
    // Surface the Stripe error code if available
    const msg = err instanceof Error ? err.message : "unknown";
    return { triggered: false, reason: `stripe_error: ${msg}` };
  }
}
