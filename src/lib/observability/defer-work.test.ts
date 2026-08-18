import { describe,it,afterEach } from "node:test";
import assert from "node:assert/strict";

import { deferWork,registerWaitUntil } from "./defer-work.ts";
import { correlationFields,runWithCorrelation } from "./correlation.ts";

describe("deferWork", () => {
  afterEach(() => registerWaitUntil(null as never));

  it("runs the work and never throws to the caller", async () => {
    let ran = false;
    assert.doesNotThrow(() => deferWork("test", async () => void (ran = true)));
    await new Promise((r) => setTimeout(r, 10));
    assert.equal(ran, true);
  });

  it("swallows rejections (deferred loss is acceptable, crash is not)", async () => {
    assert.doesNotThrow(() => deferWork("boom", async () => {
      throw new Error("deferred failure");
    }));
    await new Promise((r) => setTimeout(r, 10));
  });

  it("captures correlation ids AT CALL TIME, not at run time", async () => {
    let seen: Record<string, unknown> = {};
    runWithCorrelation({ requestId: "req_defer", buildRunId: "run_defer" }, () => {
      deferWork("ctx", async () => {
        // By the time this runs the request's ALS scope is gone…
        seen = correlationFields();
      });
    });
    await new Promise((r) => setTimeout(r, 10));
    // …but the deferred work still carries the request's ids.
    assert.equal(seen.requestId, "req_defer");
    assert.equal(seen.buildRunId, "run_defer");
  });

  it("hands the task to a registered platform waitUntil", async () => {
    const tracked: Array<Promise<unknown>> = [];
    registerWaitUntil((p) => tracked.push(p));
    deferWork("platform", async () => {});
    assert.equal(tracked.length, 1);
    await Promise.all(tracked);
  });
});
