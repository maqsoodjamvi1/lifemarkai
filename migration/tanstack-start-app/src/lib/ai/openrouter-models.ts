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
export const OPENROUTER_MODEL_CATALOG: readonly OpenRouterModelOption[] = [
  { id: "cohere/north-mini-code:free", label: "North Mini Code Free", provider: "Cohere", badge: "Cohere", category: "coding", fast: true, free: true, new: true, description: "Free code model (256k context) for small edits and first-pass fixes." },
  { id: "qwen/qwen3-coder:free", label: "Qwen3 Coder Free", provider: "Qwen", badge: "Qwen", category: "coding", fast: true, free: true, description: "Free coding model. Single provider — can be unavailable; falls back to a paid economy model." },
  { id: "qwen/qwen3-coder", label: "Qwen3 Coder", provider: "Qwen", badge: "Qwen", category: "coding", fast: true, compare: true, color: "text-cyan-400 border-cyan-500/30" },
  { id: "moonshotai/kimi-k2.7-code", label: "Kimi K2.7 Code", provider: "MoonshotAI", badge: "Kimi", category: "coding", best: true, new: true, compare: true, color: "text-sky-400 border-sky-500/30" },
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "DeepSeek", badge: "DeepSeek", category: "fast", fast: true, new: true },
  { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro", provider: "DeepSeek", badge: "DeepSeek", category: "coding", best: true, new: true, compare: true, color: "text-blue-400 border-blue-500/30" },
  { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5", provider: "Anthropic", badge: "Claude", category: "fast", fast: true },
  { id: "anthropic/claude-sonnet-5", label: "Claude Sonnet 5", provider: "Anthropic", badge: "Claude", category: "frontier", new: true, compare: true, color: "text-violet-400 border-violet-500/30" },
  { id: "anthropic/claude-opus-4.8", label: "Claude Opus 4.8", provider: "Anthropic", badge: "Claude", category: "frontier", best: true, compare: true, creditMultiplier: 2, color: "text-violet-400 border-violet-500/30" },
  { id: "openai/gpt-5.6-luna", label: "GPT-5.6 Luna", provider: "OpenAI", badge: "OpenAI", category: "reasoning", new: true, fast: true, compare: true, description: "Cheapest of the 5.6 family — frontier generation on an economy budget.", color: "text-emerald-400 border-emerald-500/30" },
  { id: "openai/gpt-5.6-terra", label: "GPT-5.6 Terra", provider: "OpenAI", badge: "OpenAI", category: "frontier", best: true, new: true, compare: true, color: "text-emerald-400 border-emerald-500/30" },
  { id: "openai/gpt-5.2", label: "GPT-5.2", provider: "OpenAI", badge: "OpenAI", category: "reasoning", compare: true, creditMultiplier: 2, color: "text-emerald-400 border-emerald-500/30" },
  { id: "openai/gpt-5.2-codex", label: "GPT-5.2 Codex", provider: "OpenAI", badge: "Codex", category: "coding", compare: true, creditMultiplier: 2, description: "Codex-branded coding model. No 5.6-generation codex variant exists yet.", color: "text-emerald-400 border-emerald-500/30" },
  { id: "google/gemini-3.6-flash", label: "Gemini 3.6 Flash", provider: "Google", badge: "Gemini", category: "reasoning", new: true, compare: true },
  { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", provider: "Google", badge: "Gemini", category: "fast", fast: true, compare: true },
  { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", provider: "Google", badge: "Gemini", category: "fast", fast: true, description: "Cheapest vision-capable model in the set." },
  { id: "mistralai/devstral-2512", label: "Devstral 2", provider: "Mistral", badge: "Extra", category: "coding", fast: true },
  { id: "z-ai/glm-5-turbo", label: "GLM 5 Turbo", provider: "Z.ai", badge: "Extra", category: "fast", fast: true },
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
