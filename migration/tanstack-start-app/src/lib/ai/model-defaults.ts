import type { AIModel } from "./provider";

// ─────────────────────────────────────────────────────────────────────────────
// OpenRouter-first model lineup. Router slugs keep LifemarkAI from being pinned
// to one lab while still letting operators override any tier with exact
// OPENROUTER_*_MODEL env vars.
// ─────────────────────────────────────────────────────────────────────────────

// NOTE: OpenRouter slugs use DOT version notation (anthropic/claude-opus-4.8),
// unlike the native Anthropic API ids which use hyphens (claude-opus-4-8).
// Since we route through OpenRouter, these MUST be the dot form — verified
// against openrouter.ai (2026): opus-4.8, sonnet-4.6, haiku-4.5 all resolve.

// Default to economy-safe approved models. Keep OpenRouter routers out of the
// default path; Auto mode should choose from the product-approved model set.
const ROUTER_FRONTIER = "deepseek/deepseek-v4-pro";
const ROUTER_CODING = "qwen/qwen3-coder";
const ROUTER_FAST = "deepseek/deepseek-v4-flash";

export const PREMIUM_CODING_MODEL: AIModel =
  (process.env.OPENROUTER_PREMIUM_CODING_MODEL || "openai/gpt-5.2-codex") as AIModel;

export const PREMIUM_REASONING_MODEL: AIModel =
  (process.env.OPENROUTER_PREMIUM_REASONING_MODEL || "openai/gpt-5.2") as AIModel;

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
export const FREE_CODING_MODEL: AIModel =
  (process.env.OPENROUTER_FREE_CODING_MODEL || "qwen/qwen3-coder:free") as AIModel;

/** Cheap paid fallback when a free pool is busy or a small Auto request needs reliability. */
export const ECONOMY_CODING_MODEL: AIModel =
  (process.env.OPENROUTER_ECONOMY_CODING_MODEL || ROUTER_CODING) as AIModel;

/** Cheap model for simple chat/patch turns. */
export const ECONOMY_CHAT_MODEL: AIModel =
  (process.env.OPENROUTER_ECONOMY_CHAT_MODEL || ROUTER_FAST) as AIModel;

/**
 * Cross-vendor REVIEW model (CTO reviews, debate adjudication). Intentionally
 * a DIFFERENT model family than the coding tier (Claude): a same-family
 * reviewer shares the builder's blind spots, so reviews become an echo
 * chamber. GPT-5.2 slug verified against the live OpenRouter catalog (2026).
 */
export const REVIEW_MODEL: AIModel =
  (process.env.OPENROUTER_REVIEW_MODEL || ROUTER_CODING) as AIModel;

/**
 * ESCALATION model — strongest available, used only on retry after a task
 * failed with the normal tier (cost-bounded: one escalated attempt per task).
 * Opus 4.8 slug verified against the live OpenRouter catalog (2026).
 */
export const ESCALATION_MODEL: AIModel =
  (process.env.OPENROUTER_ESCALATION_MODEL || "anthropic/claude-opus-4.8") as AIModel;

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
