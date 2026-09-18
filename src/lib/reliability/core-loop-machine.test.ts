import assert from "node:assert/strict";
import test from "node:test";
import {
  advanceCoreLoop,
  applyStepEvidence,
  canAdvance,
  coreLoopRunTerminal,
  createCoreLoopMachine,
  failBounded,
  isAdvanceRejected,
  isFailedBounded,
  isPreviewVerified,
  isReleaseReady,
  noteRepairRound,
  repairBudgetExhausted,
} from "./core-loop-machine.ts";

function passing(kind: "file_manifest" | "typecheck" | "sandbox_boot" | "browser_smoke" | "deploy_url" | "public_health") {
  return { kind, ok: true, recordedAt: "2026-09-18T00:00:00.000Z", summary: `${kind} ok` };
}

test("starts pending with no evidence and cannot self-report done", () => {
  const machine = createCoreLoopMachine();
  assert.equal(machine.state, "PENDING");
  assert.equal(machine.evidence.length, 0);
  assert.equal(isPreviewVerified(machine), false);
  assert.equal(isReleaseReady(machine), false);
});

test("each transition requires the matching passing evidence", () => {
  let machine = createCoreLoopMachine();
  const skipped = canAdvance(machine, "VALIDATED", passing("typecheck"));
  assert.equal(skipped.ok, false);

  const generated = advanceCoreLoop(machine, "GENERATED", passing("file_manifest"));
  assert.equal(isAdvanceRejected(generated), false);
  machine = generated as ReturnType<typeof createCoreLoopMachine>;
  assert.equal(machine.state, "GENERATED");
  assert.equal(machine.evidence.length, 1);

  const wrongKind = canAdvance(machine, "VALIDATED", passing("sandbox_boot"));
  assert.equal(wrongKind.ok, false);

  const failedEvidence = canAdvance(machine, "VALIDATED", {
    kind: "typecheck",
    ok: false,
    recordedAt: "2026-09-18T00:00:00.000Z",
    summary: "tsc failed",
  });
  assert.equal(failedEvidence.ok, false);
});

test("walks GENERATED through PUBLIC_URL_VERIFIED with stored evidence", () => {
  let machine = createCoreLoopMachine();
  const steps = [
    ["GENERATED", "file_manifest"],
    ["VALIDATED", "typecheck"],
    ["PREVIEW_BOOTED", "sandbox_boot"],
    ["BROWSER_VERIFIED", "browser_smoke"],
    ["PUBLISHED", "deploy_url"],
    ["PUBLIC_URL_VERIFIED", "public_health"],
  ] as const;
  for (const [state, kind] of steps) {
    const next = advanceCoreLoop(machine, state, passing(kind));
    assert.equal(isAdvanceRejected(next), false, `${state} should advance`);
    machine = next as ReturnType<typeof createCoreLoopMachine>;
    assert.equal(machine.state, state);
  }
  assert.equal(isPreviewVerified(machine), true);
  assert.equal(isReleaseReady(machine), true);
  assert.equal(machine.evidence.length, 6);
  assert.deepEqual(
    machine.evidence.map((row) => row.kind),
    ["file_manifest", "typecheck", "sandbox_boot", "browser_smoke", "deploy_url", "public_health"],
  );
});

test("exhausted repairs terminate as FAILED_BOUNDED and cannot advance", () => {
  let machine = createCoreLoopMachine({ maxRepairRounds: 2 });
  machine = noteRepairRound(machine);
  machine = noteRepairRound(machine);
  assert.equal(repairBudgetExhausted(machine), true);
  machine = failBounded(machine, { summary: "ladder exhausted after 2 rounds" });
  assert.equal(machine.state, "FAILED_BOUNDED");
  assert.equal(isFailedBounded(machine), true);
  assert.equal(isPreviewVerified(machine), false);
  const refused = canAdvance(machine, "GENERATED", passing("file_manifest"));
  assert.equal(refused.ok, false);
  assert.equal(failBounded(machine, { summary: "again" }).evidence.length, machine.evidence.length);
  assert.deepEqual(coreLoopRunTerminal(machine, true), {
    status: "failed",
    failureCode: "FAILED_BOUNDED",
    verificationPassed: false,
  });
});

test("applyStepEvidence advances on success and records failure without skipping", () => {
  let machine = createCoreLoopMachine();
  machine = applyStepEvidence(machine, "generate", { ok: true, durationMs: 10 });
  assert.equal(machine.state, "GENERATED");
  machine = applyStepEvidence(machine, "validate", { ok: false, error: "TS2304" });
  assert.equal(machine.state, "GENERATED");
  assert.equal(machine.evidence.at(-1)?.ok, false);
  machine = applyStepEvidence(machine, "validate", { ok: true });
  assert.equal(machine.state, "VALIDATED");
  machine = applyStepEvidence(machine, "publish", { ok: true });
  assert.equal(machine.state, "VALIDATED");
});
