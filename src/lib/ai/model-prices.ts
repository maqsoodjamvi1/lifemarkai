/**
 * Single source of truth for model pricing.
 *
 * There were TWO price tables before this: one in gateway/src/index.ts for
 * credit metering, and nothing at all on the app side — so `ai_eval_log` stored
 * token counts with no way to turn them into money. Every cost figure quoted
 * about this product therefore came from a benchmark rather than from its own
 * traffic, which is a bad way to run a cost decision.
 *
 * Prices are USD per 1M tokens, verified live against the OpenRouter models API
 * on 2026-08-19. They DO move: gateway/src/index.ts previously carried a table
 * stamped "as of 2025-05" that was wrong by up to 6x in both directions.
 * `scripts/check-model-slugs.mjs` fails the build when a routed model is missing
 * from a price table, which is the guard against that happening again.
 */
export type ModelPrice = readonly [inputPerM: number, outputPerM: number];

export const MODEL_PRICES: Record<string, ModelPrice> = {
  // The configured ladder.
  "deepseek/deepseek-v4-flash": [0.083, 0.165],
  "openai/gpt-5.6-luna": [0.2, 1.2],
  "deepseek/deepseek-v4-pro": [1.44, 2.88],
  "openai/gpt-5.6-terra": [2.0, 12.0],
  // Escalation, from 2026-08-27. Verified against
  // openrouter.ai/api/v1/models/anthropic/claude-sonnet-5/endpoints the same
  // day: $2/M in, $10/M out across 9 endpoints (regional Bedrock/Vertex
  // endpoints price ~10% higher; the headline rate is what the router bills).
  // Note this row ALREADY EXISTED further down at [2.0, 10.0] under
  // "previously routed" — the slug was priced correctly the whole time; what
  // was wrong was the claim, in the test comments, that it had been delisted.
  "anthropic/claude-sonnet-5": [2.0, 10.0],
  // Opus 5 is deliberately NOT in the catalog (see model-catalog.ts). Priced
  // here anyway so an operator who sets OPENROUTER_ESCALATION_MODEL to it gets
  // real accounting rather than a silent zero.
  "anthropic/claude-sonnet-4.6": [3.0, 15.0],
  "anthropic/claude-opus-5": [5.0, 25.0],
  // $10/M in, $50/M out — the most expensive slug this product has ever routed,
  // 2x Opus 5. Verified live 2026-08-27
  // (/models/anthropic/claude-fable-5/endpoints: 6 endpoints, 1M context).
  //
  // It was already being called in production — self_verify.autofix and
  // chat.build.autofix rows in ai_eval_log — while absent from this table, so
  // every one of those calls recorded cost_usd = null. The single priciest
  // model in the system was the one model invisible in the spend log.
  //
  // It reaches the router through an OPENROUTER_*_MODEL env override, which
  // bypasses APPROVED_SMART_MODEL_IDS entirely (model-defaults.ts reads
  // process.env directly with no approval check). Pricing it here does not
  // approve it — it only stops it looking free.
  "anthropic/claude-fable-5": [10.0, 50.0],
  "z-ai/glm-5.2:free": [0, 0],
  // Previously routed / still selectable elsewhere.
  "z-ai/glm-5.2": [0.966, 3.036],
  "qwen/qwen3-coder": [0.3, 1.0],
  "qwen/qwen3-coder-flash": [0.195, 0.975],
  "anthropic/claude-haiku-4.5": [1.0, 5.0],
  "anthropic/claude-opus-4.8": [5.0, 25.0],
  "google/gemini-3.6-flash": [0.75, 3.75],
  "google/gemini-3.1-flash-lite": [0.25, 1.5],
  "moonshotai/kimi-k2.7-code": [0.71, 3.5],
  "mistralai/mistral-small-3.2-24b-instruct": [0.094, 0.25],
  "mistralai/codestral-2508": [0.3, 0.9],
  "xiaomi/mimo-v2.5": [0.14, 0.28],
  "upstage/solar-pro4": [0.03, 0.12],
  "nvidia/nemotron-3-super-120b-a12b:free": [0, 0],
  "nvidia/nemotron-3-ultra-550b-a55b:free": [0, 0],
  "cohere/north-mini-code:free": [0, 0],
};

/**
 * Cost of one call, in USD.
 *
 * Returns null — NOT zero — for an unpriced model. A zero here would silently
 * under-report spend and make an unknown model look free, which is exactly the
 * error the stale gateway table used to make. Null is honest: it means "we do
 * not know", and the reporting query can count those separately.
 */
/**
 * Models already reported as unpriced. Warned ONCE per model per process, not
 * per call: this sits on the hot path of every generation, and a per-call warn
 * would bury the signal it exists to raise.
 */
const warnedUnpriced = new Set<string>();

export function computeCostUsd(model: string, promptTokens: number, completionTokens: number): number | null {
  const price = MODEL_PRICES[model];
  if (!price) {
    // Null is the honest value, but SILENCE is not. anthropic/claude-fable-5
    // billed at $10/$50 through this branch for days with nothing said: the
    // null was correct and completely invisible, because the only place it
    // surfaced was a column in a table nobody queries. One warn per model makes
    // an unpriced route something an operator trips over on the first call,
    // instead of discovering during a spend reconciliation weeks later.
    if (!warnedUnpriced.has(model)) {
      warnedUnpriced.add(model);
      console.warn(
        `[ai/cost] no price for "${model}" — its spend will be recorded as unknown. ` +
          `Add it to MODEL_PRICES in src/lib/ai/model-prices.ts.`,
      );
    }
    return null;
  }
  const [inPerM, outPerM] = price;
  return (promptTokens * inPerM + completionTokens * outPerM) / 1_000_000;
}
