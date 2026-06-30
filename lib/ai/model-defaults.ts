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

const ROUTER_FRONTIER = "openrouter/fusion";
const ROUTER_CODING = "openrouter/pareto-code";
const ROUTER_FAST = "deepseek/deepseek-v4-flash";

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
 * Native image generation.
 * When OpenRouter is enabled (OPENROUTER_API_KEY present) prefer OpenAI's
 * DALL·E 3 via OpenRouter (`openai/dall-e-3`) so image calls route through
 * the single OpenRouter key. Otherwise default to Google's Gemini image model.
 */
export const IMAGE_MODEL = process.env.OPENROUTER_API_KEY ? "openai/dall-e-3" : "gemini-3.1-flash-image";

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
