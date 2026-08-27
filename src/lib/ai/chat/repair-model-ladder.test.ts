/**
 * The repair ladder is a COST control, so it gets a test that fails on price,
 * not just on shape.
 *
 * Before 2026-08-27 runRepairStage chose ESCALATION_MODEL on every branch but
 * one, which meant the escalation tier ran on repair attempt ZERO — before
 * anything had been observed to fail. The comments in model-defaults.ts said
 * the opposite ("GENERATE performs the FIRST repair"), and nothing tested it,
 * because the choice was made inline inside a streaming network call.
 *
 *   node --experimental-strip-types --test src/lib/ai/chat/repair-model-ladder.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { selectRepairModel } from "./repair-model-ladder.ts";
import {
  DEFAULT_CODING_MODEL,
  ECONOMY_CODING_MODEL,
  ESCALATION_MODEL,
} from "../model-defaults.ts";

describe("repair ladder — escalation is gated on a failed attempt, not on difficulty", () => {
  it("the first repair attempt uses the generator, never the escalation tier", () => {
    // THE REGRESSION. Against the old implementation this branch returned
    // ESCALATION_MODEL, so this assertion fails there and passes here.
    assert.equal(
      selectRepairModel({ simpleEconomyRequest: false, round: 0 }),
      DEFAULT_CODING_MODEL,
    );
    assert.notEqual(
      selectRepairModel({ simpleEconomyRequest: false, round: 0 }),
      ESCALATION_MODEL,
    );
  });

  it("a missing round is treated as the first attempt, not as an escalation", () => {
    // `round` is optional, and the failure mode of getting this backwards is
    // silent and expensive: every caller that forgets to pass it would bill the
    // frontier tier.
    assert.equal(selectRepairModel({ simpleEconomyRequest: false }), DEFAULT_CODING_MODEL);
  });

  it("later attempts DO escalate — the gate must not become a wall", () => {
    for (const round of [1, 2, 3]) {
      assert.equal(
        selectRepairModel({ simpleEconomyRequest: false, round }),
        ESCALATION_MODEL,
        `round ${round} should escalate`,
      );
    }
  });

  it("a simple economy request never escalates, at any round", () => {
    for (const round of [0, 1, 2]) {
      assert.equal(
        selectRepairModel({ simpleEconomyRequest: true, round }),
        ECONOMY_CODING_MODEL,
        `economy request escalated at round ${round}`,
      );
    }
  });

  it("the escalation tier is a genuinely different model from the first-attempt tier", () => {
    // If a cost cut ever points escalation back at the generator, the round gate
    // above still "passes" while buying nothing. Round 1 has to be a real
    // second opinion or the ladder is decorative.
    assert.notEqual(ESCALATION_MODEL, DEFAULT_CODING_MODEL);
  });
});
