import assert from "node:assert/strict";
import test from "node:test";
import {
  assessCoreLoopReleaseGate,
  normalizeCoreLoopFailureSignature,
  shouldStopCoreLoopCampaign,
  summarizeCoreLoop,
  type CoreLoopAttempt,
} from "./core-loop-report.ts";

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

test("failure signatures ignore volatile ids so systemic defects match", () => {
  const a = normalizeCoreLoopFailureSignature({
    publicUrlPassed: false,
    failedStage: "generation",
    error: "generation timed out after 300000ms (model=openai/gpt-5.6-luna)",
  });
  const b = normalizeCoreLoopFailureSignature({
    publicUrlPassed: false,
    failedStage: "generation",
    error: "generation timed out after 180000ms (model=openai/gpt-5.6-luna)",
  });
  assert.equal(a, "generation:timed out after <n>ms (model=openai/gpt-5.6-luna)");
  assert.equal(a, b);
  assert.equal(
    normalizeCoreLoopFailureSignature({
      publicUrlPassed: false,
      failedStage: "preview",
      error: "sandbox abcdef12-3456-7890-abcd-ef1234567890 failed",
    }),
    "preview:sandbox <uuid> failed",
  );
  assert.equal(
    normalizeCoreLoopFailureSignature({ publicUrlPassed: true, failedStage: undefined, error: undefined }),
    null,
  );
});

test("campaign stops after consecutive identical failures and resets on a pass", () => {
  const fail = (index: number): CoreLoopAttempt => ({
    ...base,
    index,
    publicUrlPassed: false,
    generationPassed: false,
    previewPassed: false,
    deploymentPassed: false,
    manualInterventionRequired: true,
    failedStage: "generation",
    error: "generation timed out after 300000ms (model=openai/gpt-5.6-luna)",
  });
  assert.equal(shouldStopCoreLoopCampaign([fail(1), fail(2)], 3).stop, false);
  assert.equal(shouldStopCoreLoopCampaign([fail(1), fail(2), fail(3)], 3).stop, true);
  assert.equal(
    shouldStopCoreLoopCampaign([fail(1), fail(2), { ...base, index: 3 }, fail(4), fail(5)], 3).stop,
    false,
  );
});

test("failure signatures collapse per-attempt hosts, container ids, and spaced stage prefixes", () => {
  const preview = (host: string) =>
    normalizeCoreLoopFailureSignature({
      publicUrlPassed: false,
      failedStage: "preview",
      error: `preview: sandbox https://${host}.preview.lifemarkai.app/app returned HTTP 502`,
    });
  assert.equal(preview("lm-7f3k9q"), preview("lm-2a8b4d"));
  assert.equal(preview("lm-7f3k9q"), "preview:sandbox https://<sub>.lifemarkai.app/app returned HTTP 502");

  const container = (id: string) =>
    normalizeCoreLoopFailureSignature({
      publicUrlPassed: false,
      failedStage: "preview",
      error: `docker container ${id} exited`,
    });
  assert.equal(container("a3f9c1b2d4e5"), container("b7e2d9f10c33"));
  assert.equal(container("a3f9c1b2d4e5"), "preview:docker container <hex> exited");

  // The stage is "public-url" but the error spells it "public URL".
  assert.equal(
    normalizeCoreLoopFailureSignature({
      publicUrlPassed: false,
      failedStage: "public-url",
      error: "public URL check failed: https://site-4821.netlify.app 404",
    }),
    "public-url:check failed: https://<sub>.netlify.app 404",
  );

  // Ordinary hex-looking words without digits must survive.
  assert.equal(
    normalizeCoreLoopFailureSignature({
      publicUrlPassed: false,
      failedStage: "deployment",
      error: "deployment defaced the build output",
    }),
    "deployment:defaced the build output",
  );
});
