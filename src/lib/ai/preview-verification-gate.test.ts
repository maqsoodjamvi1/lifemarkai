import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePreviewVerificationGate,type PreviewVerificationStep } from "./preview-verification-gate.ts";

const passed = (name: PreviewVerificationStep["name"]): PreviewVerificationStep => ({ name, status: "passed" });

test("candidate gate requires install, typecheck, build, and health", () => {
  assert.equal(evaluatePreviewVerificationGate({ mode: "candidate", steps: [passed("install"), passed("typecheck"), passed("build"), passed("health")] }).passed, true);
  const skipped = evaluatePreviewVerificationGate({ mode: "candidate", steps: [passed("install"), passed("build"), passed("health")] });
  assert.equal(skipped.passed, false);
  assert.equal(skipped.failures[0]?.name, "typecheck");
});

test("live preview also requires browser evidence", () => {
  const steps = [passed("install"), passed("typecheck"), passed("build"), passed("health")];
  assert.equal(evaluatePreviewVerificationGate({ mode: "preview", steps }).passed, false);
  assert.equal(evaluatePreviewVerificationGate({ mode: "preview", steps: [...steps, passed("browser")] }).passed, true);
});
