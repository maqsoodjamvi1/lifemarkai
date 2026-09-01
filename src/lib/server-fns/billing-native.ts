/**
 * Native billing (Stripe) — reimplemented off the worker using the ported
 * lib/stripe subsystem. Ports of app/api/billing/{checkout,portal}/route.ts.
 * The request origin is passed in from the route (needs the Request).
 */
import { createClient } from "../supabase/server.ts";
import { getServerUser } from "../supabase/server-user.ts";
import { ensureDevCredits } from "../dev-credits.ts";
import { stripe,getOrCreateCustomer,createBillingPortalSession } from "../stripe/client.ts";
import { PLANS,CREDIT_PACKS } from "../stripe/plans.ts";

export async function createSubscriptionCheckout(data: any) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const };

    const plan = PLANS.find((p) => p.id === data.plan);
    if (!plan) return { status: "bad_request" as const, message: "Invalid plan" };
    const priceId = data.billing === "yearly" ? plan.stripePriceIdYearly : plan.stripePriceIdMonthly;
    if (!priceId) return { status: "bad_request" as const, message: "Plan not available" };

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id, full_name, email")
      .eq("id", user.id)
      .single();

    const email = profile?.email ?? user.email ?? "";
    let customerId = profile?.stripe_customer_id ?? "";
    if (!customerId) {
      customerId = await getOrCreateCustomer(user.id, email, profile?.full_name ?? undefined);
      await supabase
        .from("profiles")
        .update({ stripe_customer_id: customerId })
        .eq("id", user.id);
    }

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: "subscription",
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${data.appUrl}/dashboard/billing?upgraded=1&plan=${data.plan}`,
      cancel_url: `${data.appUrl}/dashboard/billing`,
      allow_promotion_codes: true,
      subscription_data: {
        metadata: { userId: user.id, planId: data.plan, billing: data.billing ?? "monthly" },
      },
    });

    return { status: "ok" as const, url: session.url };
}

export async function createPortalSession(data: any) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const };

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();
    if (!profile?.stripe_customer_id) {
      return { status: "bad_request" as const, message: "No billing account found" };
    }

    const url = await createBillingPortalSession(
      profile.stripe_customer_id,
      `${data.origin}/dashboard/billing`,
    );
    return { status: "ok" as const, url };
}

// ── credit pack purchase (one-off Stripe Checkout) ──────────────────────────
export async function createCreditPackCheckout(data: any) {
    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const pack = CREDIT_PACKS.find((p) => p.key === data.packKey);
    if (!pack) return { status: "bad_request" as const, message: "Invalid pack" };

    // A caller-supplied teamId is untrusted: without this check anyone who
    // knows/guesses a team id (they surface in shared-project/invite URLs)
    // could pay with their own card and have the webhook unconditionally
    // credit an arbitrary team's pool via `add_team_credits`, which itself
    // has no caller-membership check (by design — it's service_role-only,
    // meant to be called from a trusted context like this one). Only honor
    // teamId when the buyer is actually an accepted member of that team —
    // same membership check this codebase already uses elsewhere
    // (billing.ts's getCredits, deduct_team_credits) — otherwise fall back
    // to crediting the buyer's own account.
    let teamId: string | null = null;
    if (data.teamId) {
      const { data: membership } = await supabase
        .from("team_members")
        .select("team_id")
        .eq("team_id", data.teamId)
        .eq("user_id", user.id)
        .not("accepted_at", "is", null)
        .maybeSingle();
      teamId = membership ? data.teamId : null;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("email, stripe_customer_id")
      .eq("id", user.id)
      .single();

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: profile?.email,
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: pack.priceCents,
            product_data: {
              name: `${pack.credits} LifemarkAI Credits`,
              description: pack.description,
              images: [],
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        userId: user.id,
        teamId: teamId ?? "",
        packKey: pack.key,
        credits: String(pack.credits),
      },
      success_url: `${data.appUrl}/dashboard/billing?credit_success=1&pack=${pack.key}`,
      cancel_url: `${data.appUrl}/dashboard/billing?credit_cancel=1`,
    });

    await supabase.from("credit_packs").insert({
      user_id: user.id,
      team_id: teamId,
      amount: pack.credits,
      price_cents: pack.priceCents,
      stripe_session_id: session.id,
      pack_key: pack.key,
      status: "pending",
    });

    return { status: "ok" as const, url: session.url };
}

// ── redeem promotion code ───────────────────────────────────────────────────
export async function redeemPromoCode(data: any) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const };
    if (!data.code?.trim()) return { status: "error" as const, code: 400, message: "No promo code provided." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id")
      .eq("id", user.id)
      .single();
    if (!profile?.stripe_customer_id) {
      return { status: "error" as const, code: 400, message: "No billing account found. Please purchase a plan first." };
    }

    let promotionCode;
    try {
      const codes = await stripe.promotionCodes.list({ code: data.code.trim(), active: true, limit: 1 });
      promotionCode = codes.data[0];
    } catch {
      return { status: "error" as const, code: 500, message: "Could not look up promo code." };
    }
    if (!promotionCode) return { status: "error" as const, code: 400, message: "Invalid or expired promo code." };

    const subscriptions = await stripe.subscriptions.list({
      customer: profile.stripe_customer_id,
      status: "active",
      limit: 1,
    });
    if (subscriptions.data.length === 0) {
      return { status: "ok" as const, message: "Code verified! Apply it at checkout when upgrading your plan." };
    }

    try {
      await stripe.subscriptions.update(subscriptions.data[0].id, { coupon: promotionCode.coupon.id });
    } catch (err: unknown) {
      return { status: "error" as const, code: 500, message: err instanceof Error ? err.message : "Failed to apply coupon." };
    }
    return { status: "ok" as const, message: "Promo code applied! Your discount is active." };
}

// ── student discount (one-time 50% off 3 months) ────────────────────────────
const STUDENT_COUPON_PARAMS = {
  name: "LifemarkAI Student Discount",
  percent_off: 50,
  duration: "repeating" as const,
  duration_in_months: 3,
  max_redemptions: 1,
};

export async function grantStudentDiscount(data: any) {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { status: "unauthorized" as const };
    if (!data.eduEmail?.trim()) return { status: "error" as const, code: 400, message: "No email provided." };
    if (!data.eduEmail.trim().toLowerCase().endsWith(".edu")) {
      return { status: "error" as const, code: 400, message: "Only .edu email addresses qualify for the student discount." };
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("stripe_customer_id, student_discount_used, full_name")
      .eq("id", user.id)
      .single();
    if (profile?.student_discount_used) {
      return { status: "error" as const, code: 400, message: "Student discount has already been applied to this account." };
    }

    const email = user.email ?? "";
    let customerId = profile?.stripe_customer_id ?? "";
    if (!customerId) {
      customerId = await getOrCreateCustomer(user.id, email, profile?.full_name ?? undefined);
      await supabase.from("profiles").update({ stripe_customer_id: customerId }).eq("id", user.id);
    }

    let coupon;
    try {
      coupon = await stripe.coupons.create({
        ...STUDENT_COUPON_PARAMS,
        metadata: { userId: user.id, eduEmail: data.eduEmail.trim() },
      });
    } catch (err: unknown) {
      return { status: "error" as const, code: 500, message: err instanceof Error ? err.message : "Failed to create coupon." };
    }

    const subscriptions = await stripe.subscriptions.list({ customer: customerId, status: "active", limit: 1 });
    try {
      if (subscriptions.data.length > 0) {
        await stripe.subscriptions.update(subscriptions.data[0].id, { coupon: coupon.id });
      } else {
        await stripe.customers.update(customerId, { coupon: coupon.id });
      }
    } catch (err: unknown) {
      return { status: "error" as const, code: 500, message: err instanceof Error ? err.message : "Failed to apply coupon." };
    }

    await supabase.from("profiles").update({ student_discount_used: true }).eq("id", user.id);
    return { status: "ok" as const, message: "Student discount applied! 50% off for your next 3 months." };
}

// ── dev-only credit grant ───────────────────────────────────────────────────
export async function grantDevCredits() {
  if (process.env.NODE_ENV !== "development") return { status: "forbidden" as const };
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };
  const credits = (await ensureDevCredits(user.id)) ?? 100;
  return { status: "ok" as const, credits };
}
