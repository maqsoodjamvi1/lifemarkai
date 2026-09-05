import assert from "node:assert/strict";
import test from "node:test";
import { pollPreview, previewPollDelay } from "./poll-preview.ts";

test("healthy previews make 4 phase polls per minute instead of 50", () => {
  assert.equal(60_000 / previewPollDelay(false), 4);
  assert.equal(previewPollDelay(true), 1200);
});

test("slow requests do not overlap and cleanup aborts them", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let calls = 0;
  let signal: AbortSignal | undefined;
  let finish!: () => void;
  const stop = pollPreview(async (nextSignal) => {
    calls++;
    signal = nextSignal;
    await new Promise<void>((resolve) => { finish = resolve; });
  }, 1200);
  t.mock.timers.tick(1200);
  t.mock.timers.tick(6000);
  assert.equal(calls, 1);
  stop();
  assert.equal(signal?.aborted, true);
  finish();
  await Promise.resolve();
  await Promise.resolve();
  t.mock.timers.tick(60_000);
  assert.equal(calls, 1);
});

test("hidden tabs skip phase requests and failures still allow recovery", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let hidden = true;
  let calls = 0;
  const stop = pollPreview(async () => {
    calls++;
    throw new Error("temporary failure");
  }, 1200, () => hidden);
  t.mock.timers.tick(1200);
  assert.equal(calls, 0);
  hidden = false;
  t.mock.timers.tick(1200);
  await Promise.resolve();
  await Promise.resolve();
  t.mock.timers.tick(1200);
  assert.equal(calls, 2);
  stop();
});

test("hung requests receive an abort after 15 seconds", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  let signal: AbortSignal | undefined;
  const stop = pollPreview(async (nextSignal) => {
    signal = nextSignal;
    await new Promise<void>((resolve) => nextSignal.addEventListener("abort", () => resolve()));
  }, 1200);
  t.mock.timers.tick(1200);
  t.mock.timers.tick(15_000);
  assert.equal(signal?.aborted, true);
  stop();
});
