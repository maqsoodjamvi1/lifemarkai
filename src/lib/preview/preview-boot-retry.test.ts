import { describe, it } from "node:test";
import assert from "node:assert/strict";

import {
  BOOT_SESSION_STALE_AFTER_MS,
  FIRST_RETRY_MS,
  GIVE_UP_AFTER_MS,
  MAX_RETRY_MS,
  nextBootRetry,
  restoreBootRetryState,
} from "./preview-boot-retry.ts";

describe("nextBootRetry", () => {
  it("retries quickly on the first view — most previews come up fast", () => {
    assert.deepEqual(nextBootRetry(0, 0), { action: "reload", delayMs: FIRST_RETRY_MS });
  });

  // The bug this file exists for: the old code multiplied a delay held in a
  // ref, but each reload re-created that ref, so the delay never grew and the
  // page polled a dead hostname every 3s forever.
  it("actually backs off as attempts accumulate", () => {
    const first = nextBootRetry(0, 0).delayMs;
    const third = nextBootRetry(2, 9_000).delayMs;
    const sixth = nextBootRetry(5, 40_000).delayMs;

    assert.ok(third > first, `expected backoff to grow, got ${first} then ${third}`);
    assert.ok(sixth > third, `expected backoff to keep growing, got ${third} then ${sixth}`);
  });

  it("caps the backoff so a slow cold start is still polled", () => {
    for (const attempt of [8, 20, 100]) {
      assert.equal(nextBootRetry(attempt, 1_000).delayMs, MAX_RETRY_MS);
    }
  });

  // The heart of #10: a preview that is never coming back must stop pretending
  // it is "starting" and say so, instead of spinning until the tab closes.
  it("gives up once the preview is clearly absent rather than slow", () => {
    assert.deepEqual(nextBootRetry(30, GIVE_UP_AFTER_MS), { action: "give-up", delayMs: 0 });
    assert.deepEqual(nextBootRetry(99, GIVE_UP_AFTER_MS * 5), { action: "give-up", delayMs: 0 });
  });

  it("keeps trying right up to the deadline", () => {
    const decision = nextBootRetry(4, GIVE_UP_AFTER_MS - 1_000);
    assert.equal(decision.action, "reload");
    assert.ok(decision.delayMs > 0);
  });

  it("clamps the final retry to the exact deadline", () => {
    assert.deepEqual(nextBootRetry(20, GIVE_UP_AFTER_MS - 1_000), {
      action: "reload",
      delayMs: 1_000,
    });
  });

  // A hand-edited or half-written sessionStorage value must not be able to
  // push the page into the wrong branch.
  it("treats corrupt counters as a fresh arrival", () => {
    for (const bad of [Number.NaN, -5, Number.NEGATIVE_INFINITY]) {
      assert.deepEqual(nextBootRetry(bad, 0), { action: "reload", delayMs: FIRST_RETRY_MS });
      assert.deepEqual(nextBootRetry(0, bad), { action: "reload", delayMs: FIRST_RETRY_MS });
    }
  });

  it("does not give up on an implausibly large attempt count alone", () => {
    // Attempts are cheap to inflate; only elapsed time decides the verdict.
    assert.equal(nextBootRetry(10_000, 0).action, "reload");
  });
});

describe("restoreBootRetryState", () => {
  const now = 1_000_000;

  it("restores a recent retry episode", () => {
    assert.deepEqual(
      restoreBootRetryState({ attempt: 2.9, since: now - 10_000, updatedAt: now - 3_000 }, now),
      { attempt: 2, since: now - 10_000, updatedAt: now - 3_000 },
    );
  });

  it("expires state left behind after a preview successfully replaced the boot page", () => {
    assert.equal(
      restoreBootRetryState(
        {
          attempt: 8,
          since: now - GIVE_UP_AFTER_MS,
          updatedAt: now - BOOT_SESSION_STALE_AFTER_MS - 1,
        },
        now,
      ),
      null,
    );
  });

  it("rejects malformed and future-dated state", () => {
    assert.equal(restoreBootRetryState({ attempt: -1, since: now, updatedAt: now }, now), null);
    assert.equal(
      restoreBootRetryState({ attempt: 1, since: now + 1, updatedAt: now + 1 }, now),
      null,
    );
  });
});
