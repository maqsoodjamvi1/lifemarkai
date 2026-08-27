/**
 * Evidence demotes; noise never reorders. These tests exist mostly to pin the
 * refusals — the failure mode of a feedback loop is over-reacting, and this
 * repo has already lived through routing decided by things nobody could see.
 *
 *   node --import tsx --test src/lib/ai/model-performance.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { aggregateStats, demoteByEvidence, MIN_SAMPLE } from "./model-performance.ts";

const row = (model: string, task: string, success: boolean, latency = 1000) => ({
  model,
  task,
  success,
  latency_ms: latency,
});

const CHAIN = ["a/cheap", "b/mid", "c/frontier"];

describe("aggregation", () => {
  it("computes per-(model,task) failure rate and median latency", () => {
    const stats = aggregateStats([
      row("a/cheap", "build", true, 500),
      row("a/cheap", "build", false, 1500),
      row("a/cheap", "chat", true, 100),
    ]);
    const build = stats.find((s) => s.model === "a/cheap" && s.task === "build")!;
    assert.equal(build.calls, 2);
    assert.equal(build.failureRate, 0.5);
    assert.equal(build.medianLatencyMs, 1500);
  });

  it("drops rows without a model or task rather than inventing a bucket", () => {
    assert.deepEqual(
      aggregateStats([{ model: null, task: "x", success: false, latency_ms: 1 }]),
      [],
    );
  });
});

describe("demotion — proven, recent, and reversible", () => {
  const failing = (model: string, task: string, n: number) =>
    Array.from({ length: n }, () => row(model, task, false));

  it("moves a proven-bad model to the back, preserving all other order", () => {
    const stats = aggregateStats(failing("a/cheap", "build", MIN_SAMPLE));
    assert.deepEqual(demoteByEvidence(CHAIN, "build", stats), [
      "b/mid",
      "c/frontier",
      "a/cheap",
    ]);
  });

  it("does NOTHING below the sample floor — seven bad calls are an anecdote", () => {
    const stats = aggregateStats(failing("a/cheap", "build", MIN_SAMPLE - 1));
    assert.deepEqual(demoteByEvidence(CHAIN, "build", stats), CHAIN);
  });

  it("does NOTHING at a routine failure rate", () => {
    const rows = [
      ...failing("a/cheap", "build", 3),
      ...Array.from({ length: 10 }, () => row("a/cheap", "build", true)),
    ];
    assert.deepEqual(demoteByEvidence(CHAIN, "build", aggregateStats(rows)), CHAIN);
  });

  it("evidence about a DIFFERENT task never leaks across", () => {
    const stats = aggregateStats(failing("a/cheap", "chat", MIN_SAMPLE * 2));
    assert.deepEqual(demoteByEvidence(CHAIN, "build", stats), CHAIN);
  });

  it("never removes a model — demoted, not banished", () => {
    const stats = aggregateStats(failing("a/cheap", "build", MIN_SAMPLE));
    const out = demoteByEvidence(CHAIN, "build", stats);
    assert.equal(out.length, CHAIN.length);
    assert.ok(out.includes("a/cheap"));
  });

  it("no stats at all means the static order stands untouched", () => {
    assert.deepEqual(demoteByEvidence(CHAIN, "build", []), CHAIN);
  });
});
