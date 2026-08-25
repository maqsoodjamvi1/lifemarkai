/**
 * Pins the cost behaviour of the repair path.
 *
 *   node --experimental-strip-types --test src/lib/verify/repair-routing.test.ts
 *
 * The type-check gate finds MORE errors than the browser ever did. That is the
 * point — but it also means the gate could easily have INCREASED spend: every
 * compile error it surfaces triggers a repair round, and a repair round used to
 * cost a paid diagnosis call plus a broad-context generation.
 *
 * Measured at current prices, one compile-error repair round:
 *   before  $0.02323   diagnosis (DeepSeek Pro) + repair (Luna) over ~12k tokens
 *   after   $0.00045   no diagnosis + repair (Flash) over ~1.5k tokens
 *
 * These tests pin the two decisions that produce that 51x difference, because
 * both are easy to undo by accident while "just tidying up" the repair block.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { computeCostUsd } from "../ai/model-prices.ts";
import { DEFAULT_CODING_MODEL, DIAGNOSIS_MODEL, FAST_CODING_MODEL } from "../ai/model-defaults.ts";

/** Mirrors filesNamedByCompiler() in self-verify.ts. */
const COMPILER_PATH = /^([\w./-]+\.\w+):\d+/;
const pathOf = (e: string) => e.match(COMPILER_PATH)?.[1] ?? null;

describe("repair routing — compiler errors carry their own location", () => {
  it("extracts the file from a typecheck diagnostic", () => {
    assert.equal(pathOf("src/App.tsx:2:77 — TS2304: Cannot find name 'Dashboard'."), "src/App.tsx");
  });

  it("extracts the file from an unresolved-import diagnostic", () => {
    assert.equal(
      pathOf('src/pages/Home.tsx:4 — imports "./Missing", but no such file exists in the project'),
      "src/pages/Home.tsx",
    );
  });

  it("extracts nothing from a runtime stack trace", () => {
    // This is the case that MUST fall back to the broad heuristic context —
    // a runtime error genuinely does not know which file is at fault.
    assert.equal(pathOf("[route /reports] TypeError: Cannot read properties of undefined"), null);
  });
});

describe("repair routing — the cost properties that justify the gate", () => {
  const BROAD_IN = 12_000; // heuristic top-8 files at 6k chars each
  const PRECISE_IN = 1_500; // just the files the compiler named
  const OUT = 2_000;
  const DIAG_OUT = 400;

  const oldCost =
    (computeCostUsd(DIAGNOSIS_MODEL, BROAD_IN, DIAG_OUT) ?? 0) +
    (computeCostUsd(DEFAULT_CODING_MODEL, BROAD_IN, OUT) ?? 0);
  const newCost = computeCostUsd(FAST_CODING_MODEL, PRECISE_IN, OUT) ?? 0;

  it("makes a compile-error repair at least 10x cheaper", () => {
    assert.ok(oldCost / newCost > 10, `only ${(oldCost / newCost).toFixed(1)}x cheaper`);
  });

  it("keeps the fast tier genuinely cheaper than the generator", () => {
    // If someone repoints FAST_CODING_MODEL at something expensive, the cheap
    // repair path silently stops being cheap and nothing else would notice.
    const fast = computeCostUsd(FAST_CODING_MODEL, PRECISE_IN, OUT) ?? Infinity;
    const gen = computeCostUsd(DEFAULT_CODING_MODEL, PRECISE_IN, OUT) ?? 0;
    assert.ok(fast < gen, `fast tier (${fast}) is not cheaper than the generator (${gen})`);
  });

  it("keeps the diagnosis model expensive enough to be worth skipping", () => {
    // The whole argument for skipping diagnosis on compile errors is that it
    // costs real money. If DIAGNOSIS_MODEL ever became cheaper than the fast
    // tier, this optimisation would be pointless and should be revisited.
    const diag = computeCostUsd(DIAGNOSIS_MODEL, BROAD_IN, DIAG_OUT) ?? 0;
    assert.ok(diag > newCost, "diagnosis is no longer the expensive part — revisit the skip");
  });
});
