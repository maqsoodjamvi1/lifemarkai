import type { AIModel } from "./provider";

/** Primary model for coding — Claude Opus for best code quality. */
export const DEFAULT_CODING_MODEL: AIModel = "claude-opus-4-6";

/** Fast/cheap model for lightweight tasks (reviews, autocomplete, etc.). */
export const FAST_CODING_MODEL: AIModel = "claude-haiku-4-5-20251001";

/** Balanced Claude model for planning and medium-complexity chat. */
export const BALANCED_CODING_MODEL: AIModel = "claude-sonnet-4-6";

/** Env-aware default — falls back to Claude Opus. */
export function getDefaultAiModel(): AIModel {
  return (process.env.DEFAULT_AI_MODEL as AIModel) ?? DEFAULT_CODING_MODEL;
}

/** Env-aware fast model — falls back to Claude Haiku. */
export function getFastAiModel(): AIModel {
  return (process.env.FAST_AI_MODEL as AIModel) ?? FAST_CODING_MODEL;
}
