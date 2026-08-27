/**
 * The system kept a graded record of every repair attempt and never read one
 * back. These tests pin what it does with that memory now — and, just as
 * importantly, what it refuses to do with it.
 *
 *   node --import tsx --test src/lib/ai/repair-memory.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  buildPriorAttemptsBlock,
  suggestedStartingTier,
  toPriorAttempts,
  type PriorAttempt,
  type RepairOutcomeRow,
} from "./repair-memory.ts";

const TIERS = ["fast/model", "generator/model", "escalation/model"];
const tierOf = (m: string | null) => {
  const i = m ? TIERS.indexOf(m) : -1;
  return i >= 0 ? i : null;
};

const attempt = (o: Partial<PriorAttempt> = {}): PriorAttempt => ({
  model: TIERS[0], round: 1, resolved: 0, introduced: 0,
  fullyResolved: false, madeWorse: false, sameProject: true, ...o,
});

describe("starting tier — evidence, not superstition", () => {
  it("starts at the bottom with no history", () => {
    assert.equal(suggestedStartingTier([], tierOf, TIERS.length), 0);
  });

  it("skips a tier that attempted this failure and changed nothing", () => {
    assert.equal(
      suggestedStartingTier([attempt({ model: TIERS[0], resolved: 0 })], tierOf, TIERS.length),
      1,
    );
  });

  it("does NOT skip a tier that was making progress", () => {
    // Cleared some errors but not all. That tier was working — it needed
    // another turn, not replacing. Skipping it here would undo the whole point
    // of the progress-gated ladder.
    assert.equal(
      suggestedStartingTier([attempt({ model: TIERS[0], resolved: 3 })], tierOf, TIERS.length),
      0,
    );
  });

  it("does NOT skip a tier that actually resolved this failure before", () => {
    assert.equal(
      suggestedStartingTier(
        [attempt({ model: TIERS[0], resolved: 4, fullyResolved: true })],
        tierOf, TIERS.length,
      ),
      0,
    );
  });

  it("skips a tier that made things worse even if it cleared something", () => {
    assert.equal(
      suggestedStartingTier(
        [attempt({ model: TIERS[0], resolved: 2, introduced: 3, madeWorse: true })],
        tierOf, TIERS.length,
      ),
      1,
    );
  });

  it("never skips past the top tier", () => {
    assert.equal(
      suggestedStartingTier([attempt({ model: TIERS[2], resolved: 0 })], tierOf, TIERS.length),
      TIERS.length - 1,
    );
  });

  it("ignores rows whose model is no longer a tier", () => {
    // Models change (this repo swapped its escalation slug twice in one day).
    // A row naming a retired model must not silently push everything upward.
    assert.equal(
      suggestedStartingTier([attempt({ model: "retired/model", resolved: 0 })], tierOf, TIERS.length),
      0,
    );
  });
});

describe("prompt block", () => {
  it("says nothing when there is nothing to say", () => {
    // An empty "no prior attempts" section is pure token cost and invites the
    // model to read absence of history as meaningful.
    assert.equal(buildPriorAttemptsBlock([]), "");
  });

  it("tells the model not to repeat approaches that all failed", () => {
    const out = buildPriorAttemptsBlock([
      attempt({ model: "a/1", introduced: 2, madeWorse: true }),
      attempt({ model: "b/2", resolved: 0 }),
    ]);
    assert.match(out, /Do NOT repeat them/);
    assert.match(out, /a\/1/);
    assert.match(out, /b\/2/);
  });

  it("points at what worked when something did", () => {
    const out = buildPriorAttemptsBlock([attempt({ fullyResolved: true, resolved: 3 })]);
    assert.match(out, /RESOLVED it/);
    assert.match(out, /Prefer that shape of change/);
    assert.doesNotMatch(out, /Do NOT repeat/);
  });

  it("puts failures first — what not to repeat is the actionable half", () => {
    const out = buildPriorAttemptsBlock([
      attempt({ model: "worked/1", fullyResolved: true }),
      attempt({ model: "failed/1", resolved: 0 }),
    ]);
    assert.ok(out.indexOf("failed/1") < out.indexOf("worked/1"));
  });

  it("stays bounded no matter how much history exists", () => {
    const many = Array.from({ length: 50 }, (_, i) => attempt({ model: `m/${i}` }));
    assert.ok(buildPriorAttemptsBlock(many).split("\n").length < 12);
  });
});

describe("privacy — cross-project rows contribute signal, never content", () => {
  const row = (projectId: string): RepairOutcomeRow => ({
    model: "a/1", round: 1, resolved: ["x"], introduced: [],
    fully_resolved: false, made_worse: false,
    files_written: ["src/secret-client-name/Billing.tsx"],
    sample_label: "customer ACME internal error",
    project_id: projectId,
  });

  it("keeps file paths and samples for the SAME project", () => {
    const [a] = toPriorAttempts([row("p1")], "p1");
    assert.equal(a.sameProject, true);
    assert.deepEqual(a.filesWritten, ["src/secret-client-name/Billing.tsx"]);
  });

  it("drops file paths and samples for OTHER projects", () => {
    const [a] = toPriorAttempts([row("p2")], "p1");
    assert.equal(a.sameProject, false);
    assert.equal(a.filesWritten, undefined, "another project's paths must not cross over");
    assert.equal(a.sampleLabel, undefined, "another project's error text must not cross over");
    // The useful aggregate signal survives.
    assert.equal(a.resolved, 1);
    assert.equal(a.model, "a/1");
  });

  it("never renders another project's paths into the prompt", () => {
    const out = buildPriorAttemptsBlock(toPriorAttempts([row("p2")], "p1"));
    assert.doesNotMatch(out, /secret-client-name/);
    assert.doesNotMatch(out, /ACME/);
  });

  it("treats an unknown current project as cross-project", () => {
    // Fail closed: no project id means we cannot prove it is ours.
    const [a] = toPriorAttempts([row("p1")], undefined);
    assert.equal(a.sameProject, false);
    assert.equal(a.filesWritten, undefined);
  });
});
