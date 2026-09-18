import assert from "node:assert/strict";
import test from "node:test";
import { createGenerationAttempt } from "./generation-attempt.ts";
import { persistStepArtifact, recordAttemptStep, runDurableStep } from "./generation-loop.ts";

test("runDurableStep records success and does not persist streaming generate", async () => {
  const attempt = createGenerationAttempt("p1");
  let storeCalls = 0;
  const store = {
    async runStep(_runId: string, _key: string, fn: () => Promise<unknown>) {
      storeCalls += 1;
      return fn();
    },
    async recordStepFailure() {
      storeCalls += 1;
    },
  };
  const value = await runDurableStep({
    attempt,
    step: "generate",
    persist: false,
    timeoutMs: 0,
    store: store as never,
    runId: "run_1",
    fn: async () => 7,
  });
  assert.equal(value, 7);
  assert.equal(storeCalls, 0);
  assert.equal(attempt.steps[0]?.ok, true);
});

test("runDurableStep retries then records failure", async () => {
  const attempt = createGenerationAttempt("p1");
  let tries = 0;
  await assert.rejects(
    () =>
      runDurableStep({
        attempt,
        step: "contract",
        timeoutMs: 0,
        retries: 1,
        fn: async () => {
          tries += 1;
          throw new Error("contract JSON was invalid");
        },
      }),
    /invalid/,
  );
  assert.equal(tries, 2);
  assert.equal(attempt.steps[0]?.ok, false);
});

test("recordAttemptStep books typecheck and smoke on the attempt", () => {
  const attempt = createGenerationAttempt("p1");
  recordAttemptStep(attempt, "validate", { ok: false, error: "TS2304" });
  recordAttemptStep(attempt, "smoke", { ok: true });
  assert.equal(attempt.steps.map((step) => step.step).join(","), "validate,smoke");
  assert.equal(attempt.steps[0]?.ok, false);
  assert.equal(attempt.steps[1]?.ok, true);
});

test("runDurableStep records core-loop evidence on generate and validate", async () => {
  const attempt = createGenerationAttempt("p1");
  await runDurableStep({
    attempt,
    step: "generate",
    persist: false,
    timeoutMs: 0,
    fn: async () => ({ files: 3 }),
  });
  await runDurableStep({
    attempt,
    step: "validate",
    persist: false,
    timeoutMs: 0,
    fn: async () => ({ ok: true }),
  });
  assert.equal(attempt.coreLoop.state, "VALIDATED");
  assert.equal(attempt.coreLoop.evidence.every((row) => row.ok), true);
});

test("persistStepArtifact stores a small verdict and swallows store errors", async () => {
  const attempt = createGenerationAttempt("p1");
  recordAttemptStep(attempt, "validate", { ok: false, error: "TS2304" });
  let stored: unknown;
  const store = {
    async runStep(_runId: string, _key: string, fn: () => Promise<unknown>) {
      stored = await fn();
      return stored;
    },
  };
  await persistStepArtifact(store as never, "run_1", attempt.steps[0]!.idempotencyKey, {
    ok: false,
    errorCount: 1,
  });
  assert.deepEqual(stored, { ok: false, errorCount: 1 });
  await persistStepArtifact(
    {
      async runStep() {
        throw new Error("db down");
      },
    } as never,
    "run_1",
    "att_x:validate",
    { ok: true },
  );
});
