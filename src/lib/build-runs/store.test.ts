import { describe,it,beforeEach } from "node:test";
import assert from "node:assert/strict";

import { BuildRunStore,type SupabaseLike } from "./store.ts";

/**
 * In-memory fake enforcing exactly the constraints migration 175 declares:
 * UNIQUE(run_id, step_key) on steps, PK on build_runs.id, and finishRun's
 * conditional update (only status='running' rows move).
 */
function fakeSupabase() {
  const runs = new Map<string, Record<string, unknown>>();
  const steps = new Map<string, Record<string, unknown>>();
  const events: Array<{ id: number; run_id: string; payload: unknown }> = [];
  let nextEventId = 1;

  const client: SupabaseLike = {
    from(table: string) {
      return {
        insert: (row: Record<string, unknown>) => ({
          then(resolve: (value: { error: { code?: string; message: string } | null }) => void) {
            if (table === "build_runs") {
              const id = row.id as string;
              if (runs.has(id)) return resolve({ error: { code: "23505", message: "duplicate run" } });
              runs.set(id, { ...row });
              return resolve({ error: null });
            }
            if (table === "build_run_steps") {
              const key = `${row.run_id}:${row.step_key}`;
              if (steps.has(key) ) return resolve({ error: { code: "23505", message: "duplicate step" } });
              steps.set(key, { ...row });
              return resolve({ error: null });
            }
            if (table === "build_run_events") {
              events.push({ id: nextEventId++, run_id: row.run_id as string, payload: row.payload });
              return resolve({ error: null });
            }
            return resolve({ error: { message: `unknown table ${table}` } });
          },
        }) as never,
        update: (patch: Record<string, unknown>) => ({
          eq: (c1: string, v1: unknown) => ({
            eq: (c2: string, v2: unknown) => ({
              then(resolve: (value: { error: { message: string } | null }) => void) {
                for (const run of runs.values()) {
                  if (run[c1] === v1 && run[c2] === v2) Object.assign(run, patch);
                }
                return resolve({ error: null });
              },
            }) as never,
          }),
        }),
        select: () => ({
          eq: (c1: string, v1: unknown) => ({
            eq: (c2: string, v2: unknown) => ({
              maybeSingle: () => ({
                then(resolve: (value: { data: Record<string, unknown> | null; error: null }) => void) {
                  if (table === "build_run_steps") {
                    const key = `${v1}:${v2}`;
                    return resolve({ data: steps.get(key) ?? null, error: null });
                  }
                  return resolve({ data: null, error: null });
                },
              }) as never,
            }),
            gt: (_c: string, after: unknown) => ({
              order: () => ({
                limit: (count: number) => ({
                  then(resolve: (value: { data: Array<Record<string, unknown>>; error: null }) => void) {
                    const rows = events
                      .filter((e) => e.run_id === v1 && e.id > (after as number))
                      .slice(0, count)
                      .map((e) => ({ id: e.id, payload: e.payload }));
                    return resolve({ data: rows, error: null });
                  },
                }) as never,
              }),
            }),
          }),
        }),
      } as never;
    },
  };
  return { client, runs, steps, events };
}

describe("BuildRunStore.runStep — the exactly-once guarantee", () => {
  let fake: ReturnType<typeof fakeSupabase>;
  let store: BuildRunStore;
  beforeEach(() => {
    fake = fakeSupabase();
    store = new BuildRunStore(fake.client);
  });

  it("executes once, then replays return the STORED result without executing", async () => {
    let executions = 0;
    const fn = async () => {
      executions++;
      return { generated: 42 };
    };
    const first = await store.runStep("run_a", "generate", fn);
    const second = await store.runStep("run_a", "generate", fn);
    const third = await store.runStep("run_a", "generate", fn);
    assert.equal(executions, 1);
    assert.deepEqual(first, { generated: 42 });
    assert.deepEqual(second, { generated: 42 });
    assert.deepEqual(third, { generated: 42 });
  });

  it("the same stepKey in DIFFERENT runs executes independently", async () => {
    let executions = 0;
    const fn = async () => ++executions;
    await store.runStep("run_a", "reserve-credits", fn);
    await store.runStep("run_b", "reserve-credits", fn);
    assert.equal(executions, 2);
  });

  it("a step that threw is retryable (only success is permanent)", async () => {
    let attempts = 0;
    const flaky = async () => {
      attempts++;
      if (attempts === 1) throw new Error("provider 500");
      return "ok";
    };
    await assert.rejects(() => store.runStep("run_a", "verify", flaky), /provider 500/);
    const result = await store.runStep("run_a", "verify", flaky);
    assert.equal(result, "ok");
    assert.equal(attempts, 2);
  });

  it("a lost insert race returns the winner's result", async () => {
    // Simulate the loser: the step row appears between readStep and insert.
    let executions = 0;
    const fn = async () => {
      executions++;
      if (executions === 1) {
        // Winner sneaks in while our fn is running.
        fake.steps.set("run_a:publish", { run_id: "run_a", step_key: "publish", status: "completed", result: "winner" });
      }
      return "loser";
    };
    const result = await store.runStep("run_a", "publish", fn);
    assert.equal(result, "winner");
  });
});

describe("BuildRunStore lifecycle", () => {
  it("startRun is idempotent and finishRun fires exactly once", async () => {
    const fake = fakeSupabase();
    const store = new BuildRunStore(fake.client);
    const input = { runId: "run_x", projectId: "p", userId: "u", mode: "agent" as const };
    await store.startRun(input);
    await store.startRun(input); // replay — silently absorbed
    assert.equal(fake.runs.size, 1);

    await store.finishRun({ runId: "run_x", status: "completed", verificationPassed: true });
    assert.equal(fake.runs.get("run_x")!.status, "completed");

    // A late crash-handler trying to flip the terminal state loses the
    // conditional update (status is no longer 'running').
    await store.finishRun({ runId: "run_x", status: "failed", failureCode: "late" });
    assert.equal(fake.runs.get("run_x")!.status, "completed");
    assert.equal(fake.runs.get("run_x")!.failure_code, undefined);
  });

  it("appendEvent + eventsAfter replay in order from a cursor", async () => {
    const fake = fakeSupabase();
    const store = new BuildRunStore(fake.client);
    store.appendEvent("run_e", { step: 1 });
    store.appendEvent("run_e", { step: 2 });
    store.appendEvent("run_other", { step: "x" });
    store.appendEvent("run_e", { step: 3 });
    await new Promise((r) => setTimeout(r, 10)); // fire-and-forget settles

    const all = await store.eventsAfter("run_e", 0);
    assert.deepEqual(all.map((e) => (e.payload as { step: number }).step), [1, 2, 3]);

    const after = await store.eventsAfter("run_e", all[1].id);
    assert.deepEqual(after.map((e) => (e.payload as { step: number }).step), [3]);
  });
});
