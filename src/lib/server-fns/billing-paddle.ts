/**
 * Paddle billing — second checkout provider alongside Stripe
 * (src/lib/server-fns/billing-native.ts), same PLANS catalogue.
 *
 * profiles.paddle_customer_id / paddle_subscription_id (migration
 * 20260829010000_182_paddle_billing.sql) aren't in the committed generated
 * Supabase types yet — this repo doesn't have a live DB connection to run
 * `supabase gen types` here, so those two columns are read/written through
 * `as never`/`as any` casts, the same escape hatch already used for RPCs
 * that outrun the generated types (see add_credits/apply_plan_renewal in
 * routes/api/billing/webhook.ts). Regenerating types after this migration
 * lands removes the need for the casts but isn't required for correctness.
 */
import { createClient } from "../supabase/server.ts";
import { isPaddleConfigured, getOrCreatePaddleCustomer, createPaddleSubscriptionCheckout } from "../paddle/client.ts";
import { getPaddlePriceId } from "../paddle/plans.ts";
import { PLANS } from "../stripe/plans.ts";

export async function createPaddleCheckout(data: { plan?: string; billing?: "monthly" | "yearly"; appUrl: string }) {
  if (!isPaddleConfigured()) {
    return { status: "not_configured" as const, message: "Paddle is not configured on this deployment." };
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { status: "unauthorized" as const };

  const plan = PLANS.find((p) => p.id === data.plan);
  if (!plan) return { status: "bad_request" as const, message: "Invalid plan" };

  const billing = data.billing === "yearly" ? "yearly" : "monthly";
  const priceId = getPaddlePriceId(plan.id, billing);
  if (!priceId) return { status: "bad_request" as const, message: "Plan not available via Paddle" };

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name, email, paddle_customer_id" as never)
    .eq("id", user.id)
    .single();
  const p = profile as unknown as { full_name: string | null; email: string | null; paddle_customer_id: string | null } | null;

  const email = p?.email ?? user.email ?? "";
  let customerId = p?.paddle_customer_id ?? "";
  if (!customerId) {
    customerId = await getOrCreatePaddleCustomer(email, p?.full_name ?? undefined);
    await supabase
      .from("profiles")
      .update({ paddle_customer_id: customerId } as never)
      .eq("id", user.id);
  }

  const successUrl = `${data.appUrl}/dashboard/billing?upgraded=1&plan=${plan.id}&provider=paddle`;
  const checkoutUrl = await createPaddleSubscriptionCheckout({
    customerId,
    priceId,
    successUrl,
    customData: { userId: user.id, planId: plan.id, billing },
  });
  if (!checkoutUrl) return { status: "bad_request" as const, message: "Paddle did not return a checkout URL" };

  return { status: "ok" as const, url: checkoutUrl };
}
