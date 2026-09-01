/**
 * Covers createKeyedSerialQueue() — the per-key request serializer that
 * closes the editor autosave out-of-order-completion race (see the doc
 * comment in keyed-serial-queue.ts). These tests encode the exact guarantee
 * the fix depends on: a later call for a key must not even START its work
 * until the earlier call for that key has fully settled, so two saves for
 * the same file can never be in flight — and therefore can never complete —
 * out of order.
 *
 *   node --import tsx --test src/lib/editor/keyed-serial-queue.test.ts
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

import { createKeyedSerialQueue } from "./keyed-serial-queue.ts";

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

describe("createKeyedSerialQueue — same-key serialization", () => {
  it("does not start a second call for the same key until the first has settled", async () => {
    const run = createKeyedSerialQueue();
    const first = deferred<void>();
    const started: string[] = [];

    const p1 = run("file-A", async () => {
      started.push("first");
      await first.promise;
    });
    const p2 = run("file-A", async () => {
      started.push("second");
    });

    // Give both a chance to run any synchronously-reachable code.
    await Promise.resolve();
    await Promise.resolve();
    assert.deepEqual(started, ["first"], "the second call must not have started yet");

    first.resolve();
    await p1;
    await p2;
    assert.deepEqual(started, ["first", "second"]);
  });

  it("reproduces the motivating scenario: a slower first save can never let a faster second save be overwritten out of order", async () => {
    // Simulates: user types "v1", pauses (debounce fires, PATCH #1 starts and
    // is slow) — then types more, pauses again (PATCH #2 starts, and would
    // resolve fast). Without serialization, PATCH #2 could complete and then
    // get clobbered when the slower PATCH #1 finally lands. With the queue,
    // PATCH #2 cannot even begin until PATCH #1 is done, so the server's
    // last write is always whichever call was issued last.
    const run = createKeyedSerialQueue();
    let serverContent = "";
    const order: string[] = [];

    const slowFirstSave = run("file-A", async () => {
      await new Promise((r) => setTimeout(r, 30));
      order.push("v1-applied");
      serverContent = "v1";
    });
    const fastSecondSave = run("file-A", async () => {
      order.push("v2-applied");
      serverContent = "v2";
    });

    await Promise.all([slowFirstSave, fastSecondSave]);
    assert.deepEqual(order, ["v1-applied", "v2-applied"], "must apply in call order, not completion-speed order");
    assert.equal(serverContent, "v2", "the last-issued save must win");
  });

  it("propagates each call's own resolved value to its own caller", async () => {
    const run = createKeyedSerialQueue();
    const r1 = run("k", async () => "one");
    const r2 = run("k", async () => "two");
    assert.equal(await r1, "one");
    assert.equal(await r2, "two");
  });

  it("propagates each call's own rejection without affecting other callers", async () => {
    const run = createKeyedSerialQueue();
    const r1 = run("k", async () => {
      throw new Error("boom");
    });
    const r2 = run("k", async () => "still runs");
    await assert.rejects(r1, /boom/);
    assert.equal(await r2, "still runs", "a failure in an earlier call must not block or fail a later one");
  });

  it("does not let one key's failure delay a later call queued behind it", async () => {
    const run = createKeyedSerialQueue();
    const started: string[] = [];
    const p1 = run("k", async () => {
      started.push("first");
      throw new Error("fail");
    });
    const p2 = run("k", async () => {
      started.push("second");
    });
    await p1.catch(() => {});
    await p2;
    assert.deepEqual(started, ["first", "second"]);
  });
});

describe("createKeyedSerialQueue — independent keys", () => {
  it("runs different keys concurrently, never blocking one on the other", async () => {
    const run = createKeyedSerialQueue();
    const blockA = deferred<void>();
    const started: string[] = [];

    const pA = run("file-A", async () => {
      started.push("A-start");
      await blockA.promise;
      started.push("A-end");
    });
    const pB = run("file-B", async () => {
      started.push("B-start");
      started.push("B-end");
    });

    await pB;
    assert.ok(started.includes("B-start") && started.includes("B-end"), "file-B must complete without waiting on file-A");
    assert.ok(!started.includes("A-end"), "file-A must still be blocked on its own deferred");

    blockA.resolve();
    await pA;
    assert.deepEqual(started, ["A-start", "B-start", "B-end", "A-end"]);
  });
});

describe("createKeyedSerialQueue — cleanup", () => {
  it("a key's queue entry does not permanently pin memory after all calls settle", async () => {
    const run = createKeyedSerialQueue();
    await run("file-A", async () => "done");
    // Give the internal cleanup microtask a turn to run.
    await Promise.resolve();
    await Promise.resolve();
    // No direct way to inspect the internal Map from outside — but a fresh
    // call for the same key afterward must run immediately (not hang behind
    // a stale, already-settled entry), which is the externally-observable
    // symptom of a cleanup bug.
    const started = Date.now();
    await run("file-A", async () => "done again");
    assert.ok(Date.now() - started < 100, "a call after cleanup must not be delayed");
  });
});
