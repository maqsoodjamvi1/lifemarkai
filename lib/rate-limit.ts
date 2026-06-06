// @ts-nocheck
/**
 * Rate limiting — Upstash Redis in production, in-memory Map in development.
 *
 * Set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN in .env.local to
 * activate the distributed limiter (works across serverless instances).
 * Without those vars the in-memory fallback is used — fine for local dev.
 */

export interface RateLimitConfig {
  /** Max requests per window */
  limit: number;
  /** Window size in seconds */
  windowMs: number;
}

export interface RateLimitResult {
  success: boolean;
  remaining: number;
  resetAt: number;
}

// ── In-memory fallback (dev / single-server) ──────────────────────────────────

interface InMemoryEntry { count: number; resetAt: number }
const _store = new Map<string, InMemoryEntry>();

// Clean up expired entries every 5 minutes
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    _store.forEach((e, k) => { if (now > e.resetAt) _store.delete(k); });
  }, 5 * 60 * 1000);
}

function inMemoryLimit(id: string, cfg: RateLimitConfig): RateLimitResult {
  const now = Date.now();
  const windowMs = cfg.windowMs * 1000;
  let entry = _store.get(id);
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    _store.set(id, entry);
  }
  entry.count++;
  return {
    success: entry.count <= cfg.limit,
    remaining: Math.max(0, cfg.limit - entry.count),
    resetAt: entry.resetAt,
  };
}

// ── Upstash limiter cache ─────────────────────────────────────────────────────

type UpstashLimiter = { limit: (id: string) => Promise<{ success: boolean; remaining: number; reset: number }> };
let _limiterCache: UpstashLimiter | null | "uninitialized" = "uninitialized";

async function getUpstashLimiter(cfg: RateLimitConfig): Promise<UpstashLimiter | null> {
  if (_limiterCache !== "uninitialized") return _limiterCache;

  const url   = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    _limiterCache = null;
    return null;
  }

  try {
    const [{ Redis }, { Ratelimit }] = await Promise.all([
      import("@upstash/redis"),
      import("@upstash/ratelimit"),
    ]);

    const redis = new Redis({ url, token });
    _limiterCache = new Ratelimit({
      redis,
      limiter: Ratelimit.slidingWindow(cfg.limit, `${cfg.windowMs} s`),
      analytics: true,
      prefix: "lifemarkai:rl",
    }) as unknown as UpstashLimiter;

    return _limiterCache;
  } catch (err) {
    console.error("[rate-limit] Failed to initialize Upstash:", err);
    _limiterCache = null;
    return null;
  }
}

// ── Synchronous export (backwards compatible) ─────────────────────────────────
// Returns in-memory result immediately. Call rateLimitAsync in async routes
// for true distributed limiting.

export function rateLimit(id: string, cfg: RateLimitConfig): RateLimitResult {
  return inMemoryLimit(id, cfg);
}

/**
 * Async rate limit — uses Upstash when configured, in-memory otherwise.
 * Drop-in replacement for rateLimit() in async API route handlers.
 *
 * @example
 * const rl = await rateLimitAsync(userId, RATE_LIMITS.ai);
 * if (!rl.success) return NextResponse.json({ error: "Rate limited" }, { status: 429 });
 */
export async function rateLimitAsync(
  id: string,
  cfg: RateLimitConfig
): Promise<RateLimitResult> {
  const limiter = await getUpstashLimiter(cfg);

  if (limiter) {
    try {
      const { success, remaining, reset } = await limiter.limit(id);
      return { success, remaining, resetAt: reset };
    } catch (err) {
      console.warn("[rate-limit] Upstash call failed, falling back to in-memory:", err);
    }
  }

  return inMemoryLimit(id, cfg);
}

// ── Presets ───────────────────────────────────────────────────────────────────

export const RATE_LIMITS = {
  ai:     { limit: 60,  windowMs: 60 }, // 60 AI requests / min
  api:    { limit: 300, windowMs: 60 }, // 300 API requests / min
  auth:   { limit: 10,  windowMs: 60 }, // 10 auth attempts / min
  deploy: { limit: 5,   windowMs: 60 }, // 5 deploys / min
  upload: { limit: 20,  windowMs: 60 }, // 20 uploads / min
} satisfies Record<string, RateLimitConfig>;
