/**
 * Approved OpenRouter model catalog + prompt-aware selection.
 *
 * LifemarkAI intentionally exposes a compact, cost-controlled set of models
 * across Qwen, Kimi, DeepSeek, Claude, GPT/Codex, Gemini, and a few extra
 * families. `selectModelChain()` reads a
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
 * Every entry has an env override hook (OPENROUTER_MODEL__<KEY>), but overrides
 * are still filtered through the approved set below. All ids are OpenRouter
 * slugs and route through the single OPENROUTER_API_KEY.
 */
import type { AIModel } from "./provider.ts";
import { DEFAULT_CODING_MODEL, ECONOMY_CODING_MODEL, ECONOMY_CHAT_MODEL, FREE_CODING_MODEL } from "./model-defaults.ts";

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
const RAW_MODEL_CATALOG: CatalogModel[] = [
  {
    id: envSlug("FREE_CODER", FREE_CODING_MODEL),
    label: "Qwen3 Coder Free",
    family: "qwen-free",
    strengths: ["code", "fixes", "cheap", "fast", "longContext"],
    tier: "fast",
    cost: 0,
    envKey: "FREE_CODER",
  },
  {
    id: envSlug("ECONOMY_CODER", ECONOMY_CODING_MODEL),
    label: "Economy Coder",
    family: "economy-code",
    strengths: ["code", "fixes", "cheap", "fast", "longContext"],
    tier: "balanced",
    cost: 1,
    envKey: "ECONOMY_CODER",
  },
  {
    id: envSlug("ECONOMY_CHAT", ECONOMY_CHAT_MODEL),
    label: "Economy Chat",
    family: "economy-chat",
    strengths: ["fast", "cheap", "content", "reasoning"],
    tier: "fast",
    cost: 1,
    envKey: "ECONOMY_CHAT",
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
    // Sonnet 5 replaces Sonnet 4.6 (2026-07-30): newer generation at $2/$10 vs
    // $3/$15, same 1M context, 99.95% uptime. Another version bump that costs
    // less, so `cost` drops from 3 to 2.
    id: envSlug("CLAUDE_SONNET", "anthropic/claude-sonnet-5"),
    label: "Claude Sonnet 5",
    family: "anthropic",
    strengths: ["code", "design", "reasoning", "content", "fixes"],
    tier: "balanced",
    cost: 2,
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
    // GPT-5.6 Terra replaces GPT-5.5 as the OpenAI frontier entry (2026-07-30).
    // 5.5 was $5/$30 with no endpoint above 99% uptime; Terra is $1.25/$7.50 at
    // 99.7% on a 1.05M context — a generation newer and ~4x cheaper, so `cost`
    // drops from 5 to 2.
    id: envSlug("GPT", "openai/gpt-5.6-terra"),
    label: "GPT-5.6 Terra",
    family: "openai",
    strengths: ["reasoning", "code", "content", "vision", "longContext"],
    tier: "frontier",
    cost: 2,
    envKey: "GPT",
  },
  {
    // Cheapest of the 5.6 family at $0.50/$3.00 — frontier-generation quality on
    // an economy budget, which is exactly the tier this product defaults to.
    id: envSlug("GPT_5_6_LUNA", "openai/gpt-5.6-luna"),
    label: "GPT-5.6 Luna",
    family: "openai-luna",
    strengths: ["reasoning", "code", "content", "vision", "longContext"],
    tier: "balanced",
    cost: 1,
    envKey: "GPT_5_6_LUNA",
  },
  {
    id: envSlug("GPT_5_2", "openai/gpt-5.2"),
    label: "GPT-5.2",
    family: "openai-gpt52",
    strengths: ["reasoning", "code", "content", "vision", "longContext"],
    tier: "frontier",
    cost: 4,
    envKey: "GPT_5_2",
  },
  {
    id: envSlug("GPT_5_2_CODEX", "openai/gpt-5.2-codex"),
    label: "GPT-5.2 Codex",
    family: "openai-codex",
    strengths: ["code", "fixes", "reasoning", "longContext", "vision"],
    tier: "frontier",
    cost: 4,
    envKey: "GPT_5_2_CODEX",
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
    // Newest Gemini flash tier ($0.75/$3.75, 1M context, 99.92% uptime). This is
    // what Lovable defaults its app AI to; we offer it but do NOT default to it,
    // because gemini-3.1-flash-lite below is 3x cheaper for the same job.
    id: envSlug("GEMINI_FLASH_LATEST", "google/gemini-3.6-flash"),
    label: "Gemini 3.6 Flash",
    family: "google-36",
    strengths: ["fast", "reasoning", "vision", "longContext", "content"],
    tier: "balanced",
    cost: 2,
    envKey: "GEMINI_FLASH_LATEST",
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
    id: envSlug("KIMI_CODE", "moonshotai/kimi-k2.7-code"),
    label: "Kimi K2.7 Code",
    family: "moonshotai",
    strengths: ["code", "fixes", "longContext"],
    tier: "balanced",
    cost: 2,
    envKey: "KIMI_CODE",
  },
  {
    id: envSlug("DEVSTRAL", "mistralai/devstral-2512"),
    label: "Devstral 2",
    family: "mistralai",
    strengths: ["fast", "cheap", "code", "fixes"],
    tier: "fast",
    cost: 1,
    envKey: "DEVSTRAL",
  },
  {
    id: envSlug("GLM_TURBO", "z-ai/glm-5-turbo"),
    label: "GLM 5 Turbo",
    family: "z-ai",
    strengths: ["fast", "cheap", "content", "reasoning"],
    tier: "fast",
    cost: 1,
    envKey: "GLM_TURBO",
  },
];

/**
 * Allowlist gate for MODEL_CATALOG. A catalog entry whose id is missing from this
 * set is filtered out SILENTLY — so any slug added above must be added here too,
 * or the model simply never appears and nothing says why.
 *
 * Every id was verified live against openrouter.ai/api/v1/models/<slug>/endpoints
 * on 2026-07-30. Two notes from that check:
 *   - `z-ai/glm-5.2` was NOT adopted: it is listed in OpenRouter's catalog but
 *     returns an empty `endpoints` array, so no provider serves it. glm-5-turbo
 *     stays.
 *   - `openai/gpt-5.6-codex` does not exist; gpt-5.2-codex stays as the
 *     codex-branded option.
 */
const APPROVED_SMART_MODEL_IDS = new Set<string>([
  // Economy tier — the default path. Cheapest credible models, deliberately kept.
  "cohere/north-mini-code:free",
  "qwen/qwen3-coder:free",
  "qwen/qwen3-coder",
  "moonshotai/kimi-k2.7-code",
  "deepseek/deepseek-v4-flash",
  "deepseek/deepseek-v4-pro",
  "google/gemini-3.1-flash-lite",
  "z-ai/glm-5-turbo",
  "mistralai/devstral-2512",
  // Current generation.
  "anthropic/claude-haiku-4.5",
  "anthropic/claude-sonnet-5",
  "anthropic/claude-opus-4.8",
  "openai/gpt-5.6-terra",
  "openai/gpt-5.6-luna",
  "google/gemini-3.5-flash",
  "google/gemini-3.6-flash",
  // Previous generation, still resolving — kept selectable, no longer defaults.
  "openai/gpt-5.2",
  "openai/gpt-5.2-codex",
]);

export const MODEL_CATALOG: CatalogModel[] = RAW_MODEL_CATALOG.filter((model) =>
  APPROVED_SMART_MODEL_IDS.has(model.id),
);

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

const CLAUDE_EXPLICIT_RE =
  /\b(?:use|select|choose|route|run|try|switch to|with|via)\s+(?:anthropic\/)?claude\b|\bclaude\s+(?:sonnet|opus|haiku)\b/i;

const CLAUDE_REQUIRED_SIGNAL_RE =
  /\b(deep|complete|hard|complex|critical|production|enterprise|security|audit|architecture|architectural|root cause|race condition|hydration|memory leak|performance|slow query|build fail|type errors?|regression|multi[- ]?file|cross[- ]?file|whole app|full app|entire app|codebase|refactor|rewrite|migration|data model|rls|payment|auth|permissions?|editor intelligence|agent loop|self[- ]?verify|vibe coding|lovable parity)\b/i;

const CLAUDE_REQUIRED_ACTION_RE =
  /\b(fix|debug|diagnose|investigate|analy[sz]e|architect|plan|review|refactor|rewrite|stabilize|harden|secure|optimi[sz]e|improve|complete|wire|integrate)\b/i;

const CLAUDE_OPUS_RE =
  /\b(claude\s+opus|opus|security audit|production outage|critical outage|whole codebase|entire codebase|architecture review|root cause across)\b/i;

function asStrengthArray(strengths?: Iterable<ModelStrength>): ModelStrength[] {
  return strengths ? Array.from(strengths) : [];
}

export function shouldAutoSelectClaude(
  prompt: string,
  opts: { desired?: Iterable<ModelStrength>; mode?: string; fileCount?: number } = {},
): boolean {
  const p = (prompt ?? "").trim();
  if (!p) return false;
  if (CLAUDE_EXPLICIT_RE.test(p)) return true;

  const desired = asStrengthArray(opts.desired);
  const heavyDesired = desired.some((s) => s === "reasoning" || s === "fixes" || s === "longContext");
  const largeContext = (opts.fileCount ?? 0) >= 20 || p.length >= 320;
  const complexMode = opts.mode === "agent" || opts.mode === "build" || opts.mode === "plan";

  return (
    CLAUDE_REQUIRED_SIGNAL_RE.test(p) &&
    CLAUDE_REQUIRED_ACTION_RE.test(p) &&
    (heavyDesired || largeContext || complexMode)
  );
}

function selectClaudeAutoModel(prompt: string, desired: Iterable<ModelStrength>): AIModel | null {
  if (!shouldAutoSelectClaude(prompt, { desired })) return null;
  const preferred = CLAUDE_OPUS_RE.test(prompt)
    ? "anthropic/claude-opus-4.8"
    : "anthropic/claude-sonnet-5";
  return MODEL_CATALOG.some((model) => model.id === preferred) ? (preferred as AIModel) : null;
}

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

  const heavyDesired = ["design", "fixes", "reasoning", "longContext", "vision"].some((s) =>
    desired.has(s as ModelStrength),
  );

  // Tier preference: heavy work wants frontier, lightweight wants fast.
  if (preferCheap) {
    if (model.tier === "fast") score += 3;
    if (model.tier === "balanced") score += 1;
    score -= model.cost; // cheaper is better
  } else {
    if (model.tier === "frontier") score += 3;
    if (model.tier === "balanced") score += 1;
    if (heavyDesired && model.tier === "fast") score -= 2;
    if (heavyDesired && model.cost === 0) score -= 2;
    score -= Math.max(0, model.cost - 3); // mild penalty only for premium
    // Quality tier = OpenAI + Claude (Lovable-style). On real work (non-cheap),
    // prefer these two families so they lead and are the escalation targets;
    // trivial tasks stay on the free tier (the preferCheap branch above).
    if (model.family === "anthropic" || model.family.startsWith("openai")) score += 2;
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
  const claudeAutoModel = selectClaudeAutoModel(prompt, desired);
  const effectivePreferCheap = claudeAutoModel ? false : preferCheap;

  const ranked: Scored[] = MODEL_CATALOG.map((model) => ({
    model,
    score: scoreModel(model, desired, effectivePreferCheap),
  })).sort((a, b) => b.score - a.score || a.model.cost - b.model.cost);

  // Build the chain, preferring family diversity so escalation hits a different lab.
  const chain: AIModel[] = [];
  const seenFamilies = new Set<string>();
  if (claudeAutoModel) {
    const model = MODEL_CATALOG.find((entry) => entry.id === claudeAutoModel);
    if (model) {
      chain.push(model.id);
      seenFamilies.add(model.family);
    }
  }
  for (const { model } of ranked) {
    if (chain.length >= maxChain) break;
    if (chain.includes(model.id)) continue;
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

  // Cost-smart free→heavy cascade: when we lead with a free/cheap model (to
  // maximise free-tier usage on the first try), guarantee a HEAVY frontier model
  // is later in the chain so a stuck task escalates UP — not sideways to another
  // weak model. This is the "use the free model AND the heavy model, smartly"
  // pattern: cheap first, strong safety net on retry.
  const hasFrontier = chain.some((id) => getCatalogModel(id)?.tier === "frontier");
  const primaryCheap = (getCatalogModel(chain[0])?.cost ?? 5) <= 1;
  if (primaryCheap && !hasFrontier) {
    const heavy = MODEL_CATALOG.filter((m) => m.tier === "frontier" && !chain.includes(m.id)).sort(
      (a, b) => {
        const am = [...desired].filter((s) => a.strengths.includes(s)).length;
        const bm = [...desired].filter((s) => b.strengths.includes(s)).length;
        return bm - am || b.cost - a.cost; // best strength match, then strongest
      },
    )[0];
    if (heavy) chain.push(heavy.id);
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
