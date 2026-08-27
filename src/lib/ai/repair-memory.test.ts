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
  model: TIERS[0], round: 1, resolved: 0, introduced: 0, coverage: 1,
  fullyResolved: false, madeWorse: false, sameProject: true, ...o,
});

describe("starting tier — evidence, not superstition", () => {
  it("starts at the bottom with no history", () => {
    assert.equal(suggestedStartingTier([], tierOf, TIERS.length), 0);
  });

  it("ONE failed attempt is an anecdote — the tier is NOT skipped", () => {
    // The first version skipped on a single prior failure, which let one bad
    // row (possibly from another project) permanently bypass the cheapest
    // tier. External review was right: evidence thresholds, not reflexes.
    assert.equal(
      suggestedStartingTier([attempt({ model: TIERS[0], resolved: 0 })], tierOf, TIERS.length),
      0,
    );
  });

  it("skips a tier after TWO same-project no-progress failures", () => {
    assert.equal(
      suggestedStartingTier(
        [attempt({ resolved: 0 }), attempt({ resolved: 0 })],
        tierOf, TIERS.length,
      ),
      1,
    );
  });

  it("cross-project evidence needs FIVE failures, not two", () => {
    const cross = (n: number) =>
      Array.from({ length: n }, () => attempt({ resolved: 0, sameProject: false }));
    assert.equal(suggestedStartingTier(cross(4), tierOf, TIERS.length), 0);
    assert.equal(suggestedStartingTier(cross(5), tierOf, TIERS.length), 1);
  });

  it("low-coverage rows never count toward skipping — a related failure is not this failure", () => {
    const weak = Array.from({ length: 10 }, () => attempt({ resolved: 0, coverage: 0.2 }));
    assert.equal(suggestedStartingTier(weak, tierOf, TIERS.length), 0);
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

  it("made-worse counts as failure evidence, at the same thresholds", () => {
    const worse = attempt({ resolved: 2, introduced: 3, madeWorse: true });
    assert.equal(suggestedStartingTier([worse], tierOf, TIERS.length), 0);
    assert.equal(suggestedStartingTier([worse, worse], tierOf, TIERS.length), 1);
  });

  it("a tier that EVER fully resolved this failure is never skipped", () => {
    const attempts = [
      attempt({ resolved: 0 }),
      attempt({ resolved: 0 }),
      attempt({ fullyResolved: true, resolved: 3 }),
    ];
    assert.equal(suggestedStartingTier(attempts, tierOf, TIERS.length), 0);
  });

  it("never skips past the top tier", () => {
    const top = attempt({ model: TIERS[2], resolved: 0 });
    assert.equal(
      suggestedStartingTier([top, top], tierOf, TIERS.length),
      TIERS.length - 1,
    );
  });

  it("ignores rows whose model is no longer a tier", () => {
    // Models change (this repo swapped its escalation slug twice in one day).
    // A row naming a retired model must not silently push everything upward.
    const retired = attempt({ model: "retired/model", resolved: 0 });
    assert.equal(suggestedStartingTier([retired, retired, retired], tierOf, TIERS.length), 0);
  });
});

describe("prompt block", () => {
  it("says nothing when there is nothing to say", () => {
    // An empty "no prior attempts" section is pure token cost and invites the
    // model to read absence of history as meaningful.
    assert.equal(buildPriorAttemptsBlock([]), "");
  });

  it("tells the model not to repeat approaches that failed at high coverage", () => {
    const out = buildPriorAttemptsBlock([
      attempt({ model: "a/1", introduced: 2, madeWorse: true }),
      attempt({ model: "b/2", resolved: 0 }),
    ]);
    assert.match(out, /Do NOT repeat/);
    assert.match(out, /a\/1/);
    assert.match(out, /b\/2/);
  });

  it("related-only history never generates a prohibition", () => {
    // A prohibition earned on a NEIGHBOUR'S failure could forbid the right
    // approach for this one. Low-coverage rows are context, not law.
    const out = buildPriorAttemptsBlock([
      attempt({ resolved: 0, coverage: 0.2 }),
      attempt({ madeWorse: true, introduced: 2, coverage: 0.3 }),
    ]);
    assert.doesNotMatch(out, /Do NOT repeat/);
    assert.match(out, /weak context/);
  });

  it("a related success does not soften a high-coverage prohibition", () => {
    const out = buildPriorAttemptsBlock([
      attempt({ fullyResolved: true, resolved: 3, coverage: 0.2 }),
      attempt({ resolved: 0, coverage: 1 }),
    ]);
    assert.match(out, /Do NOT repeat/);
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

describe("coverage — a related failure is labelled as one, not sold as identical", () => {
  it("toPriorAttempts computes coverage against the CURRENT fingerprint set", () => {
    const rows = [{
      model: "a/1", round: 1, resolved: [], introduced: [],
      fully_resolved: false, made_worse: false,
      files_written: [], sample_label: null, project_id: "p1",
      before_fingerprints: ["fp-1", "fp-9"],
    }];
    const [a] = toPriorAttempts(rows, "p1", ["fp-1", "fp-2", "fp-3", "fp-4"]);
    assert.equal(a.coverage, 0.25);
  });

  it("the prompt marks low-coverage history as related, not exact", () => {
    const out = buildPriorAttemptsBlock([attempt({ coverage: 0.2, resolved: 0 })]);
    assert.match(out, /related, partly-overlapping/);
  });

  it("high-coverage history carries no such hedge", () => {
    const out = buildPriorAttemptsBlock([attempt({ coverage: 1, resolved: 0 })]);
    assert.doesNotMatch(out, /partly-overlapping/);
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
