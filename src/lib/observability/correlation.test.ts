import { describe,it } from "node:test";
import assert from "node:assert/strict";

import {
CORRELATION_HEADERS,
applyCorrelationHeaders,
correlationFields,
correlationFromRequest,
ensureBuildRunId,
getCorrelation,
newBuildRunId,
newRequestId,
runWithCorrelation,
setCorrelation,
withCorrelationHeaders,
} from "./correlation.ts";

describe("correlation ids", () => {
  it("mints a requestId when nothing is supplied", () => {
    runWithCorrelation({}, () => {
      assert.match(getCorrelation()!.requestId, /^req_[a-f0-9]{32}$/);
    });
  });

  it("is undefined outside a context instead of throwing", () => {
    assert.equal(getCorrelation(), undefined);
    assert.deepEqual(correlationFields(), {});
  });

  it("generates distinct ids", () => {
    const ids = new Set(Array.from({ length: 200 }, () => newRequestId()));
    assert.equal(ids.size, 200);
  });

  it("survives await boundaries", async () => {
    await runWithCorrelation({ requestId: "req_fixed" }, async () => {
      await new Promise((resolve) => setTimeout(resolve, 1));
      assert.equal(getCorrelation()!.requestId, "req_fixed");
    });
  });

  it("keeps sibling contexts isolated", async () => {
    const [a, b] = await Promise.all([
      runWithCorrelation({ requestId: "req_a" }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        return getCorrelation()!.requestId;
      }),
      runWithCorrelation({ requestId: "req_b" }, async () => getCorrelation()!.requestId),
    ]);
    assert.equal(a, "req_a");
    assert.equal(b, "req_b");
  });

  it("inherits the parent requestId when nesting", () => {
    runWithCorrelation({ requestId: "req_outer", projectId: "proj-1" }, () => {
      runWithCorrelation({ route: "inner" }, () => {
        assert.equal(getCorrelation()!.requestId, "req_outer");
        assert.equal(getCorrelation()!.projectId, "proj-1");
        assert.equal(getCorrelation()!.route, "inner");
      });
    });
  });
});

describe("buildRunId", () => {
  /**
   * Phase 0's acceptance criterion is "every build has a STABLE buildRunId".
   * Generation, self-verify and each repair round all call into this; if the id
   * were re-minted per stage, a failed build would still be four unrelated log
   * streams and nothing in Phase 1 could tell you which stage failed.
   */
  it("is minted once and reused for the whole build", () => {
    runWithCorrelation({}, () => {
      const first = ensureBuildRunId();
      assert.match(first, /^run_[a-f0-9]{32}$/);
      assert.equal(ensureBuildRunId(), first);
      assert.equal(getCorrelation()!.buildRunId, first);
    });
  });

  it("keeps an id handed down from an upstream process", () => {
    runWithCorrelation({ buildRunId: "run_upstream" }, () => {
      assert.equal(ensureBuildRunId(), "run_upstream");
    });
  });

  it("does not blow up outside a context", () => {
    assert.match(ensureBuildRunId(), /^run_/);
  });
});

describe("setCorrelation", () => {
  it("attaches ids discovered mid-request", () => {
    runWithCorrelation({}, () => {
      setCorrelation({ userId: "user-1", sandboxSessionId: "sbx_1" });
      const fields = correlationFields();
      assert.equal(fields.userId, "user-1");
      assert.equal(fields.sandboxSessionId, "sbx_1");
    });
  });

  it("omits unset ids from log fields", () => {
    runWithCorrelation({ requestId: "req_x" }, () => {
      assert.deepEqual(Object.keys(correlationFields()), ["requestId"]);
    });
  });
});

describe("header propagation", () => {
  it("reads ids off an inbound request", () => {
    const request = new Request("http://localhost/api/ai/chat", {
      headers: {
        [CORRELATION_HEADERS.requestId]: "req_from_upstream",
        [CORRELATION_HEADERS.buildRunId]: "run_from_upstream",
      },
    });
    const seed = correlationFromRequest(request);
    assert.equal(seed.requestId, "req_from_upstream");
    assert.equal(seed.buildRunId, "run_from_upstream");
    assert.equal(seed.sandboxSessionId, undefined);
  });

  /**
   * These ids land in log lines and (in Phase 6) database rows keyed by
   * buildRunId. A header is attacker-controlled, so anything with a newline,
   * a quote, or 4KB of junk must be dropped rather than forwarded.
   */
  it("drops malformed or oversized inbound ids", () => {
    const request = new Request("http://localhost/api/ai/chat", {
      headers: {
        [CORRELATION_HEADERS.requestId]: "req with spaces",
        [CORRELATION_HEADERS.buildRunId]: "x".repeat(200),
      },
    });
    const seed = correlationFromRequest(request);
    assert.equal(seed.requestId, undefined);
    assert.equal(seed.buildRunId, undefined);
  });

  /**
   * The database is stricter than the log sanitizer: build_runs.id is
   * CHECK ^run_[A-Za-z0-9_-]+$, while sanitizeId also allows '.' and ':' and
   * any prefix. An id that survives the header but not the constraint would
   * make startRun's insert fail — and startRun only warns, so the build would
   * lose durability with nothing surfaced.
   */
  it("does not reuse an inbound build id the database would reject", () => {
    for (const hostile of ["a.b", "req_abc", "sbx_abc", "run", "run_"]) {
      const seed = correlationFromRequest(
        new Request("http://localhost/api/ai/agent", {
          headers: { [CORRELATION_HEADERS.buildRunId]: hostile },
        }),
      );
      const minted = runWithCorrelation(seed, () => ensureBuildRunId());
      assert.notEqual(minted, hostile);
      assert.match(minted, /^run_[A-Za-z0-9_-]+$/);
    }
  });

  it("still reuses a well-formed inbound build id", () => {
    const seed = correlationFromRequest(
      new Request("http://localhost/api/ai/agent", {
        headers: { [CORRELATION_HEADERS.buildRunId]: "run_from_upstream" },
      }),
    );
    assert.equal(runWithCorrelation(seed, () => ensureBuildRunId()), "run_from_upstream");
  });

  it("stamps outbound headers and clears stale ones", () => {
    runWithCorrelation({ requestId: "req_1", buildRunId: "run_1" }, () => {
      const headers = applyCorrelationHeaders(
        new Headers({ [CORRELATION_HEADERS.sandboxSessionId]: "sbx_stale" }),
      );
      assert.equal(headers.get(CORRELATION_HEADERS.requestId), "req_1");
      assert.equal(headers.get(CORRELATION_HEADERS.buildRunId), "run_1");
      assert.equal(headers.get(CORRELATION_HEADERS.sandboxSessionId), null);
    });
  });

  it("echoes ids on the response without consuming the body", async () => {
    await runWithCorrelation({ requestId: "req_2" }, async () => {
      const stamped = withCorrelationHeaders(new Response("hello", { status: 201 }));
      assert.equal(stamped.status, 201);
      assert.equal(stamped.headers.get(CORRELATION_HEADERS.requestId), "req_2");
      assert.equal(await stamped.text(), "hello");
    });
  });

  it("round-trips through a proxy hop", () => {
    runWithCorrelation({ requestId: "req_3", buildRunId: newBuildRunId() }, () => {
      const outbound = applyCorrelationHeaders(new Headers());
      const downstream = correlationFromRequest(
        new Request("http://127.0.0.1:3010/ai/chat", { headers: outbound }),
      );
      assert.equal(downstream.requestId, "req_3");
      assert.equal(downstream.buildRunId, getCorrelation()!.buildRunId);
    });
  });
});
