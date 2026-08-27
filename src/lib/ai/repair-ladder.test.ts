/**
 * The repair ladder promotes on MEASURED PROGRESS, not on round number.
 *
 * The rule this replaced escalated on round 1 unconditionally. Against real
 * telemetry (repair_outcomes, 11 days) that meant abandoning a tier that had
 * just resolved 97 of 138 errors, in favour of one that resolved 34 of 82, at
 * ~200x the cost per call. Every test below fails against that rule.
 *
 *   node --experimental-strip-types --test src/lib/ai/repair-ladder.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  isLadderExhausted,
  resolveRepairTier,
  shouldPromoteRepairTier,
} from "./repair-ladder.ts";

const TIERS = 3; // fast -> generator -> escalation

describe("promotion — a tier that is working keeps its turn", () => {
  it("does not promote while the error count is falling", () => {
    // THE REGRESSION. This is the measured case: 138 errors down to 41. The old
    // round-keyed rule escalated here anyway.
    assert.equal(shouldPromoteRepairTier(41, 138), false);
    assert.equal(shouldPromoteRepairTier(1, 2), false);
  });

  it("promotes when the count does not move", () => {
    assert.equal(shouldPromoteRepairTier(7, 7), true);
  });

  it("promotes when the repair made things worse", () => {
    // Same bucket as "changed nothing" on purpose — both mean this tier has
    // stopped being the right tool.
    assert.equal(shouldPromoteRepairTier(9, 7), true);
  });

  it("never promotes on the first round, which has no baseline", () => {
    // An ungraded attempt cannot have failed. Getting this wrong would
    // reproduce the round-number bug exactly: escalate before any evidence.
    assert.equal(shouldPromoteRepairTier(12, null), false);
    assert.equal(shouldPromoteRepairTier(0, null), false);
  });
});

describe("tier resolution — the floor pushes up, never down", () => {
  it("keeps the cheap tier when the context is small and located", () => {
    assert.equal(resolveRepairTier(0, 0, TIERS), 0);
  });

  it("raises a cheap-tier round to the generator when context is broad", () => {
    // The fast tier is measured to collapse on large inputs (175s on a 250-line
    // file), so a heuristic top-8 context must never land there.
    assert.equal(resolveRepairTier(0, 1, TIERS), 1);
  });

  it("does NOT let a low floor demote a tier that already stalled", () => {
    // The subtle one. Promotion is a high-water mark: a tier that failed on the
    // errors still in the file has not become capable again just because this
    // round's context happens to be small.
    assert.equal(resolveRepairTier(2, 0, TIERS), 2);
  });

  it("clamps to the top tier rather than indexing past the ladder", () => {
    assert.equal(resolveRepairTier(9, 0, TIERS), TIERS - 1);
  });
});

describe("exhaustion — stop when the best tier has itself stalled", () => {
  it("is not exhausted while a tier remains", () => {
    assert.equal(isLadderExhausted(TIERS - 1, TIERS), false);
  });

  it("is exhausted once promotion runs past the last tier", () => {
    // The old shape could not express this and simply burned its remaining
    // rounds paying the top tier to fail again.
    assert.equal(isLadderExhausted(TIERS, TIERS), true);
  });
});

describe("end-to-end: the measured sequence costs one cheap tier, not an escalation", () => {
  it("stays on tier 0 through a converging run", () => {
    // 138 -> 41 -> 12 -> 0: the shape the telemetry shows the cheap tier is
    // capable of, and which the old rule cut off after one turn.
    let tier = 0;
    let last: number | null = null;
    for (const count of [138, 41, 12]) {
      if (shouldPromoteRepairTier(count, last)) tier += 1;
      last = count;
    }
    assert.equal(tier, 0, "a converging run must never escalate");
    assert.equal(resolveRepairTier(tier, 0, TIERS), 0);
  });

  it("escalates once, and only at the point progress actually stops", () => {
    let tier = 0;
    let last: number | null = null;
    const promotions: number[] = [];
    for (const [i, count] of [40, 12, 12, 3].entries()) {
      if (shouldPromoteRepairTier(count, last)) promotions.push(i);
      if (promotions.includes(i)) tier += 1;
      last = count;
    }
    assert.deepEqual(promotions, [2], "should promote only at the stall");
    assert.equal(tier, 1);
  });
});
