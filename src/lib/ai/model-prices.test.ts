/**
 * node --experimental-strip-types --test src/lib/ai/model-prices.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { MODEL_PRICES, computeCostUsd } from "./model-prices.ts";
import {
  DEFAULT_CODING_MODEL,
  DIAGNOSIS_MODEL,
  ESCALATION_MODEL,
  PREMIUM_CODING_MODEL,
  FREE_CODING_MODEL,
  DEFAULT_CHAT_MODEL,
  FAST_CODING_MODEL,
  ECONOMY_CODING_MODEL,
  REVIEW_MODEL,
} from "./model-defaults.ts";
import { OPENROUTER_MODEL_CATALOG } from "./openrouter-models.ts";
import { MODEL_CATALOG } from "./model-catalog.ts";

describe("model prices", () => {
  it("prices every model the app can route to", () => {
    // An unpriced routed model silently logs cost_usd = null, and the spend
    // report then under-reports by exactly the amount that model costs.
    for (const [name, model] of Object.entries({
      DEFAULT_CODING_MODEL,
      DIAGNOSIS_MODEL,
      ESCALATION_MODEL,
      PREMIUM_CODING_MODEL,
      FREE_CODING_MODEL,
      DEFAULT_CHAT_MODEL,
      FAST_CODING_MODEL,
      ECONOMY_CODING_MODEL,
      REVIEW_MODEL,
    })) {
      assert.ok(MODEL_PRICES[model], `${name} (${model}) has no price`);
    }
  });

  it("prices every model a USER can pick, not just the configured tiers", () => {
    // The check above only ever covered tier CONSTANTS, and that is exactly how
    // an unpriced model reached production: ai_eval_log showed a $10/$50 slug
    // — the priciest this product has routed — billing real money with
    // cost_usd = null, because it was never a tier constant. A model does not
    // have to be a default to cost money; it only has to be reachable.
    for (const model of OPENROUTER_MODEL_CATALOG) {
      assert.ok(
        MODEL_PRICES[model.id],
        `${model.label} (${model.id}) is user-selectable but has no price`,
      );
    }
  });

  it("prices every model the router can cascade into", () => {
    // selectModelChain() returns catalog entries the user never chose. An
    // unpriced one is spend that appears nowhere.
    for (const model of MODEL_CATALOG) {
      assert.ok(
        MODEL_PRICES[model.id],
        `${model.label} (${model.id}) is routable but has no price`,
      );
    }
  });

  it("returns null for an unknown model, never zero", () => {
    // Zero would make an unpriced model look free. That is how the stale
    // gateway cost table hid real spend for over a year.
    assert.equal(computeCostUsd("some/unlisted-model", 1000, 1000), null);
  });

  it("charges input and output at their different rates", () => {
    // gpt-5.6-terra is $2/M in and $12/M out — 6x. Averaging them, which is
    // what a single blended rate does, is wrong by up to that factor.
    const inputOnly = computeCostUsd("openai/gpt-5.6-terra", 1_000_000, 0);
    const outputOnly = computeCostUsd("openai/gpt-5.6-terra", 0, 1_000_000);
    assert.equal(inputOnly, 2);
    assert.equal(outputOnly, 12);
  });

  it("prices a realistic median build", () => {
    // 59,788 tokens is this product's measured median session.
    const cost = computeCostUsd("openai/gpt-5.6-luna", 41_852, 17_936);
    assert.ok(cost !== null && cost > 0.02 && cost < 0.05, `got ${cost}`);
  });

  it("treats free models as genuinely zero", () => {
    assert.equal(computeCostUsd("z-ai/glm-5.2:free", 100_000, 50_000), 0);
  });
});

describe("escalation pricing — the ordering that is easy to guess backwards", () => {
  // Verified per-slug against openrouter.ai/api/v1/models/<slug>/endpoints on
  // 2026-08-27. Both of these invert the intuition, which is why they are
  // pinned rather than left in a comment:
  //
  //   "use the older Sonnet, it'll be cheaper"  — it is 50% more.
  //   "escalation must cost more than the tier
  //    it escalates past"                       — it does not, and should not.
  const perCall = (slug: string) => {
    const price = MODEL_PRICES[slug];
    assert.ok(price, `${slug} has no price`);
    // The unit that matters for this tier: ONE gated repair, not a build.
    return (50_000 / 1_000_000) * price[0] + (8_000 / 1_000_000) * price[1];
  };

  it("Sonnet 5 is cheaper than Sonnet 4.6 — newer is not pricier here", () => {
    assert.ok(
      perCall("anthropic/claude-sonnet-5") < perCall("anthropic/claude-sonnet-4.6"),
      "reaching for the older Sonnet to save money would cost more",
    );
  });

  it("Sonnet 5 is cheaper than Opus 5, which buys the same cross-lab hop", () => {
    assert.ok(perCall("anthropic/claude-sonnet-5") < perCall("anthropic/claude-opus-5"));
  });

  it("the escalation tier did not make escalation more expensive", () => {
    // The whole justification for moving this tier to Anthropic was that the
    // cross-vendor hop was free. If a future swap breaks that, it should fail
    // here rather than show up on a bill.
    assert.ok(
      perCall(ESCALATION_MODEL) <= perCall("openai/gpt-5.6-terra"),
      `escalation (${ESCALATION_MODEL}) now costs more per call than the Terra it replaced`,
    );
  });
});
