import type { AIModel } from "./provider";

/** Primary model for coding — Claude Opus for best code quality. */
export const DEFAULT_CODING_MODEL: AIModel = "claude-opus-4-6";

/** Fast/cheap model for lightweight tasks (reviews, autocomplete, etc.). */
export const FAST_CODING_MODEL: AIModel = "claude-haiku-4-5-20251001";

/** Balanced Claude model for planning and medium-complexity chat. */
export const BALANCED_CODING_MODEL: AIModel = "claude-sonnet-4-6";

/**
 * When true, all AI calls route through OpenRouter (single API key for every model).
 * Defaults to true when OPENROUTER_API_KEY is set; set AI_VIA_OPENROUTER=false to disable.
 */
export function useOpenRouterForAll(): boolean {
  const flag = process.env.AI_VIA_OPENROUTER?.toLowerCase();
  if (flag === "false" || flag === "0") return false;
  if (flag === "true" || flag === "1") return true;
  return !!process.env.OPENROUTER_API_KEY;
}

/** Map native model IDs (gpt-4o, claude-opus-4-6) to OpenRouter slugs (openai/gpt-4o, …). */
export function resolveOpenRouterModelId(model: string): AIModel {
  const bare = model.startsWith("openrouter/") ? model.slice("openrouter/".length) : model;
  if (bare.includes("/")) return bare as AIModel;
  if (bare.startsWith("gpt-")) return `openai/${bare}` as AIModel;
  if (bare.startsWith("claude-")) return `anthropic/${bare}` as AIModel;
  if (bare.startsWith("gemini-")) return `google/${bare}` as AIModel;
  return bare as AIModel;
}

/** Env-aware default — falls back to Claude Opus. */
export function getDefaultAiModel(): AIModel {
  return (process.env.DEFAULT_AI_MODEL as AIModel) ?? DEFAULT_CODING_MODEL;
}

/** Env-aware fast model — falls back to Claude Haiku. */
export function getFastAiModel(): AIModel {
  return (process.env.FAST_AI_MODEL as AIModel) ?? FAST_CODING_MODEL;
}
