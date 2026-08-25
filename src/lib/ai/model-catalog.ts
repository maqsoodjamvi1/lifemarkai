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
import { DEFAULT_CODING_MODEL,ECONOMY_CODING_MODEL,ECONOMY_CHAT_MODEL,FREE_CODING_MODEL } from "./model-defaults.ts";

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
  // ───────────────────────────────────────────────────────────────────────────
  // THE LADDER — four models, one job each. See model-defaults.ts for the
  // pipeline this implements and the measured prices behind it.
  //
  //   classify -> generate -> (verify) -> diagnose -> repair -> (verify) -> escalate
  //
  // Three vendors across four slots, on purpose: the diagnosis model and the
  // model it briefs are never the same lab, which is the whole point of asking
  // one model why another one's code broke.
  // ───────────────────────────────────────────────────────────────────────────
  {
    // Free-user tier, SMALL EDITS ONLY — never a full production build.
    // See the warning in model-defaults.ts: this slug currently 429s on every
    // call, so provider.ts silently serves the paid tier instead.
    id: envSlug("FREE_CODER", FREE_CODING_MODEL),
    label: "GLM 5.2 (Free)",
    family: "z-ai",
    strengths: ["code", "fixes", "cheap", "fast"],
    tier: "fast",
    cost: 0,
    envKey: "FREE_CODER",
  },
  {
    // 1. CLASSIFY — request classification and chat turns.
    // Measured: ~1.7s on short prompts, but 175s on a 250-line file edit. It is
    // scoped to short work for exactly that reason; never route a build here.
    id: envSlug("CLASSIFY", "deepseek/deepseek-v4-flash"),
    label: "DeepSeek V4 Flash",
    family: "deepseek-flash",
    strengths: ["fast", "cheap", "content"],
    tier: "fast",
    cost: 1,
    envKey: "CLASSIFY",
  },
  {
    // 2. GENERATE — writes the project, and performs the FIRST repair.
    // 7/7 on the objective suite at 1.7s median — the fastest coder tested —
    // and the best design output per dollar in a rendered side-by-side against
    // Sonnet 5, Gemini 3.6 Flash, GLM 5.2, Haiku 4.5 and Mistral Small.
    id: envSlug("GENERATE", DEFAULT_CODING_MODEL),
    label: "GPT-5.6 Luna",
    family: "openai-luna",
    strengths: ["code", "fixes", "design", "content", "longContext", "cheap"],
    tier: "balanced",
    cost: 1,
    envKey: "GENERATE",
  },
  {
    // 3. DIAGNOSE — explains why the build failed. Prose, never code.
    // Cross-vendor from the generator by design; there is a test on it.
    id: envSlug("DIAGNOSE", "deepseek/deepseek-v4-pro"),
    label: "DeepSeek V4 Pro",
    family: "deepseek",
    strengths: ["reasoning", "fixes", "code", "longContext"],
    tier: "balanced",
    cost: 2,
    envKey: "DIAGNOSE",
  },
  {
    // 4. ESCALATE — complex builds and the FINAL repair, nothing else.
    // ~36x the price of the classify tier per build, so it is gated behind a
    // VERIFIED failure: a real browser render that still errors after GLM's
    // repair. If this fires on most builds, the repair prompt is the bug.
    id: envSlug("ESCALATE", "openai/gpt-5.6-terra"),
    label: "GPT-5.6 Terra",
    family: "openai",
    strengths: ["code", "reasoning", "fixes", "design", "content", "longContext", "vision"],
    tier: "frontier",
    cost: 3,
    envKey: "ESCALATE",
  },
];

/**
 * Allowlist gate for MODEL_CATALOG. A catalog entry whose id is missing from this
 * set is filtered out SILENTLY — so any slug added above must be added here too,
 * or the model simply never appears and nothing says why.
 *
 * Every id was RE-VERIFIED live against openrouter.ai/api/v1/models and
 * /models/<slug>/endpoints on 2026-08-19. Changes from the 2026-07-30 pass:
 *   - `qwen/qwen3-coder:free` is GONE from OpenRouter's catalog. It was still
 *     approved here, so it stayed selectable and would now hard-fail. Removed.
 *   - `mistralai/devstral-2512` is GONE too. Replaced with codestral-2508.
 *   - `z-ai/glm-5.2` was previously rejected for having an empty `endpoints`
 *     array. It now has 31 provider endpoints at 99.8-99.9% uptime, so it is
 *     adopted. Its `:free` variant is NOT: live calls returned HTTP 429 on
 *     every attempt, so it is listed nowhere. Free pools have to be called,
 *     not read off a catalog.
 *   - `nvidia/nemotron-3-super-120b-a12b:free` adopted as the free tier after
 *     benchmarking (see model-defaults.ts): 3-6x faster than the Cohere free
 *     model and correct on 3/3 small edits vs 1/3.
 *   - `openai/gpt-5.6-codex` still does not exist; gpt-5.2-codex stays.
 */
const APPROVED_SMART_MODEL_IDS = new Set<string>([
  "z-ai/glm-5.2:free",
  "deepseek/deepseek-v4-flash",
  "openai/gpt-5.6-luna",
  "deepseek/deepseek-v4-pro",
  "openai/gpt-5.6-terra",
]);

/**
 * The three alias entries at the top (FREE_CODER / ECONOMY_CODER / ECONOMY_CHAT)
 * resolve through model-defaults.ts, so they normally land on a slug that is
 * ALSO listed explicitly further down — "Economy Coder" and "Qwen3 Coder" were
 * both qwen/qwen3-coder, and "Economy Chat" and "DeepSeek V4 Flash" were both
 * deepseek-v4-flash. Two problems (found 2026-08-19): the model picker showed
 * the same model twice, and — worse — the two copies carry DIFFERENT `family`
 * strings ("economy-code" vs "qwen"), so selectModelChain's cross-family
 * cascade could "escalate" from a failed model to the exact same model while
 * believing it had switched vendors. Same echo-chamber bug the REVIEW_MODEL
 * comment in model-defaults.ts describes.
 *
 * Dedupe by id, keeping the LAST occurrence so the picker shows the specific
 * label ("Qwen3 Coder") rather than the alias ("Economy Coder"). When an alias
 * is pointed somewhere unique by env, it survives as its own entry as before.
 */
/**
 * The alias entries carried HARDCODED family strings ("free-coder",
 * "economy-code", "economy-chat") while their `id` follows model-defaults.ts.
 * So an alias resolving to a slug that is also listed explicitly looked like a
 * different vendor to the cascade even when it was the same model — and the
 * `:free`/paid pair of one model (e.g. z-ai/glm-5.2:free and z-ai/glm-5.2) is
 * the worst case: escalating between them re-runs the identical model. Point
 * each alias at the family of whatever it actually resolves to.
 */
const ALIAS_ENV_KEYS = new Set(["FREE_CODER", "ECONOMY_CODER", "ECONOMY_CHAT"]);
const baseSlug = (id: string) => id.replace(/:free$/, "");
const explicitFamilyBySlug = new Map(
  RAW_MODEL_CATALOG.filter((m) => !ALIAS_ENV_KEYS.has(m.envKey)).map((m) => [
    baseSlug(m.id),
    m.family,
  ]),
);
for (const model of RAW_MODEL_CATALOG) {
  if (!ALIAS_ENV_KEYS.has(model.envKey)) continue;
  model.family = explicitFamilyBySlug.get(baseSlug(model.id)) ?? familyFromSlug(model.id);
}

const dedupedByLastId = Array.from(
  new Map(RAW_MODEL_CATALOG.map((model) => [model.id, model])).values(),
);

export const MODEL_CATALOG: CatalogModel[] = dedupedByLastId.filter((model) =>
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

/**
 * TINY = a handful of words, no room for hidden complexity. Deliberately much
 * stricter than isLightweight() below, which allows up to 160 characters — long
 * enough to hold a real request like "fix the authentication flow so refresh
 * tokens rotate correctly". Only this tighter bar is allowed to override an
 * inferred "fixes" strength.
 */
function isTiny(prompt: string): boolean {
  const p = (prompt ?? "").trim();
  return p.length <= 60 && p.split(/\s+/).filter(Boolean).length <= 8;
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

/**
 * Capabilities that justify skipping the cheap tier.
 *
 * "fixes" is deliberately NOT in here — see HEAVY_UNLESS_TINY below.
 */
const HEAVY_STRENGTHS: ModelStrength[] = ["design", "reasoning", "longContext", "vision"];

/**
 * "fixes" is heavy only when the request is not trivially small.
 *
 * Measured 2026-08-19: "fix typo" routed to openai/gpt-5.6-terra — the frontier
 * tier — while "add a comma" correctly routed to the free tier. The ONLY
 * difference was the word "fix" tripping the fixes strength, which was on the
 * heavy list and therefore vetoed the cheap path outright. "fix" is one of the
 * most common words users type at this product, so this quietly pushed a large
 * share of two-word edits onto a model that costs ~$1 per build-equivalent
 * instead of $0.
 *
 * A caller that genuinely needs repair strength (self-verify's fix cascade)
 * passes `require: ["fixes"]`, and that still forces the heavy path — the point
 * is only that INFERRING "fixes" from a five-character prompt shouldn't.
 */
const HEAVY_UNLESS_TINY: ModelStrength[] = ["fixes"];

/** Score one model against the desired strengths + cost/tier preference. */
function scoreModel(
  model: CatalogModel,
  desired: Set<ModelStrength>,
  preferCheap: boolean,
  heavyDesired: boolean,
): number {
  let score = 0;
  for (const s of desired) if (model.strengths.includes(s)) score += 3;


  // Tier preference: heavy work wants frontier, lightweight wants fast.
  if (preferCheap) {
    if (model.tier === "fast") score += 3;
    if (model.tier === "balanced") score += 1;
    score -= model.cost; // cheaper is better
  } else {
    // Frontier is the ESCALATION target, not the default lead. It used to get
    // +3 here plus a further +2 for being Anthropic-or-OpenAI, which stacked to
    // +5 and meant the single most expensive model in the catalog led every
    // substantial request — the opposite of this product's cost policy. The
    // "cheap first, strong safety net on retry" rule further down already
    // guarantees a frontier model is reachable in the chain, so it does not
    // need to win the lead as well.
    if (model.tier === "frontier") score += 1;
    if (model.tier === "balanced") score += 2;
    if (heavyDesired && model.tier === "fast") score -= 2;
    if (heavyDesired && model.cost === 0) score -= 3;
    score -= Math.max(0, model.cost - 1); // every step above the budget tier costs a point
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
  const light = isLightweight(prompt);
  const tiny = isTiny(prompt);
  const required = new Set<ModelStrength>(opts.require ?? []);
  const hasHeavy =
    HEAVY_STRENGTHS.some((s) => desired.has(s)) ||
    // Explicitly-required repair strength still counts as heavy; merely
    // *inferring* it from a five-word prompt does not.
    HEAVY_UNLESS_TINY.some((s) => desired.has(s) && (!tiny || required.has(s)));
  const preferCheap = opts.preferCheap ?? (light && !hasHeavy);
  const claudeAutoModel = selectClaudeAutoModel(prompt, desired);
  const effectivePreferCheap = claudeAutoModel ? false : preferCheap;

  const ranked: Scored[] = MODEL_CATALOG.map((model) => ({
    model,
    score: scoreModel(model, desired, effectivePreferCheap, hasHeavy),
  })).sort((a, b) => b.score - a.score || a.model.cost - b.model.cost);

  // Build the chain, preferring VENDOR diversity so escalation hits a different
  // lab. This used to key on `family`, but families are variant buckets, not
  // vendors: "openai", "openai-codex", "openai-gpt52", "openai-luna" are four
  // families and one lab. A cascade of terra -> gpt-5.2-codex -> gpt-5.2 passed
  // the diversity check while being entirely OpenAI — so "escalate to a
  // different model for cross-model verification" escalated to the same lab's
  // house style and the same blind spots. Caught by scripts/eval-routing.mjs
  // (qualitySpansBoth) once that harness was resynced on 2026-08-19.
  //
  // `family` is still what buildModelPromptHints() keys on, so it stays as-is
  // on each entry; only the diversity rule changes.
  const chain: AIModel[] = [];
  const seenVendors = new Set<string>();
  const vendorOf = (model: CatalogModel) => familyFromSlug(model.id);
  if (claudeAutoModel) {
    const model = MODEL_CATALOG.find((entry) => entry.id === claudeAutoModel);
    if (model) {
      chain.push(model.id);
      seenVendors.add(vendorOf(model));
    }
  }
  for (const { model } of ranked) {
    if (chain.length >= maxChain) break;
    if (chain.includes(model.id)) continue;
    if (seenVendors.has(vendorOf(model))) continue;
    chain.push(model.id);
    seenVendors.add(vendorOf(model));
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
  if (s.includes("glm") || s.startsWith("z-ai/")) return "z-ai";
  if (s.includes("kimi") || s.startsWith("moonshotai/")) return "moonshotai";
  if (s.startsWith("cohere/")) return "cohere";
  if (s.startsWith("nvidia/") || s.includes("nemotron")) return "nvidia";
  if (s.startsWith("xiaomi/") || s.includes("mimo")) return "xiaomi";
  if (s.startsWith("upstage/") || s.includes("solar")) return "upstage";
  // Falling through to "router" means the cascade cannot tell this model's lab
  // apart from any other unknown one, so vendor-diversity silently stops
  // working for it. Add new vendors here when they enter the catalog.
  const prefix = s.split("/")[0];
  return prefix && prefix !== s ? prefix : "router";
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
