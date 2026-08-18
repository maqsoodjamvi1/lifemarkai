import { describe,it,beforeEach,afterEach } from "node:test";
import assert from "node:assert/strict";

import { recordEvent,sanitizeEventFields,timeExternalCall } from "./events.ts";
import { runWithCorrelation } from "./correlation.ts";

function captureLogs(fn: () => void | Promise<void>): Promise<string[]> {
  const lines: string[] = [];
  const original = console.log;
  console.log = (line: string) => void lines.push(String(line));
  return Promise.resolve()
    .then(fn)
    .then(() => lines)
    .finally(() => {
      console.log = original;
    });
}

describe("sanitizeEventFields — the no-prompts-in-logs guarantee", () => {
  it("drops fields whose NAME suggests sensitive content", () => {
    const out = sanitizeEventFields({
      model: "gpt-x",
      prompt: "build me an app",
      promptText: "x",
      userMessage: "y",
      fileContent: "z",
      generatedCode: "…",
      accessToken: "sk-abc",
      api_key: "k",
      authorization: "Bearer x",
      SUPABASE_SECRET: "s",
      cookieHeader: "a=b",
    });
    assert.deepEqual(Object.keys(out), ["model"]);
  });

  it("keeps token COUNTERS despite the fragment match", () => {
    const out = sanitizeEventFields({ inputTokens: 100, outputTokens: 50, tokensUsed: 150, timeToFirstTokenMs: 320 });
    assert.deepEqual(out, { inputTokens: 100, outputTokens: 50, tokensUsed: 150, timeToFirstTokenMs: 320 });
  });

  it("drops nested objects and arrays entirely", () => {
    // A nested object is exactly how a prompt would sneak past a name check.
    const out = sanitizeEventFields({ ok: true, payload: { prompt: "hi" }, files: ["a.ts"] });
    assert.deepEqual(out, { ok: true });
  });

  it("truncates long strings", () => {
    const out = sanitizeEventFields({ error: "e".repeat(1000) });
    assert.equal((out.error as string).length, 257);
  });

  it("flattens Error objects to their message", () => {
    const out = sanitizeEventFields({ error: new Error("boom") });
    assert.equal(out.error, "boom");
  });
});

describe("recordEvent — flag gating", () => {
  beforeEach(() => {
    delete process.env.VERCEL_OBSERVABILITY_ENABLED;
  });
  afterEach(() => {
    delete process.env.VERCEL_OBSERVABILITY_ENABLED;
  });

  it("emits nothing while the flag is off (the default)", async () => {
    const lines = await captureLogs(() => recordEvent("ai_generation_completed", { model: "m" }));
    assert.equal(lines.length, 0);
  });

  it("emits a JSON line with correlation ids when enabled", async () => {
    process.env.VERCEL_OBSERVABILITY_ENABLED = "true";
    const lines = await captureLogs(() =>
      runWithCorrelation({ requestId: "req_t", buildRunId: "run_t" }, () =>
        recordEvent("ai_generation_completed", { model: "m", durationMs: 42, prompt: "nope" }),
      ),
    );
    assert.equal(lines.length, 1);
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.event, "ai_generation_completed");
    assert.equal(parsed.requestId, "req_t");
    assert.equal(parsed.buildRunId, "run_t");
    assert.equal(parsed.model, "m");
    assert.equal(parsed.prompt, undefined);
  });

  it("never throws, even on hostile input", () => {
    process.env.VERCEL_OBSERVABILITY_ENABLED = "true";
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    assert.doesNotThrow(() => recordEvent("ai_generation_failed", cyclic));
  });
});

describe("timeExternalCall", () => {
  beforeEach(() => {
    process.env.VERCEL_OBSERVABILITY_ENABLED = "true";
  });
  afterEach(() => {
    delete process.env.VERCEL_OBSERVABILITY_ENABLED;
  });

  it("returns the callback result and records success", async () => {
    let recorded: string[] = [];
    recorded = await captureLogs(async () => {
      const value = await timeExternalCall("stripe", "createCheckout", async () => 7);
      assert.equal(value, 7);
    });
    const parsed = JSON.parse(recorded[0]);
    assert.equal(parsed.event, "external_call_completed");
    assert.equal(parsed.dependency, "stripe");
    assert.equal(parsed.success, true);
    assert.ok(typeof parsed.durationMs === "number");
  });

  it("rethrows the error after recording the failure", async () => {
    const lines = await captureLogs(async () => {
      await assert.rejects(
        () => timeExternalCall("supabase-mgmt", "applyMigration", async () => {
          throw new Error("429 rate limited");
        }),
        /429/,
      );
    });
    const parsed = JSON.parse(lines[0]);
    assert.equal(parsed.success, false);
    assert.equal(parsed.error, "429 rate limited");
  });
});
