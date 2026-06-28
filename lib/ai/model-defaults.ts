import type { AIModel } from "./provider";

// ─────────────────────────────────────────────────────────────────────────────
// Claude-first model lineup (June 2026). All tiers default to the current Claude
// family, expressed as OpenRouter slugs so they route through OPENROUTER_API_KEY
// with no per-provider keys. The invalid-slug safety net in provider.ts degrades
// to gpt-4o if a slug is rejected by the catalog, so these are safe defaults.
//
//   Opus 4.8   → heavy coding, design, reasoning, content (highest quality)
//   Sonnet 4.6 → balanced / medium-complexity work (quality vs. cost)
//   Haiku 4.5  → fast + cheap conversational / lightweight tasks
//
// Override any tier via env (OPENROUTER_CODING_MODEL, _BALANCED_, _FAST_, …).
// ─────────────────────────────────────────────────────────────────────────────

// ── Feature flag: opt into the upgraded Claude-first lineup ───────────────────
// OFF by default → preserves the prior models (Sonnet for heavy tiers, gpt-4o-mini
// for fast/chat) so this rolls out with zero behavior change. Set
// LIFEMARK_CLAUDE_DEFAULTS=true (or 1) to switch heavy tiers to Opus 4.8 and
// fast/chat to Haiku 4.5. Per-tier OPENROUTER_*_MODEL env vars still override either way.
function claudeDefaultsOn(): boolean {
  const f = process.env.LIFEMARK_CLAUDE_DEFAULTS?.toLowerCase();
  return f === "true" || f === "1";
}
const CLAUDE = claudeDefaultsOn();

// NOTE: OpenRouter slugs use DOT version notation (anthropic/claude-opus-4.8),
// unlike the native Anthropic API ids which use hyphens (claude-opus-4-8).
// Since we route through OpenRouter, these MUST be the dot form — verified
// against openrouter.ai (2026): opus-4.8, sonnet-4.6, haiku-4.5 all resolve.
/** Top Claude coder. */
const CLAUDE_OPUS = "anthropic/claude-opus-4.8";
/** Balanced Claude — medium-complexity work. */
const CLAUDE_SONNET = "anthropic/claude-sonnet-4.6";
/** Fast + cheap Claude. */
const CLAUDE_HAIKU = "anthropic/claude-haiku-4.5";

// Prior (pre-upgrade) defaults — used when the flag is OFF.
const LEGACY_HEAVY = "anthropic/claude-sonnet-4.6"; // coding/design/content/reasoning/balanced
const LEGACY_FAST = "openai/gpt-4o-mini"; // fast/chat

/** Primary model for coding. */
export const DEFAULT_CODING_MODEL: AIModel =
  (process.env.OPENROUTER_CODING_MODEL || (CLAUDE ? CLAUDE_OPUS : LEGACY_HEAVY)) as AIModel;

/** Fast/cheap model for lightweight tasks (reviews, autocomplete, etc.). */
export const FAST_CODING_MODEL: AIModel =
  (process.env.OPENROUTER_FAST_MODEL || (CLAUDE ? CLAUDE_HAIKU : LEGACY_FAST)) as AIModel;

/** Balanced model for planning and medium-complexity chat. */
export const BALANCED_CODING_MODEL: AIModel =
  (process.env.OPENROUTER_BALANCED_MODEL || (CLAUDE ? CLAUDE_SONNET : LEGACY_HEAVY)) as AIModel;

/** UI / design-heavy work. */
export const DESIGN_MODEL: AIModel =
  (process.env.OPENROUTER_DESIGN_MODEL || (CLAUDE ? CLAUDE_OPUS : LEGACY_HEAVY)) as AIModel;

/** Copywriting / marketing content. */
export const CONTENT_MODEL: AIModel =
  (process.env.OPENROUTER_CONTENT_MODEL || (CLAUDE ? CLAUDE_OPUS : LEGACY_HEAVY)) as AIModel;

/** Default conversational model — fast + cheap. */
export const DEFAULT_CHAT_MODEL: AIModel =
  (process.env.OPENROUTER_CHAT_MODEL || (CLAUDE ? CLAUDE_HAIKU : LEGACY_FAST)) as AIModel;

/** Strong general-reasoning model for planning. */
export const REASONING_MODEL: AIModel =
  (process.env.OPENROUTER_REASONING_MODEL || (CLAUDE ? CLAUDE_OPUS : LEGACY_HEAVY)) as AIModel;

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

/** Map native model IDs (gpt-4o, claude-opus-4-8) to OpenRouter slugs (openai/gpt-4o, …). */
export function resolveOpenRouterModelId(model: string): AIModel {
  const bare = model.startsWith("openrouter/") ? model.slice("openrouter/".length) : model;
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
