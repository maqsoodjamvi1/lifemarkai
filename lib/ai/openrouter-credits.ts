/**
 * OpenRouter account-balance guard.
 *
 * Prevents the application from overdrawing the OpenRouter account. A cached
 * pre-flight check of the real remaining credit, plus a guard that blocks
 * OpenRouter-routed generate calls when the balance is depleted — so the
 * OpenRouter balance never goes negative while people use the app.
 *
 * Fail-open by design: if the balance can't be determined (no key, or a
 * transient error) the guard does NOT block. It blocks only on a CONFIRMED
 * depleted balance, so a flaky balance endpoint can never take down all AI.
 *
 * Cached with a short TTL so this adds at most one balance fetch per minute,
 * not one per request. Set OPENROUTER_MIN_CREDIT to keep a safety buffer
 * (e.g. "0.50" to stop while ~$0.50 remains).
 */

export interface OpenRouterCredit {
  /** Remaining account credit in USD (total_credits − total_usage). */
  remaining: number;
  usage: number;
  /** total_credits (null when unknown). */
  limit: number | null;
  checkedAt: number;
}

const TTL_MS = 60_000;
let cache: OpenRouterCredit | null = null;
let inflight: Promise<OpenRouterCredit | null> | null = null;

function minCredit(): number {
  const v = Number(process.env.OPENROUTER_MIN_CREDIT);
  return Number.isFinite(v) ? v : 0;
}

/** Force the next check to re-fetch (e.g. right after a top-up). */
export function invalidateOpenRouterCredit(): void {
  cache = null;
}

/**
 * Current OpenRouter account balance, cached ~60s. Returns null when there's no
 * OPENROUTER_API_KEY (nothing to guard) or the balance is currently unknown.
 */
export async function getOpenRouterCredit(force = false): Promise<OpenRouterCredit | null> {
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) return null;

  const now = Date.now();
  if (!force && cache && now - cache.checkedAt < TTL_MS) return cache;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/credits", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) return cache; // fail-open to last known value
      const json = (await res.json()) as { data?: { total_credits?: number; total_usage?: number } };
      const total = Number(json?.data?.total_credits ?? 0);
      const used = Number(json?.data?.total_usage ?? 0);
      if (!Number.isFinite(total) || !Number.isFinite(used)) return cache;
      cache = { remaining: total - used, usage: used, limit: total, checkedAt: Date.now() };
      return cache;
    } catch {
      return cache; // fail-open on transient errors
    } finally {
      inflight = null;
    }
  })();
  return inflight;
}

export class OpenRouterInsufficientCreditError extends Error {
  readonly code = "OPENROUTER_INSUFFICIENT_CREDIT";
  readonly remaining: number;
  constructor(remaining: number) {
    super(
      `OpenRouter account credit is depleted (about $${remaining.toFixed(2)} left). ` +
        `AI is paused to avoid a negative balance — top up OpenRouter to resume.`,
    );
    this.name = "OpenRouterInsufficientCreditError";
    this.remaining = remaining;
  }
}

/**
 * Throw when the OpenRouter balance is confirmed at/below the safety floor.
 * No-ops (fail-open) when the balance is unknown or there's no key.
 */
export async function assertOpenRouterCredit(): Promise<void> {
  const c = await getOpenRouterCredit();
  if (c && c.remaining <= minCredit()) {
    throw new OpenRouterInsufficientCreditError(c.remaining);
  }
}

/** Does this model route through OpenRouter (so the balance guard applies)? */
export function routesViaOpenRouter(model: string): boolean {
  // OpenRouter slugs are "provider/model"; the app is OpenRouter-first by default.
  return typeof model === "string" && (model.includes("/") || !!process.env.OPENROUTER_API_KEY);
}
