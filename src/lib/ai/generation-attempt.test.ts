import assert from "node:assert/strict";
import test from "node:test";
import {
  attemptClientFields,
  beginGenerationStep,
  closeGenerationAttempt,
  createGenerationAttempt,
  finalizeGenerationAttempt,
  finishGenerationStep,
  hasGenerationStep,
} from "./generation-attempt.ts";

test("generation attempts mint stable step idempotency keys", () => {
  const attempt = createGenerationAttempt("project-1");
  assert.match(attempt.attemptId, /^att_/);
  const contract = beginGenerationStep(attempt, "contract");
  const repair0 = beginGenerationStep(attempt, "repair", { repairRound: 0 });
  const repair1 = beginGenerationStep(attempt, "repair", { repairRound: 1 });
  assert.equal(contract.idempotencyKey, `${attempt.attemptId}:contract`);
  assert.equal(repair0.idempotencyKey, `${attempt.attemptId}:repair:0`);
  assert.equal(repair1.idempotencyKey, `${attempt.attemptId}:repair:1`);
  assert.equal(attempt.repairCount, 2);
  const done = finalizeGenerationAttempt(attempt, { firstBootSuccess: false, tokensUsed: 900 });
  assert.equal(done.firstBootSuccess, false);
  assert.equal(done.tokensUsed, 900);
  assert.ok((done.durationMs ?? 0) >= 0);
});

test("plan and publish steps share the attempt id", () => {
  const attempt = createGenerationAttempt("project-1");
  const plan = beginGenerationStep(attempt, "plan");
  const publish = beginGenerationStep(attempt, "publish");
  assert.equal(plan.idempotencyKey, `${attempt.attemptId}:plan`);
  assert.equal(publish.idempotencyKey, `${attempt.attemptId}:publish`);
});

test("hasGenerationStep sees recorded steps", () => {
  const attempt = createGenerationAttempt("project-1");
  assert.equal(hasGenerationStep(attempt, "boot"), false);
  beginGenerationStep(attempt, "boot");
  assert.equal(hasGenerationStep(attempt, "boot"), true);
  assert.equal(hasGenerationStep(undefined, "boot"), false);
});

test("finalizeGenerationAttempt is idempotent", () => {
  const attempt = createGenerationAttempt("project-1");
  finalizeGenerationAttempt(attempt, {
    firstBootSuccess: true,
    tokensUsed: 400,
    topFamily: "missing-export",
    familyCount: 1,
    families: "missing-export",
  });
  finalizeGenerationAttempt(attempt, {
    firstBootSuccess: false,
    tokensUsed: 400,
    families: "build",
  });
  assert.equal(attempt.finalized, true);
  assert.equal(attempt.firstBootSuccess, true);
  assert.equal(attempt.tokensUsed, 400);
  assert.equal(attempt.topFamily, "missing-export");
  const client = attemptClientFields(attempt);
  assert.equal(client.attemptId, attempt.attemptId);
  assert.equal(client.families, "missing-export");
  assert.equal(client.repairAccepted, null);
  assert.equal(client.falseGreen, false);
});

test("closeGenerationAttempt clusters terminal errors", () => {
  const attempt = createGenerationAttempt("project-1");
  closeGenerationAttempt(attempt, {
    firstBootSuccess: false,
    tokensUsed: 12,
    error: "cancelled",
    errors: [{ type: "missing_contract_export", message: "Header must export Header" }],
  });
  assert.equal(attempt.finalized, true);
  assert.equal(attempt.firstBootSuccess, false);
  assert.equal(attempt.topFamily, "missing-export");
});

test("generation attempts start PENDING and record evidence on successful steps", () => {
  const attempt = createGenerationAttempt("project-1");
  assert.equal(attempt.coreLoop.state, "PENDING");
  const generate = beginGenerationStep(attempt, "generate");
  finishGenerationStep(generate, { ok: true }, attempt);
  assert.equal(attempt.coreLoop.state, "GENERATED");
  const client = attemptClientFields(attempt);
  assert.equal(client.boundedFailure, false);
  assert.equal(client.coreLoopState, "GENERATED");
  assert.ok(client.coreLoopEvidenceCount >= 1);
});
