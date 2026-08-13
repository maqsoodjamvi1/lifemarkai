import assert from "node:assert/strict";
import test from "node:test";
import { assessCoreLoopReleaseGate,summarizeCoreLoop, type CoreLoopAttempt } from "./core-loop-report.ts";

const base: CoreLoopAttempt = {
  index: 1,
  prompt: "Build a CRM",
  startedAt: "2026-08-13T00:00:00.000Z",
  generationMs: 1_000,
  generationPassed: true,
  previewPassed: true,
  deploymentPassed: true,
  publicUrlPassed: true,
  automaticRepairUsed: false,
  automaticRepairPassed: false,
  repairRounds: 0,
  manualInterventionRequired: false,
  creditsUsed: 2,
  aiCostCents: 4,
  sandboxCostCents: 1,
};

test("summarizes the required reliability and cost metrics", () => {
  const summary = summarizeCoreLoop([
    base,
    {
      ...base,
      index: 2,
      generationMs: 3_000,
      previewPassed: false,
      deploymentPassed: false,
      publicUrlPassed: false,
      automaticRepairUsed: true,
      automaticRepairPassed: false,
      repairRounds: 2,
      manualInterventionRequired: true,
      creditsUsed: 4,
      aiCostCents: 8,
      sandboxCostCents: 3,
      failedStage: "preview",
    },
  ]);

  assert.equal(summary.generationSuccessRate, 1);
  assert.equal(summary.previewSuccessRate, 0.5);
  assert.equal(summary.deploymentSuccessRate, 0.5);
  assert.equal(summary.automaticRepairSuccessRate, 0);
  assert.equal(summary.manualInterventionRate, 0.5);
  assert.equal(summary.averageGenerationMs, 2_000);
  assert.equal(summary.averageCreditsPerProject, 3);
  assert.equal(summary.averageAiCostCentsPerProject, 6);
  assert.equal(summary.averageSandboxCostCentsPerProject, 2);
  assert.equal(summary.costTelemetryComplete, true);
});

test("does not pretend missing cost telemetry is zero", () => {
  const summary = summarizeCoreLoop([{ ...base, aiCostCents: null, sandboxCostCents: null }]);
  assert.equal(summary.averageAiCostCentsPerProject, null);
  assert.equal(summary.averageSandboxCostCentsPerProject, null);
  assert.equal(summary.costTelemetryComplete, false);
  assert.equal(summary.automaticRepairSuccessRate, null);
});

test("release gate requires volume, registration, success, and complete costs", () => {
  const summary = summarizeCoreLoop(Array.from({ length: 50 }, (_, index) => ({ ...base, index: index + 1 })));
  assert.deepEqual(assessCoreLoopReleaseGate(summary, true), {
    eligible: true,
    passed: true,
    reasons: [],
  });

  const incomplete = assessCoreLoopReleaseGate(
    summarizeCoreLoop([{ ...base, aiCostCents: null, sandboxCostCents: null }]),
    false,
  );
  assert.equal(incomplete.eligible, false);
  assert.equal(incomplete.passed, false);
  assert.ok(incomplete.reasons.length >= 3);
});
