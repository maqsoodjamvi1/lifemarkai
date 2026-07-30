import Stripe from "stripe";
import { PLANS, CREDIT_PACKS, type PlanId } from "./plans";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  apiVersion: "2024-06-20",
});

// Re-export for legacy callers
export { PLANS, CREDIT_PACKS };
export type PlanName = PlanId;

export async function getOrCreateCustomer(
  userId: string,
  email: string,
  name?: string
): Promise<string> {
  const existing = await stripe.customers.search({
    query: `metadata["userId"]:"${userId}"`,
  });
  if (existing.data.length > 0) return existing.data[0].id;

  const customer = await stripe.customers.create({
    email,
    name,
    metadata: { userId },
  });
  return customer.id;
}

export async function createCheckoutSession(
  customerId: string,
  priceId: string,
  successUrl: string,
  cancelUrl: string,
  mode: "subscription" | "payment" = "subscription"
): Promise<string> {
  const session = await stripe.checkout.sessions.create({
    customer: customerId,
    mode,
    payment_method_types: ["card"],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: successUrl,
    cancel_url: cancelUrl,
    allow_promotion_codes: true,
  });
  return session.url!;
}

export async function createBillingPortalSession(
  customerId: string,
  returnUrl: string
): Promise<string> {
  const session = await stripe.billingPortal.sessions.create({
    customer: customerId,
    return_url: returnUrl,
  });
  return session.url;
}

/** Resolve a Stripe price ID → plan ID */
export function planIdFromPriceId(priceId: string): PlanId | null {
  for (const plan of PLANS) {
    if (plan.stripePriceIdMonthly === priceId || plan.stripePriceIdYearly === priceId) {
      return plan.id;
    }
  }
  return null;
}
