import { describe,it,beforeEach } from "node:test";
import assert from "node:assert/strict";

import { runJobOnce } from "./idempotency.ts";

/** Fake enforcing the PK(consumer, idempotency_key) from migration 176. */
function fakeLedger() {
  const rows = new Map<string, Record<string, unknown>>();
  const key = (c: unknown, k: unknown) => `${c}:${k}`;
  const client = {
    from() {
      let filters: Record<string, unknown> = {};
      const chain = {
        insert(row: Record<string, unknown>) {
          return {
            then(resolve: (v: { error: { code?: string; message: string } | null }) => void) {
              const k = key(row.consumer, row.idempotency_key);
              if (rows.has(k)) return resolve({ error: { code: "23505", message: "dup" } });
              rows.set(k, { ...row, claimed_at: new Date().toISOString(), attempts: 1 });
              return resolve({ error: null });
            },
          };
        },
        update(patch: Record<string, unknown>) {
          filters = {};
          const upd = {
            eq(col: string, val: unknown) {
              filters[col] = val;
              return upd;
            },
            then(resolve: (v: { error: null }) => void) {
              const k = key(filters.consumer, filters.idempotency_key);
              const row = rows.get(k);
              if (row) Object.assign(row, patch);
              return resolve({ error: null });
            },
          };
          return upd;
        },
        select() {
          filters = {};
          const sel = {
            eq(col: string, val: unknown) {
              filters[col] = val;
              return sel;
            },
            maybeSingle() {
              return {
                then(resolve: (v: { data: Record<string, unknown> | null }) => void) {
                  const k = key(filters.consumer, filters.idempotency_key);
                  return resolve({ data: rows.get(k) ?? null });
                },
              };
            },
          };
          return sel;
        },
      };
      return chain;
    },
  };
  return { client, rows };
}

describe("runJobOnce — duplicate delivery is harmless", () => {
  let ledger: ReturnType<typeof fakeLedger>;
  beforeEach(() => (ledger = fakeLedger()));

  it("runs the first delivery and skips the second", async () => {
    let effects = 0;
    const claim = { consumer: "deploy-processor", idempotencyKey: "deploy:dep_1" };
    const first = await runJobOnce(ledger.client, claim, async () => ++effects);
    const second = await runJobOnce(ledger.client, claim, async () => ++effects);
    assert.deepEqual(first, { ran: true, result: 1 });
    assert.deepEqual(second, { ran: false, skipped: "duplicate" });
    assert.equal(effects, 1);
  });

  it("the same key under DIFFERENT consumers runs independently", async () => {
    let effects = 0;
    await runJobOnce(ledger.client, { consumer: "a", idempotencyKey: "k" }, async () => ++effects);
    await runJobOnce(ledger.client, { consumer: "b", idempotencyKey: "k" }, async () => ++effects);
    assert.equal(effects, 2);
  });

  it("a FAILED run is retryable and records the attempt count", async () => {
    const claim = { consumer: "email", idempotencyKey: "welcome:u1" };
    let attempts = 0;
    const flaky = async () => {
      attempts++;
      if (attempts === 1) throw new Error("resend 500");
      return "sent";
    };
    await assert.rejects(() => runJobOnce(ledger.client, claim, flaky), /resend 500/);
    const retry = await runJobOnce(ledger.client, claim, flaky);
    assert.deepEqual(retry, { ran: true, result: "sent" });
    assert.equal(ledger.rows.get("email:welcome:u1")!.attempts, 2);
  });

  it("an in-flight claim is not re-run before its deadline", async () => {
    const claim = { consumer: "billing", idempotencyKey: "cycle:2026-08" };
    // First claim, never completed (simulated crash mid-run).
    await ledger.client.from().insert({ consumer: "billing", idempotency_key: "cycle:2026-08", status: "processing" });
    const outcome = await runJobOnce(ledger.client, claim, async () => "should not run");
    assert.deepEqual(outcome, { ran: false, skipped: "in-flight" });
  });

  it("a crashed claim past its deadline is reclaimed", async () => {
    const claim = { consumer: "billing", idempotencyKey: "cycle:2026-07", staleAfterMs: 10 };
    await ledger.client.from().insert({ consumer: "billing", idempotency_key: "cycle:2026-07", status: "processing" });
    ledger.rows.get("billing:cycle:2026-07")!.claimed_at = new Date(Date.now() - 60_000).toISOString();
    const outcome = await runJobOnce(ledger.client, claim, async () => "recovered");
    assert.deepEqual(outcome, { ran: true, result: "recovered" });
  });
});
