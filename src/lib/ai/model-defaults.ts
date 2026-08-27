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
//   1. CLASSIFY   deepseek-v4-flash    classify the request, chat turns
//   2. GENERATE   openai/gpt-5.6-luna  write the project; perform the FIRST repair
//   3. DIAGNOSE   deepseek-v4-pro      explain WHY the build failed (no code)
//   4. ESCALATE   anthropic/claude-sonnet-5 the FINAL repair only
//
// Three labs, four slots, and — since 2026-08-27 — the escalation step is the
// one that crosses labs again: OpenAI writes, DeepSeek diagnoses, Anthropic
// repairs. The premium/complex-build tier is a SEPARATE constant
// (ROUTER_PREMIUM, still Terra) precisely so that pointing escalation at the
// most expensive model in the product does not also reprice every premium
// build. Escalation is one call behind a verified failure; premium is five
// calls on the happy path, and they must not share a slug.
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
//   anthropic/claude-sonnet-5 $2.00/$10.00    1.0M ctx  (9 endpoints, live 2026-08-27)
//   anthropic/claude-sonnet-4.6 $3.00/$15.00  1.0M ctx  (not used — see below)
//   anthropic/claude-opus-5   $5.00/$25.00    1.0M ctx  (not used — see below)
//
// NOTE ON COST — read the unit, it is the whole argument. The $ column above is
// a FIVE-CALL BUILD; escalation is not five calls, it is ONE, and only after a
// real browser render has confirmed the generator's own repair still errors.
// Priced per that one call at 50k in / 8k out:
//
//   anthropic/claude-sonnet-5    $0.180   <- chosen
//   openai/gpt-5.6-terra         $0.196   (the previous escalation slug)
//   anthropic/claude-sonnet-4.6  $0.270
//   anthropic/claude-opus-5      $0.450
//
// So escalation got CHEAPER, not more expensive, while buying back the thing
// the old ladder had lost: a repair from a different lab than the one that
// wrote the broken code. Luna -> Terra was OpenAI escalating to OpenAI, the
// same reader of the same mistake.
//
// Two ordering surprises worth writing down, because both invert the guess:
//   - Sonnet 5 is cheaper than Sonnet 4.6 ($2/$10 vs $3/$15). The newer model
//     is the cheaper one; picking "the older Sonnet to save money" costs 50%
//     more per escalation.
//   - Opus 5 is 2.5x Sonnet 5 for the same cross-vendor hop, which is where
//     this tier's leverage actually comes from.
// Both are priced in model-prices.ts and one env var away if that changes.
//
// The gate is what makes it affordable, not the price. If escalation starts
// firing on most builds, the repair prompt is the bug, not the ladder — and
// OPENROUTER_ESCALATION_MODEL puts a cheaper slug back without a deploy.
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
// ESCALATE was openai/gpt-5.6-terra until 2026-08-27. Moved to Anthropic for
// vendor diversity on the one step where it actually pays: the final repair,
// which by definition runs on code an OpenAI model has already failed to fix
// once. Slug verified live the same day (9 endpoints, 1M context, $2/$10) —
// and it is CHEAPER per call than the Terra it replaces, so this hop costs
// nothing. See the per-call table above.
const ROUTER_ESCALATE = "anthropic/claude-sonnet-5";
// Premium/complex-build tier, deliberately SEPARATE from ROUTER_ESCALATE. These
// were the same constant, so repointing escalation would have silently doubled
// the price of every premium build as well.
const ROUTER_PREMIUM = "openai/gpt-5.6-terra";

// Back-compat aliases: the rest of the file speaks in CODER/FRONTIER terms.
const ROUTER_CODER = ROUTER_GENERATE;
const ROUTER_FRONTIER = ROUTER_PREMIUM;

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
  (process.env.OPENROUTER_PREMIUM_CODING_MODEL || ROUTER_PREMIUM) as AIModel;

export const PREMIUM_REASONING_MODEL: AIModel =
  (process.env.OPENROUTER_PREMIUM_REASONING_MODEL || ROUTER_PREMIUM) as AIModel;

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
 * ESCALATION model — the FINAL repair, and only that. Reached after a real
 * browser render confirms the generator's own repair still errors, one
 * escalated attempt per task (MAX_REPAIR_ROUNDS = 2 in self-verify.ts).
 *
 * HISTORY, because this slug has moved twice and the reasoning matters more
 * than the destination:
 *
 *   anthropic/claude-opus-4.8  removed 2026-08-06, purely on price ($5/$25M).
 *   deepseek/deepseek-v4-pro   the cheap replacement ($0.435/$0.87M) — but it
 *                              is also DIAGNOSIS_MODEL, so diagnose and repair
 *                              collapsed onto one model.
 *   openai/gpt-5.6-terra       cheaper than Opus, but the same lab as the
 *                              generator: Luna writes the broken code, Terra
 *                              re-reads it with the same house assumptions.
 *   anthropic/claude-sonnet-5  here now (2026-08-27). $2/M in, $10/M out;
 *                              verified live against
 *                              /models/anthropic/claude-sonnet-5/endpoints —
 *                              resolves, 9 endpoints, 1M context.
 *
 * This slug was previously recorded in the tests as delisted from OpenRouter.
 * It never was. That claim came from a bulk read of /api/v1/models that came
 * back incomplete; the absence was read as a delisting instead of as a bad
 * read. Per-slug /endpoints is what actually answers "does this exist" — a
 * missing row in a truncated list is not evidence of anything.
 *
 * The cost objection that removed Opus 4.8 was real but was priced in the wrong
 * unit: it compared an escalation to a BUILD ("~36 normal builds"), when
 * escalation is ONE call that most builds never make. Per call at 50k in /
 * 8k out, escalation candidates rank:
 *
 *   anthropic/claude-sonnet-5    $0.180   <- chosen; cheaper than what it replaced
 *   openai/gpt-5.6-terra         $0.196
 *   anthropic/claude-sonnet-4.6  $0.270
 *   anthropic/claude-opus-5      $0.450
 *
 * So this restores the cross-lab hop AND takes ~8% off the escalation bill.
 * Note the ordering: Sonnet 5 undercuts Sonnet 4.6, so reaching for the older
 * model to save money costs 50% more. Opus 5 is 2.5x for the same hop.
 *
 * What the hop buys is the property the ladder had quietly lost: the model that
 * repairs the code is not from the lab that wrote it. Same argument
 * DIAGNOSIS_MODEL rests on, applied to the step that writes the fix. There are
 * tests asserting both.
 *
 * $0.180 is also an upper bound. provider.ts applies OpenRouter cache_control
 * breakpoints to `anthropic/*` slugs ONLY (see withOpenRouterCacheControl), and
 * escalation re-sends the SAME codebase that just failed — so most of its input
 * bills as a cache read. Terra got no such discount on this path; moving
 * escalation to Anthropic is the only reason that machinery does anything.
 *
 * The gate is the cost control, not the slug. If this fires on most builds the
 * repair prompt is the bug. Still overridable with no deploy: set
 * OPENROUTER_ESCALATION_MODEL (openai/gpt-5.6-terra to revert exactly; anthropic/claude-opus-5 and
 * anthropic/claude-sonnet-4.6 are both priced in model-prices.ts and resolve
 * live, if a future measurement justifies paying more).
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
