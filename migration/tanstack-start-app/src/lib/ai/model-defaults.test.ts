import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  DEFAULT_CODING_MODEL,
  REVIEW_MODEL,
  ESCALATION_MODEL,
  DEFAULT_CHAT_MODEL,
  FAST_CODING_MODEL,
  ECONOMY_CODING_MODEL,
  BALANCED_CODING_MODEL,
  REASONING_MODEL,
  DESIGN_MODEL,
  CONTENT_MODEL,
  AUTOCOMPLETE_MODEL,
} from "./model-defaults.ts";

const vendorOf = (slug: string) => String(slug).split("/")[0];

describe("model-defaults — the reviewer must not be the builder", () => {
  /**
   * REVIEW_MODEL used to be defined as ROUTER_CODING, the same constant as
   * DEFAULT_CODING_MODEL. So every "cross-vendor CTO review" and every debate
   * adjudication was one model grading its own homework, while the comment
   * above it described the opposite. Nothing failed, nothing logged, and the
   * reviews looked fine — they just always agreed.
   *
   * This is the test that would have caught it, and the one that stops the two
   * constants drifting back together the next time a router slug is retuned.
   */
  it("does not review its own output", () => {
    assert.notEqual(
      REVIEW_MODEL,
      DEFAULT_CODING_MODEL,
      "REVIEW_MODEL is the same model as DEFAULT_CODING_MODEL — reviews are an echo chamber",
    );
  });

  it("reviews across vendors, not just across slugs", () => {
    // Two models from one lab share training data and therefore blind spots.
    // A different slug from the same vendor is not a second opinion.
    assert.notEqual(
      vendorOf(REVIEW_MODEL),
      vendorOf(DEFAULT_CODING_MODEL),
      `REVIEW_MODEL and DEFAULT_CODING_MODEL are both from "${vendorOf(REVIEW_MODEL)}"`,
    );
  });
});

describe("model-defaults — every tier points somewhere real", () => {
  const TIERS: Array<[string, string]> = [
    ["coding", DEFAULT_CODING_MODEL],
    ["chat", DEFAULT_CHAT_MODEL],
    ["fast", FAST_CODING_MODEL],
    ["economy", ECONOMY_CODING_MODEL],
    ["balanced", BALANCED_CODING_MODEL],
    ["reasoning", REASONING_MODEL],
    ["design", DESIGN_MODEL],
    ["content", CONTENT_MODEL],
    ["review", REVIEW_MODEL],
    ["escalation", ESCALATION_MODEL],
    ["autocomplete", AUTOCOMPLETE_MODEL],
  ];

  // A tier that resolves to "" or "undefined" fails EVERY request routed to it,
  // and does so at request time rather than at boot — so the cheapest possible
  // check is worth having.
  for (const [name, slug] of TIERS) {
    it(`${name} is a vendor/model slug`, () => {
      assert.match(
        String(slug),
        /^[a-z0-9-]+\/[a-z0-9.\-:]+$/i,
        `${name} tier resolved to "${slug}", which OpenRouter cannot route`,
      );
    });
  }
});

describe("model-defaults — the escalation tier stays affordable", () => {
  /**
   * Escalation is the one tier that can quietly destroy unit economics: it
   * fires on retry, so it is invisible in the happy path, and it was pointed at
   * a $5/$25-per-M model. On a representative request that is $0.45 against
   * $0.012 for the coding tier — one escalation costing about 36 normal builds.
   *
   * This does not pin a specific model (operators should be free to retune, and
   * OPENROUTER_ESCALATION_MODEL exists precisely for that). It pins the
   * decision: the most expensive frontier slugs do not become the DEFAULT
   * again without someone deliberately editing this list.
   */
  const PRICEY_DEFAULTS = [
    "anthropic/claude-opus-4.8",
    "anthropic/claude-opus-4.6",
    "anthropic/claude-sonnet-4.6",
  ];

  it("does not default to a frontier-priced model", () => {
    assert.ok(
      !PRICEY_DEFAULTS.includes(String(ESCALATION_MODEL)),
      `ESCALATION_MODEL defaults to ${ESCALATION_MODEL}, which costs ~15-36x the coding tier per request`,
    );
  });
});
