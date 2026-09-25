import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePreviewVerificationGate,type PreviewVerificationStep,type PreviewVerificationStepName } from "./preview-verification-gate.ts";

const sources = {
  install: "sandbox-runner",
  typecheck: "typecheck-worker",
  build: "build-worker",
  health: "health-probe",
  browser: "playwright-worker",
} as const;
const passed = (name: PreviewVerificationStepName, minute = 0): PreviewVerificationStep => ({
  name,
  status: "passed",
  runId: "run-1",
  sandboxImage: "lifemark-preview@sha256:abc",
  source: sources[name],
  observedAt: `2026-09-25T08:${String(minute).padStart(2, "0")}:00.000Z`,
});
const evaluatedAt = "2026-09-25T08:05:00.000Z";

test("candidate gate requires install, typecheck, build, and health", () => {
  assert.equal(evaluatePreviewVerificationGate({ mode: "candidate", evaluatedAt, steps: [passed("install", 0), passed("typecheck", 1), passed("build", 2), passed("health", 3)] }).passed, true);
  const skipped = evaluatePreviewVerificationGate({ mode: "candidate", evaluatedAt, steps: [passed("install", 0), passed("build", 2), passed("health", 3)] });
  assert.equal(skipped.passed, false);
  assert.equal(skipped.failures[0]?.name, "typecheck");
});

test("live preview also requires browser evidence", () => {
  const steps = [passed("install", 0), passed("typecheck", 1), passed("build", 2), passed("health", 3)];
  assert.equal(evaluatePreviewVerificationGate({ mode: "preview", evaluatedAt, steps }).passed, false);
  assert.equal(evaluatePreviewVerificationGate({ mode: "preview", evaluatedAt, steps: [...steps, passed("browser", 4)] }).passed, true);
});

test("rejects mixed-run and wrong-source evidence", () => {
  const steps = [passed("install", 0), passed("typecheck", 1), passed("build", 2), passed("health", 3)];
  steps[2] = { ...steps[2]!, runId: "run-older" };
  assert.equal(evaluatePreviewVerificationGate({ mode: "candidate", evaluatedAt, steps }).passed, false);

  const wrongSource = [passed("install", 0), passed("typecheck", 1), { ...passed("build", 2), source: "sandbox-runner" as const }, passed("health", 3)];
  const verdict = evaluatePreviewVerificationGate({ mode: "candidate", evaluatedAt, steps: wrongSource });
  assert.equal(verdict.passed, false);
  assert.match(verdict.failures.map((failure) => failure.detail).join(" "), /cannot attest build/);
});

test("rejects stale and out-of-order evidence", () => {
  const stale = [passed("install", 0), passed("typecheck", 1), passed("build", 2), passed("health", 3)];
  assert.equal(evaluatePreviewVerificationGate({ mode: "candidate", evaluatedAt: "2026-09-25T09:00:00.000Z", maxEvidenceAgeMs: 60_000, steps: stale }).passed, false);
  const outOfOrder = [passed("install", 0), passed("typecheck", 3), passed("build", 2), passed("health", 4)];
  assert.equal(evaluatePreviewVerificationGate({ mode: "candidate", evaluatedAt, steps: outOfOrder }).passed, false);
});
