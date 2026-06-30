/**
 * Curated OpenRouter model catalog + prompt-aware selection.
 *
 * "Add all OpenRouter models" — pragmatically. Rather than pin LifemarkAI to a
 * couple of tiers, this maintains a curated, family-diverse set of the strongest
 * OpenRouter models, each tagged by capability. `selectModelChain()` reads a
 * prompt, infers what it needs, and returns an ORDERED cascade:
 *
 *   chain[0]   = best-fit model for the task
 *   chain[1..] = strong fallbacks from DIFFERENT provider families
 *
 * The cascade powers the hybrid solve: try the best model, and if its output
 * fails verification, escalate to a diverse model (cross-model verify) — see
 * lib/ai/self-verify.ts. A guaranteed-valid `anchor` is always appended last so
 * routing degrades gracefully even if a catalog slug is unknown to OpenRouter
 * (the provider layer also has an invalid-slug safety net).
 *
 * Every entry is env-overridable (OPENROUTER_MODEL__<KEY>) so operators can
 * correct slugs without a code change. All ids are OpenRouter slugs and route
 * through the single OPENROUTER_API_KEY.
 */
import type { AIModel } from "./provider";
import { DEFAULT_CODING_MODEL } from "./model-defaults";

export type ModelStrength =
  | "code"
  | "design"
  | "reasoning"
  | "content"
  | "fast"
  | "cheap"
  | "vision"
  | "longContext"
  | "fixes";

export type ModelTierName = "frontier" | "balanced" | "fast";

export interface CatalogModel {
  /** OpenRouter slug — routes via the single OPENROUTER_API_KEY. */
  id: AIModel;
  label: string;
  /** Provider family — keeps the cascade cross-model (diverse on escalation). */
  family: string;
  strengths: ModelStrength[];
  tier: ModelTierName;
  /** Relative cost, 1 (cheapest) .. 5 (premium). */
  cost: number;
  /** Env var that overrides this entry's slug (without the OPENROUTER_MODEL__ prefix). */
  envKey: string;
}

/** Resolve a catalog slug, honoring an env override (OPENROUTER_MODEL__<KEY>). */
function envSlug(envKey: string, fallback: string): AIModel {
  const v = process.env[`OPENROUTER_MODEL__${envKey}`];
  return (v && v.trim() ? v.trim() : fallback) as AIModel;
}

/**
 * Curated best-in-class set. Slugs use OpenRouter's provider/model dot-notation
 * (matching model-defaults.ts). Keep this list small and strong — breadth of
 * FAMILIES (for diversity) matters more than count.
 */
export const MODEL_CATALOG: CatalogModel[] = [
  {
    id: envSlug("OPENROUTER_FUSION", "openrouter/fusion"),
    label: "OpenRouter Fusion",
    family: "router",
    strengths: ["reasoning", "code", "content", "design", "longContext"],
    tier: "frontier",
    cost: 4,
    envKey: "OPENROUTER_FUSION",
  },
  {
    id: envSlug("PARETO_CODE", "openrouter/pareto-code"),
    label: "Pareto Code Router",
    family: "router-code",
    strengths: ["code", "fixes", "reasoning", "longContext"],
    tier: "frontier",
    cost: 4,
    envKey: "PARETO_CODE",
  },
  {
    id: envSlug("CLAUDE_OPUS", "anthropic/claude-opus-4.8"),
    label: "Claude Opus 4.8",
    family: "anthropic",
    strengths: ["code", "reasoning", "fixes", "longContext", "design"],
    tier: "frontier",
    cost: 5,
    envKey: "CLAUDE_OPUS",
  },
  {
    id: envSlug("CLAUDE_SONNET", "anthropic/claude-sonnet-4.6"),
    label: "Claude Sonnet 4.6",
    family: "anthropic",
    strengths: ["code", "design", "reasoning", "content", "fixes"],
    tier: "balanced",
    cost: 3,
    envKey: "CLAUDE_SONNET",
  },
  {
    id: envSlug("CLAUDE_HAIKU", "anthropic/claude-haiku-4.5"),
    label: "Claude Haiku 4.5",
    family: "anthropic",
    strengths: ["fast", "cheap", "code", "content"],
    tier: "fast",
    cost: 1,
    envKey: "CLAUDE_HAIKU",
  },
  {
    id: envSlug("GPT", "openai/gpt-5.5"),
    label: "GPT-5.5",
    family: "openai",
    strengths: ["reasoning", "code", "content", "vision", "longContext"],
    tier: "frontier",
    cost: 5,
    envKey: "GPT",
  },
  {
    id: envSlug("GPT_MINI", "openai/gpt-5.4-mini"),
    label: "GPT-5.4 Mini",
    family: "openai",
    strengths: ["fast", "cheap", "code", "reasoning"],
    tier: "fast",
    cost: 2,
    envKey: "GPT_MINI",
  },
  {
    id: envSlug("GEMINI_PRO", "google/gemini-3.5-flash"),
    label: "Gemini 3.5 Flash",
    family: "google",
    strengths: ["reasoning", "vision", "longContext", "design", "content"],
    tier: "balanced",
    cost: 2,
    envKey: "GEMINI_PRO",
  },
  {
    id: envSlug("GEMINI_FLASH", "google/gemini-3.1-flash-lite"),
    label: "Gemini 3.1 Flash Lite",
    family: "google",
    strengths: ["fast", "cheap", "vision", "content"],
    tier: "fast",
    cost: 1,
    envKey: "GEMINI_FLASH",
  },
  {
    id: envSlug("DEEPSEEK", "deepseek/deepseek-v4-pro"),
    label: "DeepSeek V4 Pro",
    family: "deepseek",
    strengths: ["code", "reasoning", "fixes", "cheap"],
    tier: "balanced",
    cost: 2,
    envKey: "DEEPSEEK",
  },
  {
    id: envSlug("DEEPSEEK_FLASH", "deepseek/deepseek-v4-flash"),
    label: "DeepSeek V4 Flash",
    family: "deepseek",
    strengths: ["fast", "cheap", "code"],
    tier: "fast",
    cost: 1,
    envKey: "DEEPSEEK_FLASH",
  },
  {
    id: envSlug("QWEN_CODER", "qwen/qwen3-coder"),
    label: "Qwen3 Coder",
    family: "qwen",
    strengths: ["code", "fixes", "cheap", "longContext"],
    tier: "balanced",
    cost: 2,
    envKey: "QWEN_CODER",
  },
  {
    id: envSlug("GROK", "x-ai/grok-4.3"),
    label: "Grok 4.3",
    family: "x-ai",
    strengths: ["reasoning", "code", "content"],
    tier: "frontier",
    cost: 4,
    envKey: "GROK",
  },
  {
    id: envSlug("MISTRAL", "mistralai/mistral-large-2512"),
    label: "Mistral Large 3",
    family: "mistralai",
    strengths: ["code", "content", "cheap"],
    tier: "balanced",
    cost: 2,
    envKey: "MISTRAL",
  },
  {
    id: envSlug("KIMI_CODE", "moonshotai/kimi-k2.7-code"),
    label: "Kimi K2.7 Code",
    family: "moonshotai",
    strengths: ["code", "fixes", "longContext"],
    tier: "balanced",
    cost: 2,
    envKey: "KIMI_CODE",
  },
];

// ── Prompt → strength scoring ────────────────────────────────────────────────
// Local regexes (kept here to avoid a circular import with editor-intelligence,
// which imports this module).

const RE = {
  design:
    /\b(design|styl(e|ing)|theme|colou?r|palette|layout|spacing|typograph|font|ui|ux|responsive|animation|hero section|landing page|polish|beautif|modern look|redesign|visual|gradient|dark mode|make it look)\b/i,
  content:
    /\b(copy|copywriting|content|headlines?|taglines?|slogans?|descriptions?|blog post|articles?|about (us|page)|marketing|seo|microcopy|cta text|rewrite the (text|copy)|write (the|some|a|product|copy|content|text))\b/i,
  reasoning:
    /\b(plan|architect|investigate|analyze|analyse|strategy|roadmap|how should|why does|why is|explain why|think through|break down|trade-?offs?|compare|decide|root cause)\b/i,
  fixes: /\b(fix|debug|resolve|repair|broken|error|bug|crash|not working|doesn'?t work|stack ?trace|exception)\b/i,
  vision: /\b(screenshot|image|photo|figma|from (this|the) (image|design|mockup)|replicate this|this picture)\b/i,
  longContext:
    /\b(entire (app|codebase|project)|whole (app|codebase|project)|across (the )?(app|files|codebase)|every (file|page|component)|refactor|migrate|large file)\b/i,
} as const;

/** Infer which capabilities a prompt needs. */
export function scorePromptStrengths(prompt: string): Set<ModelStrength> {
  const p = prompt ?? "";
  const out = new Set<ModelStrength>();
  if (RE.fixes.test(p)) out.add("fixes");
  if (RE.design.test(p)) out.add("design");
  if (RE.content.test(p)) out.add("content");
  if (RE.reasoning.test(p)) out.add("reasoning");
  if (RE.vision.test(p)) out.add("vision");
  if (RE.longContext.test(p)) out.add("longContext");
  // Code is the default workload unless the prompt is purely content/reasoning.
  if (out.size === 0 || out.has("fixes") || out.has("longContext")) out.add("code");
  return out;
}

/** Is this a small/trivial prompt where a cheaper, faster model is fine? */
function isLightweight(prompt: string): boolean {
  const p = (prompt ?? "").trim();
  if (p.length > 160) return false;
  const coordinators = p.match(/\b(and|then|also|plus|after that)\b/gi)?.length ?? 0;
  return coordinators < 2;
}

export interface SelectOpts {
  /** Strengths required/hinted by the caller (e.g. from editor mode). */
  require?: ModelStrength[];
  /** Force cheap/fast preference (else inferred from prompt size). */
  preferCheap?: boolean;
  /** Max models in the returned cascade (default 3). */
  maxChain?: number;
  /** Guaranteed-valid model appended last (default: coding tier). */
  anchor?: AIModel;
}

interface Scored {
  model: CatalogModel;
  score: number;
}

/** Score one model against the desired strengths + cost/tier preference. */
function scoreModel(model: CatalogModel, desired: Set<ModelStrength>, preferCheap: boolean): number {
  let score = 0;
  for (const s of desired) if (model.strengths.includes(s)) score += 3;

  // Tier preference: heavy work wants frontier, lightweight wants fast.
  if (preferCheap) {
    if (model.tier === "fast") score += 3;
    if (model.tier === "balanced") score += 1;
    score -= model.cost; // cheaper is better
  } else {
    if (model.tier === "frontier") score += 3;
    if (model.tier === "balanced") score += 1;
    score -= Math.max(0, model.cost - 3); // mild penalty only for premium
  }
  return score;
}

/**
 * Select an ordered, family-diverse cascade of models for a prompt.
 * chain[0] is the best fit; later entries are strong fallbacks from other
 * provider families (for cross-model verification on retry).
 */
export function selectModelChain(prompt: string, opts: SelectOpts = {}): AIModel[] {
  const maxChain = Math.max(1, opts.maxChain ?? 3);
  const anchor = (opts.anchor ?? DEFAULT_CODING_MODEL) as AIModel;

  const desired = new Set<ModelStrength>(scorePromptStrengths(prompt));
  for (const s of opts.require ?? []) desired.add(s);

  // Auto cost-preference only when the work is genuinely lightweight — never when
  // a demanding capability (design/fixes/reasoning/long-context/vision) is needed,
  // so e.g. the self-verify fix cascade doesn't fall back to a weak model.
  const HEAVY: ModelStrength[] = ["design", "fixes", "reasoning", "longContext", "vision"];
  const hasHeavy = HEAVY.some((s) => desired.has(s));
  const preferCheap = opts.preferCheap ?? (isLightweight(prompt) && !hasHeavy);

  const ranked: Scored[] = MODEL_CATALOG.map((model) => ({
    model,
    score: scoreModel(model, desired, preferCheap),
  })).sort((a, b) => b.score - a.score || a.model.cost - b.model.cost);

  // Build the chain, preferring family diversity so escalation hits a different lab.
  const chain: AIModel[] = [];
  const seenFamilies = new Set<string>();
  for (const { model } of ranked) {
    if (chain.length >= maxChain) break;
    if (seenFamilies.has(model.family)) continue;
    chain.push(model.id);
    seenFamilies.add(model.family);
  }
  // Top up from remaining high scorers if diversity left us short.
  if (chain.length < maxChain) {
    for (const { model } of ranked) {
      if (chain.length >= maxChain) break;
      if (!chain.includes(model.id)) chain.push(model.id);
    }
  }

  // Guarantee a known-good anchor as the final fallback.
  if (!chain.includes(anchor)) chain.push(anchor);
  return chain;
}

/** Convenience: the single best-fit model for a prompt. */
export function selectModel(prompt: string, opts: SelectOpts = {}): AIModel {
  return selectModelChain(prompt, { ...opts, maxChain: 1 })[0];
}

// ── Model-aware prompting ────────────────────────────────────────────────────
// The base system prompts are tuned for Claude. When the catalog routes to a
// different model, append a concise adapter so each model performs at its best.

/** Look up a catalog entry by its (resolved) slug. */
export function getCatalogModel(id: string): CatalogModel | null {
  return MODEL_CATALOG.find((m) => m.id === id) ?? null;
}

/** Infer a provider family from a slug when it isn't a catalog entry (e.g. router metas). */
function familyFromSlug(id: string): string {
  const s = (id ?? "").toLowerCase();
  if (s.includes("claude") || s.startsWith("anthropic/")) return "anthropic";
  if (s.includes("gpt") || s.startsWith("openai/")) return "openai";
  if (s.includes("gemini") || s.startsWith("google/")) return "google";
  if (s.includes("deepseek")) return "deepseek";
  if (s.includes("qwen")) return "qwen";
  if (s.includes("grok") || s.startsWith("x-ai/")) return "x-ai";
  if (s.includes("mistral")) return "mistralai";
  return "router";
}

/**
 * A concise, model-aware addendum that tunes a system prompt to the strengths
 * and quirks of the selected model. Returns "" when no special guidance is
 * warranted, to avoid prompt noise.
 */
export function buildModelPromptHints(model: string): string {
  const entry = getCatalogModel(model);
  const family = entry?.family ?? familyFromSlug(model);
  const tier: ModelTierName =
    entry?.tier ?? (/(flash|mini|haiku|fast)/i.test(model) ? "fast" : "balanced");
  const strengths = entry?.strengths ?? [];
  const lines: string[] = [];

  if (tier === "fast" || strengths.includes("cheap")) {
    lines.push(
      "Speed tier: make the smallest correct change. Be precise and concise — do not refactor unrelated code or over-engineer.",
    );
  } else if (tier === "frontier") {
    lines.push(
      "Frontier tier: you can handle complex, multi-file work. Plan briefly, then implement thoroughly and re-check your own output before finishing.",
    );
  }

  // Non-Anthropic families: reinforce strict output-contract adherence, since the
  // base prompts are tuned for Claude's formatting reliability.
  if (family !== "anthropic") {
    lines.push(
      "Adhere to the required output format EXACTLY (e.g. the JSON patch / file contract). Emit only what the contract specifies — no extra prose and no markdown fences wrapping the whole response.",
    );
  }

  if (lines.length === 0) return "";
  return `\n\n<model_adapter model="${model}">\n${lines.map((l) => `- ${l}`).join("\n")}\n</model_adapter>`;
}

/** Append the model-aware adapter to a base system prompt. */
export function applyModelAdapter(systemPrompt: string, model: string): string {
  const hints = buildModelPromptHints(model);
  return hints ? systemPrompt + hints : systemPrompt;
}
