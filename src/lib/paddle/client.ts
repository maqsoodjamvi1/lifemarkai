/**
 * Minimal Paddle Billing API (v1, "api.paddle.com") client.
 *
 * Unlike src/lib/stripe/client.ts, this module must NOT throw at import time
 * when unconfigured — Paddle is an optional second billing provider, and
 * most deployments will only ever have Stripe set up. Every export here
 * checks isPaddleConfigured() (or is safe to call regardless) instead of
 * asserting an env var is present at module load.
 *
 * https://developer.paddle.com/api-reference/overview
 */

export function isPaddleConfigured(): boolean {
  return !!process.env.PADDLE_API_KEY;
}

function baseUrl(): string {
  // Default to sandbox so a missing/misconfigured PADDLE_ENV can never
  // accidentally start charging real cards.
  return process.env.PADDLE_ENV === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";
}

class PaddleApiError extends Error {
  constructor(public status: number, public body: string) {
    super(`Paddle API error ${status}: ${body.slice(0, 500)}`);
  }
}

async function paddleFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!isPaddleConfigured()) {
    throw new Error("Paddle is not configured (PADDLE_API_KEY missing)");
  }
  const res = await fetch(`${baseUrl()}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${process.env.PADDLE_API_KEY}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  if (!res.ok) throw new PaddleApiError(res.status, text);
  return text ? (JSON.parse(text) as T) : (undefined as T);
}

interface PaddleCustomer {
  data: { id: string; email: string };
}
interface PaddleCustomerList {
  data: Array<{ id: string; email: string }>;
}

/** Finds an existing Paddle customer by email, or creates one. Mirrors
 * stripe/client.ts's getOrCreateCustomer() (which searches by metadata.userId
 * instead — Paddle's customer search only supports filtering by email). */
export async function getOrCreatePaddleCustomer(email: string, name?: string): Promise<string> {
  const existing = await paddleFetch<PaddleCustomerList>(`/customers?email=${encodeURIComponent(email)}`);
  if (existing.data.length > 0) return existing.data[0].id;

  const created = await paddleFetch<PaddleCustomer>("/customers", {
    method: "POST",
    body: JSON.stringify({ email, name }),
  });
  return created.data.id;
}

interface PaddleTransaction {
  data: {
    id: string;
    status: string;
    checkout: { url: string | null } | null;
  };
}

/**
 * Creates a Paddle transaction for a subscription price and returns the
 * hosted-checkout URL. Passing `checkout.url` on creation is what makes
 * Paddle return a redirectable payment link instead of requiring the
 * client-side Paddle.js overlay.
 * https://developer.paddle.com/api-reference/transactions/create-transaction
 */
export async function createPaddleSubscriptionCheckout(opts: {
  customerId: string;
  priceId: string;
  successUrl: string;
  customData?: Record<string, string>;
}): Promise<string | null> {
  const txn = await paddleFetch<PaddleTransaction>("/transactions", {
    method: "POST",
    body: JSON.stringify({
      customer_id: opts.customerId,
      items: [{ price_id: opts.priceId, quantity: 1 }],
      custom_data: opts.customData ?? {},
      checkout: { url: opts.successUrl },
    }),
  });
  return txn.data.checkout?.url ?? null;
}

/** Cancels a Paddle subscription (used from the billing-portal equivalent). */
export async function cancelPaddleSubscription(subscriptionId: string): Promise<void> {
  await paddleFetch(`/subscriptions/${subscriptionId}/cancel`, {
    method: "POST",
    body: JSON.stringify({ effective_from: "next_billing_period" }),
  });
}
