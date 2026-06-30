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

// Curated from OpenRouter's public model catalog. The provider layer also accepts
// arbitrary OpenRouter slugs, so this list is for UI discovery rather than a hard
// routing limit.
export const OPENROUTER_MODEL_CATALOG: readonly OpenRouterModelOption[] = [
  { id: "openrouter/fusion", label: "OpenRouter Fusion", provider: "OpenRouter", badge: "Router", category: "frontier", best: true, compare: true, creditMultiplier: 2, color: "text-cyan-400 border-cyan-500/30", description: "Routes across strong models automatically." },
  { id: "openrouter/pareto-code", label: "Pareto Code Router", provider: "OpenRouter", badge: "Code Router", category: "coding", best: true, compare: true, creditMultiplier: 2, color: "text-cyan-400 border-cyan-500/30", description: "OpenRouter coding router for implementation tasks." },
  { id: "anthropic/claude-opus-4.8", label: "Claude Opus 4.8", provider: "Anthropic", badge: "Claude", category: "frontier", best: true, new: true, compare: true, creditMultiplier: 2, color: "text-violet-400 border-violet-500/30" },
  { id: "anthropic/claude-opus-4.8-fast", label: "Claude Opus 4.8 Fast", provider: "Anthropic", badge: "Claude", category: "frontier", fast: true, new: true, creditMultiplier: 2 },
  { id: "anthropic/claude-opus-4.7", label: "Claude Opus 4.7", provider: "Anthropic", badge: "Claude", category: "frontier", creditMultiplier: 2 },
  { id: "anthropic/claude-sonnet-4.6", label: "Claude Sonnet 4.6", provider: "Anthropic", badge: "Claude", category: "frontier", compare: true, color: "text-violet-400 border-violet-500/30" },
  { id: "anthropic/claude-haiku-4.5", label: "Claude Haiku 4.5", provider: "Anthropic", badge: "Claude", category: "fast", fast: true },
  { id: "anthropic/claude-fable-5", label: "Claude Fable 5", provider: "Anthropic", badge: "Claude", category: "frontier", new: true },
  { id: "openai/gpt-5.5-pro", label: "GPT-5.5 Pro", provider: "OpenAI", badge: "OpenAI", category: "frontier", best: true, new: true, creditMultiplier: 2 },
  { id: "openai/gpt-5.5", label: "GPT-5.5", provider: "OpenAI", badge: "OpenAI", category: "frontier", new: true, creditMultiplier: 2 },
  { id: "openai/gpt-chat-latest", label: "GPT Chat Latest", provider: "OpenAI", badge: "OpenAI", category: "frontier", compare: true, color: "text-emerald-400 border-emerald-500/30" },
  { id: "openai/gpt-4o", label: "GPT-4o", provider: "OpenAI", badge: "OpenAI", category: "frontier", creditMultiplier: 2 },
  { id: "openai/gpt-4o-mini", label: "GPT-4o mini", provider: "OpenAI", badge: "OpenAI", category: "fast", fast: true },
  { id: "openai/gpt-5.4-mini", label: "GPT-5.4 Mini", provider: "OpenAI", badge: "OpenAI", category: "fast", fast: true, new: true },
  { id: "openai/gpt-5.4-nano", label: "GPT-5.4 Nano", provider: "OpenAI", badge: "OpenAI", category: "fast", fast: true, new: true },
  { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash", provider: "Google", badge: "Google", category: "fast", fast: true, new: true },
  { id: "google/gemini-3.1-flash-lite", label: "Gemini 3.1 Flash Lite", provider: "Google", badge: "Google", category: "fast", fast: true },
  { id: "google/gemini-3-pro-image", label: "Gemini 3 Pro Image", provider: "Google", badge: "Google", category: "frontier", new: true },
  { id: "google/gemini-3.1-flash-image", label: "Gemini 3.1 Flash Image", provider: "Google", badge: "Google", category: "fast", fast: true, new: true },
  { id: "deepseek/deepseek-v4-pro", label: "DeepSeek V4 Pro", provider: "DeepSeek", badge: "DeepSeek", category: "coding", best: true, new: true, compare: true, color: "text-blue-400 border-blue-500/30" },
  { id: "deepseek/deepseek-v4-flash", label: "DeepSeek V4 Flash", provider: "DeepSeek", badge: "DeepSeek", category: "fast", fast: true, new: true },
  { id: "deepseek/deepseek-r1", label: "DeepSeek R1", provider: "DeepSeek", badge: "DeepSeek", category: "reasoning" },
  { id: "deepseek/deepseek-chat-v3-0324", label: "DeepSeek V3", provider: "DeepSeek", badge: "DeepSeek", category: "coding", compare: true, color: "text-blue-400 border-blue-500/30" },
  { id: "moonshotai/kimi-k2.7-code", label: "Kimi K2.7 Code", provider: "MoonshotAI", badge: "Kimi", category: "coding", best: true, new: true, compare: true, color: "text-sky-400 border-sky-500/30" },
  { id: "moonshotai/kimi-k2.6", label: "Kimi K2.6", provider: "MoonshotAI", badge: "Kimi", category: "coding", new: true },
  { id: "moonshotai/kimi-k2.5", label: "Kimi K2.5", provider: "MoonshotAI", badge: "Kimi", category: "open" },
  { id: "qwen/qwen3.7-max", label: "Qwen3.7 Max", provider: "Qwen", badge: "Qwen", category: "frontier", new: true },
  { id: "qwen/qwen3.7-plus", label: "Qwen3.7 Plus", provider: "Qwen", badge: "Qwen", category: "frontier", new: true },
  { id: "qwen/qwen3.6-max-preview", label: "Qwen3.6 Max Preview", provider: "Qwen", badge: "Qwen", category: "frontier", new: true },
  { id: "qwen/qwen3.6-flash", label: "Qwen3.6 Flash", provider: "Qwen", badge: "Qwen", category: "fast", fast: true },
  { id: "qwen/qwen3-coder", label: "Qwen3 Coder", provider: "Qwen", badge: "Qwen", category: "coding", fast: true },
  { id: "qwen/qwen3.6-35b-a3b", label: "Qwen3.6 35B", provider: "Qwen", badge: "Qwen", category: "open" },
  { id: "qwen/qwen3-235b-a22b", label: "Qwen3 235B", provider: "Qwen", badge: "Qwen", category: "open" },
  { id: "x-ai/grok-4.3", label: "Grok 4.3", provider: "xAI", badge: "xAI", category: "frontier", new: true, creditMultiplier: 2 },
  { id: "x-ai/grok-4.20", label: "Grok 4.20", provider: "xAI", badge: "xAI", category: "frontier", new: true, creditMultiplier: 2 },
  { id: "x-ai/grok-4.20-multi-agent", label: "Grok 4.20 Multi-Agent", provider: "xAI", badge: "xAI", category: "reasoning", new: true, creditMultiplier: 2 },
  { id: "x-ai/grok-build-0.1", label: "Grok Build 0.1", provider: "xAI", badge: "xAI", category: "coding", new: true },
  { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick", provider: "Meta", badge: "Meta", category: "open" },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", provider: "Meta", badge: "Meta", category: "open" },
  { id: "mistralai/mistral-medium-3-5", label: "Mistral Medium 3.5", provider: "Mistral", badge: "Mistral", category: "frontier", new: true },
  { id: "mistralai/mistral-large-2512", label: "Mistral Large 3", provider: "Mistral", badge: "Mistral", category: "frontier", new: true },
  { id: "mistralai/mistral-large", label: "Mistral Large", provider: "Mistral", badge: "Mistral", category: "frontier" },
  { id: "mistralai/mistral-small-2603", label: "Mistral Small 4", provider: "Mistral", badge: "Mistral", category: "fast", fast: true },
  { id: "mistralai/devstral-2512", label: "Devstral 2", provider: "Mistral", badge: "Mistral", category: "coding", fast: true },
  { id: "z-ai/glm-5.2", label: "GLM 5.2", provider: "Z.ai", badge: "GLM", category: "frontier", new: true },
  { id: "z-ai/glm-5.1", label: "GLM 5.1", provider: "Z.ai", badge: "GLM", category: "frontier" },
  { id: "z-ai/glm-5-turbo", label: "GLM 5 Turbo", provider: "Z.ai", badge: "GLM", category: "fast", fast: true },
  { id: "minimax/minimax-m3", label: "MiniMax M3", provider: "MiniMax", badge: "MiniMax", category: "frontier", new: true },
  { id: "minimax/minimax-m2.7", label: "MiniMax M2.7", provider: "MiniMax", badge: "MiniMax", category: "frontier" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b", label: "Nemotron 3 Ultra", provider: "NVIDIA", badge: "NVIDIA", category: "open" },
  { id: "nvidia/nemotron-3-ultra-550b-a55b:free", label: "Nemotron 3 Ultra Free", provider: "NVIDIA", badge: "NVIDIA", category: "open", free: true },
  { id: "nvidia/nemotron-3.5-content-safety:free", label: "Nemotron Content Safety", provider: "NVIDIA", badge: "Safety", category: "safety", free: true },
  { id: "cohere/north-mini-code:free", label: "North Mini Code Free", provider: "Cohere", badge: "Cohere", category: "coding", fast: true, free: true },
  { id: "kwaipilot/kat-coder-pro-v2", label: "KAT-Coder-Pro V2", provider: "Kwaipilot", badge: "Code", category: "coding", new: true },
  { id: "poolside/laguna-m.1", label: "Laguna M.1", provider: "Poolside", badge: "Poolside", category: "coding" },
  { id: "poolside/laguna-xs.2", label: "Laguna XS.2", provider: "Poolside", badge: "Poolside", category: "fast", fast: true },
  { id: "sakana/fugu-ultra", label: "Fugu Ultra", provider: "Sakana", badge: "Sakana", category: "frontier", new: true },
  { id: "nex-agi/nex-n2-pro", label: "Nex-N2-Pro", provider: "Nex AGI", badge: "Nex", category: "reasoning", new: true },
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
