/**
 * OpenRouter balance guard — prevents the account from being driven negative.
 *
 * Why this exists: in July 2026 the OpenRouter balance silently crossed zero
 * and every AI call 402'd for days while the UI showed nothing. OpenRouter
 * does NOT hard-stop at $0 — streamed responses can overshoot into a negative
 * balance, and a negative balance blocks even `:free` models.
 *
 * Strategy:
 *  - Cache the balance from GET /api/v1/credits (60s TTL — adds ONE cheap
 *    request per minute across the whole server, zero latency otherwise).
 *  - Before every paid OpenRouter call: require `remaining >= floor`
 *    (default $0.25, env OPENROUTER_MIN_BALANCE_USD) so in-flight streams
 *    can't overshoot past zero.
 *  - `:free` models: allowed while remaining >= 0 (they cost nothing), blocked
 *    when negative (OpenRouter 402s them anyway — fail fast with a clear message).
 *  - On any provider 402: poison the cache via markOpenRouterDepleted() so
 *    subsequent calls fail fast for the TTL instead of hammering the API.
 *  - Fail-open: if the credits endpoint itself is unreachable, calls proceed
 *    (an observability hiccup must not take down the product).
 */

const TTL_MS = Number(process.env.OPENROUTER_BALANCE_TTL_MS) || 60_000;
const FLOOR_USD = Number(process.env.OPENROUTER_MIN_BALANCE_USD) || 0.25;
const WARN_USD = Number(process.env.OPENROUTER_WARN_BALANCE_USD) || 2;

interface BalanceCache {
  remainingUsd: number | null; // null = unknown
  checkedAt: number;
}

let cache: BalanceCache = { remainingUsd: null, checkedAt: 0 };
let lastWarnAt = 0;

/** Current remaining balance in USD (cached ~60s). null when unknown. */
export async function getOpenRouterBalance(): Promise<number | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;
  const now = Date.now();
  if (now - cache.checkedAt < TTL_MS) return cache.remainingUsd;

  try {
    const res = await fetch("https://openrouter.ai/api/v1/credits", {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      cache = { remainingUsd: cache.remainingUsd, checkedAt: now }; // keep last known, back off
      return cache.remainingUsd;
    }
    const json = (await res.json()) as { data?: { total_credits?: number; total_usage?: number } };
    const credits = json.data?.total_credits;
    const usage = json.data?.total_usage;
    const remaining =
      typeof credits === "number" && typeof usage === "number" ? credits - usage : null;
    cache = { remainingUsd: remaining, checkedAt: now };

    if (remaining !== null && remaining < WARN_USD && now - lastWarnAt > 10 * 60_000) {
      lastWarnAt = now;
      console.warn(
        `[openrouter-balance] LOW BALANCE: $${remaining.toFixed(2)} remaining ` +
          `(warn threshold $${WARN_USD}). Top up at https://openrouter.ai/settings/credits ` +
          `— paid AI calls pause below $${FLOOR_USD}.`,
      );
    }
    return remaining;
  } catch {
    // Fail-open: unknown balance never blocks calls.
    cache = { remainingUsd: cache.remainingUsd, checkedAt: now };
    return cache.remainingUsd;
  }
}

/** Call on any provider 402 — subsequent calls fail fast for one TTL. */
export function markOpenRouterDepleted(): void {
  cache = { remainingUsd: 0, checkedAt: Date.now() };
}

/** Error type thrown by the guard — message intentionally contains
 *  "Insufficient credits" so the chat panel's persistent-error handler
 *  renders the friendly top-up message. */
export class OpenRouterBalanceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "OpenRouterBalanceError";
  }
}

/**
 * Throws when the balance can't safely cover a call to `model`.
 * Pure decision logic split out for testability.
 */
export function decideFunds(
  remainingUsd: number | null,
  model: string,
  floorUsd: number = FLOOR_USD,
): { allow: boolean; reason?: string } {
  if (remainingUsd === null) return { allow: true }; // unknown → fail-open
  const isFree = model.endsWith(":free");
  if (isFree) {
    if (remainingUsd >= 0) return { allow: true };
    return {
      allow: false,
      reason:
        `OpenRouter balance is NEGATIVE ($${remainingUsd.toFixed(2)}) — even free models are blocked by OpenRouter until the balance is positive.`,
    };
  }
  if (remainingUsd >= floorUsd) return { allow: true };
  return {
    allow: false,
    reason:
      `OpenRouter balance too low ($${remainingUsd.toFixed(2)} remaining; paid calls pause below $${floorUsd.toFixed(2)} so streams can't drive it negative).`,
  };
}

export async function assertOpenRouterFunds(model: string): Promise<void> {
  const remaining = await getOpenRouterBalance();
  const verdict = decideFunds(remaining, model);
  if (!verdict.allow) {
    throw new OpenRouterBalanceError(
      `Insufficient credits (guard): ${verdict.reason} Top up at https://openrouter.ai/settings/credits`,
    );
  }
}
