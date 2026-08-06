/** Native billing/auto-topup — reimplemented off the worker (ported lib/stripe). */
import { createAdminClient, createClient } from "../supabase/server.ts";
import { stripe } from "../stripe/client.ts";
import { CREDIT_PACKS } from "../stripe/plans.ts";

export async function getAutoTopup() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { status: "unauthorized" as const };
  const admin = createAdminClient();

  const { data: profile } = await (supabase as any)
    .from("profiles")
    .select("auto_topup_enabled, auto_topup_threshold, auto_topup_amount, auto_topup_pm_id, stripe_customer_id")
    .eq("id", user.id)
    .single();

  let card: { brand: string; last4: string; expMonth: number; expYear: number } | null = null;
  if (profile?.auto_topup_pm_id) {
    try {
      const pm = await stripe.paymentMethods.retrieve(profile.auto_topup_pm_id);
      if (pm.card) {
        card = { brand: pm.card.brand, last4: pm.card.last4, expMonth: pm.card.exp_month, expYear: pm.card.exp_year };
      }
    } catch {
      await (admin as any).from("profiles").update({ auto_topup_pm_id: null }).eq("id", user.id);
    }
  }

  return {
    status: "ok" as const,
    enabled: profile?.auto_topup_enabled ?? false,
    threshold: profile?.auto_topup_threshold ?? 50,
    amount: profile?.auto_topup_amount ?? 200,
    hasCard: !!card,
    card,
  };
}

interface AutoTopupBody {
  action?: "setup-card" | "save-card" | "remove-card";
  paymentMethodId?: string;
  enabled?: boolean;
  threshold?: number;
  amount?: number;
}

export async function updateAutoTopup(data: any) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const };
    const admin = createAdminClient();

    // setup-card → SetupIntent client secret
    if (data.action === "setup-card") {
      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("stripe_customer_id, email")
        .eq("id", user.id)
        .single();
      let customerId: string = profile?.stripe_customer_id;
      if (!customerId) {
        const customer = await stripe.customers.create({
          email: profile?.email ?? user.email,
          metadata: { supabase_user_id: user.id },
        });
        customerId = customer.id;
        await (admin as any).from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
      }
      const setupIntent = await stripe.setupIntents.create({
        customer: customerId,
        payment_method_types: ["card"],
        usage: "off_session",
        metadata: { user_id: user.id },
      });
      return { status: "client_secret" as const, clientSecret: setupIntent.client_secret };
    }

    // save-card → store PM id + attach to customer
    if (data.action === "save-card") {
      if (!data.paymentMethodId) return { status: "bad_request" as const, message: "paymentMethodId required" };
      await (admin as any).from("profiles").update({ auto_topup_pm_id: data.paymentMethodId }).eq("id", user.id);
      const { data: profile } = await (supabase as any)
        .from("profiles")
        .select("stripe_customer_id")
        .eq("id", user.id)
        .single();
      if (profile?.stripe_customer_id) {
        await stripe.paymentMethods
          .attach(data.paymentMethodId, { customer: profile.stripe_customer_id })
          .catch(() => {});
        await stripe.customers
          .update(profile.stripe_customer_id, {
            invoice_settings: { default_payment_method: data.paymentMethodId },
          })
          .catch(() => {});
      }
      return { status: "ok" as const };
    }

    // remove-card
    if (data.action === "remove-card") {
      await (admin as any)
        .from("profiles")
        .update({ auto_topup_pm_id: null, auto_topup_enabled: false })
        .eq("id", user.id);
      return { status: "ok" as const };
    }

    // default: update settings
    const validAmounts = CREDIT_PACKS.map((p) => p.credits);
    if (data.amount !== undefined && !validAmounts.includes(data.amount)) {
      return { status: "bad_request" as const, message: "Invalid top-up amount" };
    }
    if (data.threshold !== undefined && (data.threshold < 10 || data.threshold > 500)) {
      return { status: "bad_request" as const, message: "Threshold must be between 10 and 500" };
    }
    const updates: Record<string, unknown> = {};
    if (data.enabled !== undefined) updates.auto_topup_enabled = data.enabled;
    if (data.threshold !== undefined) updates.auto_topup_threshold = data.threshold;
    if (data.amount !== undefined) updates.auto_topup_amount = data.amount;
    await (admin as any).from("profiles").update(updates).eq("id", user.id);
    return { status: "ok" as const };
}
