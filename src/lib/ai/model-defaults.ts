import type { AIModel } from "./provider.ts";

// ─────────────────────────────────────────────────────────────────────────────
// OpenRouter-first model lineup. Router slugs keep LifemarkAI from being pinned
// to one lab while still letting operators override any tier with exact
// OPENROUTER_*_MODEL env vars.
// ─────────────────────────────────────────────────────────────────────────────

// NOTE: OpenRouter slugs use DOT version notation (anthropic/claude-opus-4.8),
// unlike the native Anthropic API ids which use hyphens (claude-opus-4-8).
// Since we route through OpenRouter, these MUST be the dot form — verified
// against openrouter.ai (2026): opus-4.8, sonnet-4.6, haiku-4.5 all resolve.

// Quality-first defaults for user-visible generation and reasoning. Operators
// can still override every tier through the OPENROUTER_* environment variables.
//
// Switched off openai/gpt-5.6-terra for the default/free lineup on 2026-08-12
// (brutal-testing session): the OpenRouter account backing this deployment ran
// its balance negative and paused ALL generation, including the default tier,
// taking down chat/build/clarify entirely. Qwen Coder + DeepSeek are both
// already-approved, live-verified slugs in model-catalog.ts (DeepSeek V4 Pro/
// Flash and Qwen3 Coder), meaningfully cheaper than GPT-5.6-terra, and give the
// app a working default even when funding one provider runs out. The separate
// Premium tier (PREMIUM_CODING_MODEL etc. below) is left on GPT-5.6-terra
// untouched — this only repoints the tier used automatically by default.
// ─────────────────────────────────────────────────────────────────────────────
// THE LADDER — four models, one job each. Specified by the operator and wired
// so that each step only runs when the cheaper step below it has demonstrably
// failed, not on a guess.
//
//   1. CLASSIFY   deepseek-v4-flash   classify the request, chat turns
//   2. GENERATE   z-ai/glm-5.2        write the project; perform the FIRST repair
//   3. DIAGNOSE   deepseek-v4-pro     explain WHY the build failed (no code)
//   4. ESCALATE   openai/gpt-5.6-terra complex builds and the FINAL repair only
//
// The split at steps 2/3 is the point of the design: the model that explains
// the failure is NOT the model that fixes it. A model that just failed to
// produce working code is the worst candidate to judge why its own code broke,
// and a diagnosis costs a few hundred output tokens against a repair's several
// thousand — so the expensive reasoning happens on the cheap side of the call.
//
// Measured on OpenRouter, 2026-08-19 ($ = 5-call build at 50k in / 8k out):
//   deepseek-v4-flash  $0.083/$0.165  $0.027   1.05M ctx
//   z-ai/glm-5.2       $0.966/$3.036  $0.363   1.05M ctx  (31 endpoints, 99.9%)
//   deepseek-v4-pro    $1.440/$2.880  $0.475   1.05M ctx
//   openai/gpt-5.6-terra $2.00/$12.00 $0.980   1.05M ctx
//
// NOTE ON COST: Terra is ~36x the price of Flash per build. It is gated behind
// a VERIFIED failure (a real browser render that still errors after GLM's
// repair), not behind a guess about difficulty — that gate is what keeps it
// affordable. If it starts firing on most builds, the repair prompt is the bug,
// not the ladder.
const ROUTER_CLASSIFY = "deepseek/deepseek-v4-flash";
// GENERATE was z-ai/glm-5.2 until 2026-08-19. Swapped to gpt-5.6-luna after a
// rendered design comparison plus the coding suite:
//
//   coding      Luna 7/7 at 1.7s p50   GLM 7/7 at ~21.5s p50 (8.9s-62.8s spread)
//   design      both excellent; Luna art-directed, GLM more distinctive but
//               with a catastrophic failure mode (see below)
//   cost/build  Luna $0.098            GLM $0.363
//
// The deciding factor was not price, it was GLM's failure mode: on a large
// output it can spend its ENTIRE token budget on the `reasoning` field and
// return an empty string — finish_reason "length", 9,000 output tokens billed,
// zero content. Whether that happens depends on which of its ~30 providers
// OpenRouter picks (Alibaba fine, Phala returned nothing). A generation tier
// cannot have a silent, provider-dependent zero-output mode.
const ROUTER_GENERATE = "openai/gpt-5.6-luna";
const ROUTER_DIAGNOSE = "deepseek/deepseek-v4-pro";
const ROUTER_ESCALATE = "openai/gpt-5.6-terra";

// Back-compat aliases: the rest of the file speaks in CODER/FRONTIER terms.
const ROUTER_CODER = ROUTER_GENERATE;
const ROUTER_FRONTIER = ROUTER_ESCALATE;

/**
 * FREE-user tier. Scoped deliberately: small edits only, never a full build.
 *
 * WARNING, measured 2026-08-19: `z-ai/glm-5.2:free` returned HTTP 429
 * ("temporarily rate-limited upstream") on EVERY call across two separate test
 * runs. It is configured here because it is the specified free model, but it is
 * currently non-functional — provider.ts falls back to the paid economy model,
 * so free users are silently served the paid tier. Watch the fallback rate
 * before assuming this tier is saving anything.
 */
const ROUTER_FREE_SMALL_EDIT = "z-ai/glm-5.2:free";


export const PREMIUM_CODING_MODEL: AIModel =
  (process.env.OPENROUTER_PREMIUM_CODING_MODEL || ROUTER_ESCALATE) as AIModel;

export const PREMIUM_REASONING_MODEL: AIModel =
  (process.env.OPENROUTER_PREMIUM_REASONING_MODEL || ROUTER_ESCALATE) as AIModel;

/** Premium-ish work on a budget — the fastest of the benchmarked 7/7 models. */
export const PREMIUM_ECONOMY_MODEL: AIModel =
  (process.env.OPENROUTER_PREMIUM_ECONOMY_MODEL || ROUTER_GENERATE) as AIModel;

/** Primary model for coding. */
export const DEFAULT_CODING_MODEL: AIModel =
  (process.env.OPENROUTER_CODING_MODEL || ROUTER_GENERATE) as AIModel;

/**
 * Fast/cheap model for lightweight tasks (reviews, small chat turns, etc.).
 *
 * MEASURED WARNING (scripts/eval-models.mjs, 2026-08-19): DeepSeek V4 Flash is
 * only fast on SMALL prompts. On short tasks it medians ~1.7s, but on a ~250-line
 * file with a one-line change it took 175 SECONDS — against 9.4s for
 * gpt-5.6-luna, 12.9s for qwen3-coder and 16.9s for codestral on the identical
 * task. Same correctness, 18x the wall-clock.
 *
 * So: never route file edits or build turns through this tier. It is for chat
 * turns and short helpers, where its 3-6x price advantage is free. If you find
 * yourself pointing a build path at FAST_CODING_MODEL, point it at
 * ECONOMY_CODING_MODEL instead.
 */
export const FAST_CODING_MODEL: AIModel =
  (process.env.OPENROUTER_FAST_MODEL || ROUTER_CLASSIFY) as AIModel;

/** Balanced model for planning and medium-complexity chat. */
export const BALANCED_CODING_MODEL: AIModel =
  (process.env.OPENROUTER_BALANCED_MODEL || ROUTER_GENERATE) as AIModel;

/** UI / design-heavy work. */
export const DESIGN_MODEL: AIModel =
  (process.env.OPENROUTER_DESIGN_MODEL || ROUTER_GENERATE) as AIModel;

/** Copywriting / marketing content. */
export const CONTENT_MODEL: AIModel =
  (process.env.OPENROUTER_CONTENT_MODEL || ROUTER_GENERATE) as AIModel;

/** Default conversational model. */
export const DEFAULT_CHAT_MODEL: AIModel =
  (process.env.OPENROUTER_CHAT_MODEL || ROUTER_CLASSIFY) as AIModel;

/** Strong general-reasoning model for planning. */
export const REASONING_MODEL: AIModel =
  (process.env.OPENROUTER_REASONING_MODEL || ROUTER_DIAGNOSE) as AIModel;

/**
 * FREE coding model for work that doesn't need a paid coder: simple
 * content-only websites and tiny lightweight edits. `:free` variants cost $0
 * (20 req/min, capped daily); provider.ts auto-falls back to the paid safe
 * model when the free pool is rate-limited/congested, so routing here is
 * best-effort-free rather than free-or-fail.
 */
// Switched off qwen/qwen3-coder:free on 2026-07-30. The slug still resolves, but
// it has exactly ONE provider (Venice) and that provider's uptime_last_1d was 0
// at the time of checking — the free pool was simply down, so every request paid
// the fallback path instead. cohere/north-mini-code:free is also single-provider
// but was actually serving (~97%), is code-specialised, and carries a 256k
// context. Still best-effort-free by design: provider.ts falls back to the paid
// economy model when a free pool is congested.
// BENCHMARKED 2026-08-19 with real OpenRouter calls, not guesswork. Two tasks:
// a 2k-token React component build, and the free tier's actual job (a small
// edit to an existing file), 3 runs each.
//
//   nvidia/nemotron-3-super-120b-a12b:free  edit 3.9/7.1/9.5s   correct 3/3
//   cohere/north-mini-code:free             edit 25/25/35s      correct 1/3
//   z-ai/glm-5.2:free                       HTTP 429 on every attempt
//   google/gemma-4-31b-it:free              HTTP 429 on every attempt
//   openai/gpt-oss-20b:free                 one 180s timeout, one 94s
//   poolside/laguna-s-2.1:free              46s / 57s
//
// So the free tier moves to Nemotron 3 Super: 3-6x faster than the Cohere model
// it replaces AND correct on 3/3 small edits where Cohere managed 1/3. Single
// provider (Nvidia) at 99.8% uptime, 262k context, 262k max output.
//
// NOTE glm-5.2:free was proposed earlier in this same audit on catalog data
// alone (the paid glm-5.2 has 31 endpoints at 99.9%). Live calls rate-limited
// 429 on every attempt, so it is NOT the free default — catalog metadata does
// not tell you whether a free pool will actually serve you.
//
// One known weakness, measured: Nemotron's component output skipped TypeScript
// interfaces where Cohere wrote them. buildModelPromptHints() in
// model-catalog.ts is where to compensate if that shows up in real projects.
// Cohere stays selectable in the catalog as the free alternative.
//
// Still best-effort-free by design: provider.ts falls back to the paid economy
// model when a free pool is congested.
export const FREE_CODING_MODEL: AIModel =
  (process.env.OPENROUTER_FREE_CODING_MODEL || ROUTER_FREE_SMALL_EDIT) as AIModel;

/** Cheap paid fallback when a free pool is busy or a small Auto request needs reliability. */
export const ECONOMY_CODING_MODEL: AIModel =
  (process.env.OPENROUTER_ECONOMY_CODING_MODEL || ROUTER_GENERATE) as AIModel;

/** Cheap model for simple chat/patch turns. */
export const ECONOMY_CHAT_MODEL: AIModel =
  (process.env.OPENROUTER_ECONOMY_CHAT_MODEL || ROUTER_CLASSIFY) as AIModel;

/**
 * Cross-vendor REVIEW model (CTO reviews, debate adjudication). Intentionally
 * a DIFFERENT model family than the coding tier: a same-family reviewer shares
 * the builder's blind spots, so reviews become an echo chamber.
 *
 * This pointed at ROUTER_CODING, which made the claim above false — the
 * reviewer was not merely the same family as the builder, it was the SAME
 * MODEL, reviewing its own output. Every "cross-vendor review" in the product
 * was a model agreeing with itself. Keep DeepSeek explicit here so it remains
 * independent when the user-facing generation default changes vendors.
 */
export const REVIEW_MODEL: AIModel =
  (process.env.OPENROUTER_REVIEW_MODEL || ROUTER_DIAGNOSE) as AIModel;

/**
 * DIAGNOSIS model — explains WHY a build failed. Returns prose, not code.
 *
 * Split out from the repair tier deliberately. The generator that just produced
 * broken code is the worst available judge of why it broke: it re-reads its own
 * output with the same assumptions that produced the bug. A different vendor
 * reading the same error with fresh assumptions is the entire value of this
 * step, which is why DIAGNOSIS_MODEL must stay a different lab from
 * DEFAULT_CODING_MODEL — there is a test asserting exactly that.
 *
 * It is also the cheap half of the escalation: a diagnosis is a few hundred
 * output tokens where a repair is several thousand, so the reasoning-heavy model
 * runs on the small call and the cheaper generator does the token-heavy writing.
 */
export const DIAGNOSIS_MODEL: AIModel =
  (process.env.OPENROUTER_DIAGNOSIS_MODEL || ROUTER_DIAGNOSE) as AIModel;

/**
 * ESCALATION model — used only on retry after a task failed with the normal
 * tier (cost-bounded: one escalated attempt per task).
 *
 * Was anthropic/claude-opus-4.8 at $5/M in, $25/M out. On a representative
 * build request (50k in, 8k out) that is $0.45 — against $0.012 for the coding
 * tier. One escalation cost as much as ~36 normal builds, and more than
 * Lovable's most expensive message ($0.50 at Pro list price), which put the
 * "5x cheaper than Lovable" target out of reach on its own.
 *
 * deepseek-v4-pro is $0.435/M in, $0.87/M out — verified live against
 * openrouter.ai/api/v1/models/deepseek/deepseek-v4-pro/endpoints (2026-08-06).
 * That is $0.029 on the same request: 94% cheaper, a 15x cut.
 *
 * It is a real escalation and not just a cheaper slug: 1M context against
 * Opus's 1M, 384k max output, native reasoning support, and a ~120x cache-read
 * discount ($0.0036/M) — which matters most here, because escalation retries
 * the SAME codebase that just failed, so almost all of its input is cache hits.
 *
 * Still overridable: set OPENROUTER_ESCALATION_MODEL to put a frontier model
 * back on this tier without a deploy.
 */
export const ESCALATION_MODEL: AIModel =
  (process.env.OPENROUTER_ESCALATION_MODEL || ROUTER_ESCALATE) as AIModel;

/**
 * Native image generation.
 * When OpenRouter is enabled (OPENROUTER_API_KEY present) use Gemini's image
 * model via OpenRouter (`google/gemini-3.1-flash-image`, served through
 * /chat/completions with image modalities) so image calls route through the
 * single OpenRouter key. NOTE: `openai/dall-e-3` is DELISTED from OpenRouter
 * (verified against the live catalog, July 2026) — do not use it here.
 * Without OpenRouter, default to Google's native Gemini image model.
 */
export const IMAGE_MODEL = process.env.OPENROUTER_API_KEY ? "google/gemini-3.1-flash-image" : "gemini-3.1-flash-image";

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
/**
 * OpenRouter's meta-models (`openrouter/auto`, `openrouter/free`, and friends)
 * pick a real model per request by their own routing logic. That makes them
 * unusable here: the model that answers is not knowable in advance, so cost
 * accounting, the cross-vendor escalation rule and every per-model metric in
 * ai_eval_log become meaningless — two identical requests can be served by two
 * different labs. Blocked outright rather than merely discouraged.
 */
export function isBannedRouterMetaModel(model: string): boolean {
  return /^openrouter\//i.test((model ?? "").trim());
}

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

/**
 * LATENCY-CRITICAL model for inline autocomplete (/api/ai/complete fires on
 * typing pauses). Deliberately NOT the fast tier: that tier is a `:free`
 * variant (20 req/min shared pool, congestion latency) — fine for
 * click-triggered helpers, unusable at keystroke frequency. Codex Mini is
 * $0.25/$2 per M — a few hundred tokens per completion (327 avg, measured)
 * costs fractions of a cent.
 *
 * MEASURED 2026-08-19 — the old "sub-second latency" claim for Codex Mini was
 * simply false, and ai_eval_log agreed (code_completion p50 4,720ms). Three
 * live completion calls per candidate:
 *
 *   mistralai/codestral-2508        411 / 491 / 578 ms    (Mistral, 1 endpoint)
 *   google/gemini-3.1-flash-lite    441 / 500 / 606 ms    (Google, 7 endpoints)
 *   deepseek/deepseek-v4-flash     1699 /1751 /2174 ms    (Venice)
 *   openai/gpt-5.1-codex-mini      1891 /2402 /4286 ms    (Azure, 1 endpoint)
 *
 * Codex Mini is 5x slower than the top two and rides a single Azure endpoint,
 * so it loses on both speed and blast radius. Flash Lite and Codestral tie on
 * latency (~0.5s, which is what autocomplete actually needs) and cost the same
 * fraction of a cent at ~327 output tokens; Flash Lite wins the tie on having 7
 * endpoints instead of 1. Codestral is the code-specialised alternative if
 * completion QUALITY ever looks worse than the speed suggests.
 *
 * Codex Mini was also removed from the catalog entirely in the no-OpenAI pass,
 * so it is no longer selectable even as an override target.
 */
export const AUTOCOMPLETE_MODEL: AIModel =
  (process.env.OPENROUTER_AUTOCOMPLETE_MODEL || ROUTER_CLASSIFY) as AIModel;
