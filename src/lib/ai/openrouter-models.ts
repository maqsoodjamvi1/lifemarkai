export type OpenRouterModelCategory =
  | "frontier"
  | "coding"
  | "reasoning"
  | "fast"
  | "open"
  | "safety";

export interface OpenRouterModelOption {
  id: string;
  label: string;
  provider: string;
  badge: string;
  category: OpenRouterModelCategory;
  description?: string;
  fast?: boolean;
  best?: boolean;
  new?: boolean;
  free?: boolean;
  compare?: boolean;
  creditMultiplier?: number;
  color?: string;
}

// Compact approved model set. Keep this intentionally small: LifemarkAI should
// expose the models the product actually uses, not the whole OpenRouter catalog.
//
// IMPORTANT: this is a SECOND model list, separate from model-catalog.ts. It is
// what the user picks from in the UI, so a slug that dies here becomes a broken
// menu entry rather than a silent filter. Re-verified live 2026-08-19; two
// entries were dead and are removed:
//   - "qwen/qwen3-coder:free"    gone from OpenRouter (16 real calls in the logs)
//   - "mistralai/devstral-2512"  gone from OpenRouter
// Keep this list and APPROVED_SMART_MODEL_IDS in model-catalog.ts in step.
export const OPENROUTER_MODEL_CATALOG: readonly OpenRouterModelOption[] = [
  { id: "z-ai/glm-5.2:free", label: "GLM 5.2 (Free)", provider: "Z.ai", badge: "Free", category: "coding", fast: true, free: true, description: "Free tier, small edits only. Currently rate-limited upstream on most calls." },
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "DeepSeek", badge: "Fast", category: "fast", fast: true, description: "Classification and chat. Very quick on short prompts; not for file edits." },
  { id: "openai/gpt-5.6-luna", label: "GPT-5.6 Luna", provider: "OpenAI", badge: "Coder", category: "coding", best: true, new: true, fast: true, compare: true, description: "Writes the project and performs the first repair. Fastest coder tested (1.7s) and the strongest design output per dollar." },
  { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro", provider: "DeepSeek", badge: "Reasoning", category: "reasoning", compare: true, description: "Diagnoses failed builds and handles hard reasoning." },
  { id: "openai/gpt-5.6-terra", label: "GPT-5.6 Terra", provider: "OpenAI", badge: "Premium", category: "frontier", best: true, compare: true, creditMultiplier: 2, description: "Premium tier for complex builds. Same lab as the coder, so it is no longer the escalation step." },
  { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5", provider: "Anthropic", badge: "Escalation", category: "frontier", best: true, new: true, compare: true, creditMultiplier: 2, description: "The final repair, after a real browser render confirms the first repair failed. Cheaper than the premium tier it escalates past, and a different lab from the coder. Verified live 2026-08-27 (9 endpoints, 1M context)." },
] as const;

export type OpenRouterModelId = string;

export const CHAT_MODEL_OPTIONS = OPENROUTER_MODEL_CATALOG;
export const SETTINGS_MODEL_OPTIONS = OPENROUTER_MODEL_CATALOG;
export const AI_INTEGRATION_MODEL_OPTIONS = OPENROUTER_MODEL_CATALOG.filter((model) =>
  model.category !== "safety",
);
export const MODEL_COMPARE_OPTIONS = OPENROUTER_MODEL_CATALOG.filter((model) => model.compare);

export function getOpenRouterModelLabel(id: string): string {
  return OPENROUTER_MODEL_CATALOG.find((model) => model.id === id)?.label ?? id;
}

export function getOpenRouterModelProvider(id: string): string {
  return OPENROUTER_MODEL_CATALOG.find((model) => model.id === id)?.provider ?? "OpenRouter";
}

export const OPENROUTER_MODEL_IDS = OPENROUTER_MODEL_CATALOG.map((model) => model.id);
