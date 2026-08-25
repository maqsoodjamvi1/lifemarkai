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
  FREE_CODING_MODEL,
  DEFAULT_CHAT_MODEL,
} from "./model-defaults.ts";

describe("model prices", () => {
  it("prices every model the app can route to", () => {
    // An unpriced routed model silently logs cost_usd = null, and the spend
    // report then under-reports by exactly the amount that model costs.
    for (const [name, model] of Object.entries({
      DEFAULT_CODING_MODEL,
      DIAGNOSIS_MODEL,
      ESCALATION_MODEL,
      FREE_CODING_MODEL,
      DEFAULT_CHAT_MODEL,
    })) {
      assert.ok(MODEL_PRICES[model], `${name} (${model}) has no price`);
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
