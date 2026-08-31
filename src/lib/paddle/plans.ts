/**
 * Paddle price-id mapping for the existing plan catalogue (src/lib/stripe/plans.ts).
 * Paddle is a second checkout/billing provider for the same PLANS — it does
 * not duplicate plan names, credits, or features, only the provider-specific
 * price ids, kept in their own env vars so Stripe's are untouched.
 */
import { PLANS, type Plan, type PlanId } from "../stripe/plans";

export interface PaddlePriceMapping {
  planId: PlanId;
  monthly: string;
  yearly: string;
}

export const PADDLE_PRICE_MAP: PaddlePriceMapping[] = [
  { planId: "pro", monthly: process.env.PADDLE_PRO_MONTHLY_PRICE_ID ?? "", yearly: process.env.PADDLE_PRO_YEARLY_PRICE_ID ?? "" },
  { planId: "team", monthly: process.env.PADDLE_TEAM_MONTHLY_PRICE_ID ?? "", yearly: process.env.PADDLE_TEAM_YEARLY_PRICE_ID ?? "" },
];

export function getPaddlePriceId(planId: PlanId, billing: "monthly" | "yearly"): string {
  const entry = PADDLE_PRICE_MAP.find((p) => p.planId === planId);
  if (!entry) return "";
  return billing === "yearly" ? entry.yearly : entry.monthly;
}

/** Reverse lookup used by the webhook handler: Paddle price id -> our Plan. */
export function getPlanByPaddlePriceId(priceId: string): Plan | undefined {
  const mapping = PADDLE_PRICE_MAP.find((p) => p.monthly === priceId || p.yearly === priceId);
  if (!mapping) return undefined;
  return PLANS.find((p) => p.id === mapping.planId);
}
