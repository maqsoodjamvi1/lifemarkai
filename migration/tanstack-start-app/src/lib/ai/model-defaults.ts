import type { AIModel } from "./provider.ts";

// ─────────────────────────────────────────────────────────────────────────────
// OpenRouter-first model lineup. Router slugs keep LifemarkAI from being pinned
// to one lab while still letting operators override any tier with exact
// OPENROUTER_*_MODEL env vars.
// ─────────────────────────────────────────────────────────────────────────────

// NOTE: OpenRouter slugs use DOT version notation (anthropic/claude-opus-4.8),
// unlike the native Anthropic API ids which use hyphens (claude-opus-4-8).
// Since we route through OpenRouter, these MUST be the dot form — verified
// against openrouter.ai (2026): opus-4.8, sonnet-4.6, haiku-4.5 all resolve.

// Quality-first defaults for user-visible generation and reasoning. Operators
// can still override every tier through the OPENROUTER_* environment variables.
const ROUTER_FRONTIER = "openai/gpt-5.6-terra";
const ROUTER_CODING = "openai/gpt-5.6-terra";
const ROUTER_FAST = "deepseek/deepseek-v4-flash";

// ─────────────────────────────────────────────────────────────────────────────
// PREMIUM TIER — refreshed to the GPT-5.6 generation, 2026-07-30.
//
// gpt-5.2-codex / gpt-5.2 both cost $1.75/M in and $14/M out. gpt-5.6-terra is
// $1.25/$7.50 — newer AND roughly 46% cheaper on output, on a 1.05M context.
// So this is a version bump that LOWERS cost; the economy tier below is
// deliberately untouched.
//
// There is no gpt-5.6-codex: verified against
// openrouter.ai/api/v1/models/openai/gpt-5.6-codex/endpoints, which returns no
// data. Terra is OpenAI's mid-tier for coding and agentic work in this
// generation, so premium coding points there rather than staying a generation
// behind on a codex-branded slug. gpt-5.2-codex still resolves and remains
// selectable in the model picker for anyone who prefers it.
//
// Every slug in this file was verified live against the OpenRouter endpoints API
// on 2026-07-30. Do not add one from memory — a dead slug fails every request
// that routes to that tier.
// ─────────────────────────────────────────────────────────────────────────────
export const PREMIUM_CODING_MODEL: AIModel =
  (process.env.OPENROUTER_PREMIUM_CODING_MODEL || "openai/gpt-5.6-terra") as AIModel;

export const PREMIUM_REASONING_MODEL: AIModel =
  (process.env.OPENROUTER_PREMIUM_REASONING_MODEL || "openai/gpt-5.6-terra") as AIModel;

/** Cheapest model in the 5.6 generation ($0.50/$3.00) — for premium-ish work on a budget. */
export const PREMIUM_ECONOMY_MODEL: AIModel =
  (process.env.OPENROUTER_PREMIUM_ECONOMY_MODEL || "openai/gpt-5.6-luna") as AIModel;

/** Primary model for coding. */
export const DEFAULT_CODING_MODEL: AIModel =
  (process.env.OPENROUTER_CODING_MODEL || ROUTER_CODING) as AIModel;

/** Fast/cheap model for lightweight tasks (reviews, autocomplete, etc.). */
export const FAST_CODING_MODEL: AIModel =
  (process.env.OPENROUTER_FAST_MODEL || ROUTER_FAST) as AIModel;

/** Balanced model for planning and medium-complexity chat. */
export const BALANCED_CODING_MODEL: AIModel =
  (process.env.OPENROUTER_BALANCED_MODEL || ROUTER_FRONTIER) as AIModel;

/** UI / design-heavy work. */
export const DESIGN_MODEL: AIModel =
  (process.env.OPENROUTER_DESIGN_MODEL || ROUTER_FRONTIER) as AIModel;

/** Copywriting / marketing content. */
export const CONTENT_MODEL: AIModel =
  (process.env.OPENROUTER_CONTENT_MODEL || ROUTER_FRONTIER) as AIModel;

/** Default conversational model. */
export const DEFAULT_CHAT_MODEL: AIModel =
  (process.env.OPENROUTER_CHAT_MODEL || ROUTER_FRONTIER) as AIModel;

/** Strong general-reasoning model for planning. */
export const REASONING_MODEL: AIModel =
  (process.env.OPENROUTER_REASONING_MODEL || ROUTER_FRONTIER) as AIModel;

/**
 * FREE coding model for work that doesn't need a paid coder: simple
 * content-only websites and tiny lightweight edits. `:free` variants cost $0
 * (20 req/min, capped daily); provider.ts auto-falls back to the paid safe
 * model when the free pool is rate-limited/congested, so routing here is
 * best-effort-free rather than free-or-fail.
 */
// Switched off qwen/qwen3-coder:free on 2026-07-30. The slug still resolves, but
// it has exactly ONE provider (Venice) and that provider's uptime_last_1d was 0
// at the time of checking — the free pool was simply down, so every request paid
// the fallback path instead. cohere/north-mini-code:free is also single-provider
// but was actually serving (~97%), is code-specialised, and carries a 256k
// context. Still best-effort-free by design: provider.ts falls back to the paid
// economy model when a free pool is congested.
export const FREE_CODING_MODEL: AIModel =
  (process.env.OPENROUTER_FREE_CODING_MODEL || "cohere/north-mini-code:free") as AIModel;

/** Cheap paid fallback when a free pool is busy or a small Auto request needs reliability. */
export const ECONOMY_CODING_MODEL: AIModel =
  (process.env.OPENROUTER_ECONOMY_CODING_MODEL || ROUTER_CODING) as AIModel;

/** Cheap model for simple chat/patch turns. */
export const ECONOMY_CHAT_MODEL: AIModel =
  (process.env.OPENROUTER_ECONOMY_CHAT_MODEL || ROUTER_FAST) as AIModel;

/**
 * Cross-vendor REVIEW model (CTO reviews, debate adjudication). Intentionally
 * a DIFFERENT model family than the coding tier: a same-family reviewer shares
 * the builder's blind spots, so reviews become an echo chamber.
 *
 * This pointed at ROUTER_CODING, which made the claim above false — the
 * reviewer was not merely the same family as the builder, it was the SAME
 * MODEL, reviewing its own output. Every "cross-vendor review" in the product
 * was a model agreeing with itself. Keep DeepSeek explicit here so it remains
 * independent when the user-facing generation default changes vendors.
 */
export const REVIEW_MODEL: AIModel =
  (process.env.OPENROUTER_REVIEW_MODEL || "deepseek/deepseek-v4-pro") as AIModel;

/**
 * ESCALATION model — used only on retry after a task failed with the normal
 * tier (cost-bounded: one escalated attempt per task).
 *
 * Was anthropic/claude-opus-4.8 at $5/M in, $25/M out. On a representative
 * build request (50k in, 8k out) that is $0.45 — against $0.012 for the coding
 * tier. One escalation cost as much as ~36 normal builds, and more than
 * Lovable's most expensive message ($0.50 at Pro list price), which put the
 * "5x cheaper than Lovable" target out of reach on its own.
 *
 * deepseek-v4-pro is $0.435/M in, $0.87/M out — verified live against
 * openrouter.ai/api/v1/models/deepseek/deepseek-v4-pro/endpoints (2026-08-06).
 * That is $0.029 on the same request: 94% cheaper, a 15x cut.
 *
 * It is a real escalation and not just a cheaper slug: 1M context against
 * Opus's 1M, 384k max output, native reasoning support, and a ~120x cache-read
 * discount ($0.0036/M) — which matters most here, because escalation retries
 * the SAME codebase that just failed, so almost all of its input is cache hits.
 *
 * Still overridable: set OPENROUTER_ESCALATION_MODEL to put a frontier model
 * back on this tier without a deploy.
 */
export const ESCALATION_MODEL: AIModel =
  (process.env.OPENROUTER_ESCALATION_MODEL || ROUTER_FRONTIER) as AIModel;

/**
 * Native image generation.
 * When OpenRouter is enabled (OPENROUTER_API_KEY present) use Gemini's image
 * model via OpenRouter (`google/gemini-3.1-flash-image`, served through
 * /chat/completions with image modalities) so image calls route through the
 * single OpenRouter key. NOTE: `openai/dall-e-3` is DELISTED from OpenRouter
 * (verified against the live catalog, July 2026) — do not use it here.
 * Without OpenRouter, default to Google's native Gemini image model.
 */
export const IMAGE_MODEL = process.env.OPENROUTER_API_KEY ? "google/gemini-3.1-flash-image" : "gemini-3.1-flash-image";

/**
 * When true, all AI calls route through OpenRouter (single API key for every model).
 * Defaults to true when OPENROUTER_API_KEY is set; set AI_VIA_OPENROUTER=false to disable.
 */
export function shouldRouteAllAiViaOpenRouter(): boolean {
  const flag = process.env.AI_VIA_OPENROUTER?.toLowerCase();
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  return !!process.env.OPENROUTER_API_KEY;
}

const CLAUDE_OPENROUTER_SLUGS: Record<string, string> = {
  "claude-opus-4-8": "anthropic/claude-opus-4.8",
  "claude-opus-4-6": "anthropic/claude-opus-4.6",
  "claude-sonnet-4-6": "anthropic/claude-sonnet-4.6",
  "claude-haiku-4-5": "anthropic/claude-haiku-4.5",
  "claude-haiku-4-5-20251001": "anthropic/claude-haiku-4.5",
};

function normalizeClaudeOpenRouterSlug(model: string): string | null {
  const bare = model.startsWith("anthropic/") ? model.slice("anthropic/".length) : model;
  const mapped = CLAUDE_OPENROUTER_SLUGS[bare];
  if (mapped) return mapped;
  return null;
}

/** Map native model IDs (gpt-4o, claude-opus-4-8) to OpenRouter slugs (openai/gpt-4o, …). */
export function resolveOpenRouterModelId(model: string): AIModel {
  if (model.startsWith("openrouter/")) {
    const rest = model.slice("openrouter/".length);
    const claude = normalizeClaudeOpenRouterSlug(rest);
    if (claude) return claude as AIModel;
    if (rest.startsWith("gpt-")) return `openai/${rest}` as AIModel;
    if (rest.startsWith("claude-")) return `anthropic/${rest}` as AIModel;
    if (rest.startsWith("gemini-")) return `google/${rest}` as AIModel;
    if (rest.includes("/")) return rest as AIModel;
    return model as AIModel;
  }
  const bare = model;
  const claude = normalizeClaudeOpenRouterSlug(bare);
  if (claude) return claude as AIModel;
  if (bare.includes("/")) return bare as AIModel;
  if (bare.startsWith("gpt-")) return `openai/${bare}` as AIModel;
  if (bare.startsWith("claude-")) return `anthropic/${bare}` as AIModel;
  if (bare.startsWith("gemini-")) return `google/${bare}` as AIModel;
  return bare as AIModel;
}

/** Env-aware default — falls back to the coding tier. */
export function getDefaultAiModel(): AIModel {
  return (process.env.DEFAULT_AI_MODEL as AIModel) ?? DEFAULT_CODING_MODEL;
}

/** Env-aware fast model — falls back to the fast tier. */
export function getFastAiModel(): AIModel {
  return (process.env.FAST_AI_MODEL as AIModel) ?? FAST_CODING_MODEL;
}

/**
 * LATENCY-CRITICAL model for inline autocomplete (/api/ai/complete fires on
 * typing pauses). Deliberately NOT the fast tier: that tier is a `:free`
 * variant (20 req/min shared pool, congestion latency) — fine for
 * click-triggered helpers, unusable at keystroke frequency. Codex Mini is
 * $0.25/$2 per M — a few hundred tokens per completion costs fractions of a
 * cent, and consistent sub-second latency is what makes autocomplete usable.
 */
export const AUTOCOMPLETE_MODEL: AIModel =
  (process.env.OPENROUTER_AUTOCOMPLETE_MODEL || "openai/gpt-5.1-codex-mini") as AIModel;
