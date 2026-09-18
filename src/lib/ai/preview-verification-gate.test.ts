import assert from "node:assert/strict";
import test from "node:test";
import {
  CANDIDATE_WORKFLOW_STEPS,
  emptyPreviewGateEvidence,
  evaluatePreviewVerificationGate,
  evidenceFromCandidateBuild,
  failedStep,
  passedStep,
  previewWorkflowPassed,
  skippedStep,
} from "./preview-verification-gate.ts";

function completeEvidence() {
  return {
    install: passedStep(),
    typecheck: passedStep(),
    build: passedStep(),
    boot: passedStep(),
    smoke: passedStep(),
  };
}

test("a preview is valid only after install, typecheck, build, boot and Playwright smoke", () => {
  const missingSmoke = { ...completeEvidence(), smoke: skippedStep("Playwright page-load did not run") };
  assert.equal(previewWorkflowPassed(missingSmoke).ok, false);
  assert.deepEqual(previewWorkflowPassed(missingSmoke).missing, ["smoke"]);
  assert.equal(previewWorkflowPassed(completeEvidence()).ok, true);
});

test("skipped workflow steps fail closed instead of counting as green", () => {
  const verdict = evaluatePreviewVerificationGate({
    originalFailures: [],
    remainingErrors: [],
    diffs: [],
    evidence: emptyPreviewGateEvidence(),
  });
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.incompleteWorkflow, true);
  assert.match(verdict.rejectionReasons.join(" "), /incomplete preview workflow/);
});

test("candidate mode still requires install, typecheck, build and boot", () => {
  const evidence = {
    ...completeEvidence(),
    smoke: skippedStep("candidate cannot Playwright the live app"),
  };
  const incomplete = evaluatePreviewVerificationGate({
    originalFailures: [],
    remainingErrors: [],
    diffs: [],
    evidence: { ...evidence, typecheck: skippedStep("type-check did not run") },
    requiredSteps: CANDIDATE_WORKFLOW_STEPS,
  });
  assert.equal(incomplete.accepted, false);
  const complete = evaluatePreviewVerificationGate({
    originalFailures: [],
    remainingErrors: [],
    diffs: [],
    evidence,
    requiredSteps: CANDIDATE_WORKFLOW_STEPS,
  });
  assert.equal(complete.accepted, true);
});

test("independent verifier can reject a workflow-green repair that does not match the original failure", () => {
  const verdict = evaluatePreviewVerificationGate({
    originalFailures: [{ type: "missing_contract_export", message: "src/lib/utils.ts must export cn" }],
    remainingErrors: [],
    diffs: [
      {
        path: "src/styles.css",
        before: "body{}",
        after: "html{}",
      },
    ],
    evidence: completeEvidence(),
    repairAgentDiagnosis: "Fixed utils.ts export",
  });
  assert.equal(verdict.accepted, false);
  assert.equal(verdict.summary.falseGreen, true);
  assert.equal(verdict.summary.repairAccepted, false);
});

test("accepts a targeted repair when reconstruction matches and the real workflow is green", () => {
  const verdict = evaluatePreviewVerificationGate({
    originalFailures: [{ type: "missing_contract_export", message: "src/components/Header.tsx must export Header" }],
    remainingErrors: [],
    diffs: [
      {
        path: "src/components/Header.tsx",
        before: "export function SiteHeader() { return null; }",
        after: "export function Header() { return null; }",
      },
    ],
    evidence: completeEvidence(),
  });
  assert.equal(verdict.accepted, true);
  assert.equal(verdict.summary.repairAccepted, true);
  assert.equal(verdict.summary.falseGreen, false);
  assert.equal(verdict.layer, "internal-reference");
});

test("maps candidate build output onto workflow evidence without treating missing stages as passes", () => {
  const fromBuild = evidenceFromCandidateBuild({
    available: true,
    passed: true,
    errors: [],
  });
  assert.equal(fromBuild.build?.passed, true);
  assert.equal(fromBuild.typecheck?.ran, false);
  assert.equal(fromBuild.boot?.ran, false);
  const withStages = evidenceFromCandidateBuild({
    available: true,
    passed: true,
    errors: [],
    stages: { install: true, typecheck: true, build: true, boot: true },
  });
  assert.equal(withStages.install?.passed, true);
  assert.equal(withStages.typecheck?.ran, true);
  assert.equal(withStages.boot?.ran, true);
  const installFail = evidenceFromCandidateBuild({
    available: true,
    passed: false,
    errors: ["npm install ERESOLVE could not resolve"],
    stages: { install: false, typecheck: false, build: false, boot: false },
  });
  assert.equal(installFail.install?.passed, false);
  assert.equal(failedStep(["x"]).passed, false);
});
