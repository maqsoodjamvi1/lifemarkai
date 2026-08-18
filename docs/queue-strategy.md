# Background-work strategy — Phase 8 of the Vercel adoption plan

## Inventory (what runs in the background today, and where it should live)

| Workload | Today | Recommended mechanism |
| --- | --- | --- |
| Multi-step Agent build | in-request SSE | durable build run (Phase 6) → Workflow when adopted |
| Supabase provisioning | in-request (`/api/cloud/provision`) | durable steps (Phase 6 runner) |
| Snapshot restore | in-request | durable steps |
| Deploy job | BullMQ `lifemarkai:deploy` (Redis-gated) | Queue |
| Notification delivery | BullMQ `lifemarkai:notification` | Queue (first Vercel Queues migration candidate — lowest risk) |
| Email delivery (resend.ts) | inline await | Queue |
| Usage aggregation / cloud billing | cron route `/api/cron/*` + `/api/cloud/bill-usage` | Cron → Queue |
| Evaluation logging (eval-log.ts) | fire-and-forget insert | waitUntil-style defer (Phase 9) |
| Stripe webhook follow-ups (emails, domain purchase) | inline in webhook | Queue — but the core subscription state write stays synchronous, the webhook must not 200 before durable state exists |
| Sandbox cleanup | cron route `/api/cron/sandbox-cleanup` | Cron |
| Real-time user response | Function/SSE | stays in-request, never queued |

Rule from the plan: **do not run BullMQ and Vercel Queues indefinitely for the
same workload** — migrate a workload wholesale after its dedup ledger is in
place, and keep `VERCEL_QUEUE_ENABLED=false` as the instant route-back for NEW
messages (already-enqueued Vercel messages must be drained, not abandoned).

## The invariant that makes migration safe: the dedup ledger

Migration 176 (`job_executions`) + `runJobOnce()` (src/lib/queue/idempotency.ts)
give every consumer at-least-once safety that lives in Postgres, not in either
queue's semantics:

- claim = PK insert on (consumer, idempotency_key) → duplicate delivery loses
  the insert and skips, whatever queue delivered it;
- only SUCCESS is permanent — failed runs retry under the queue's own
  backoff policy (BullMQ: 3 attempts, exponential 2s — already configured);
- a claim stuck in 'processing' past its deadline is crash leftovers and is
  reclaimed on the next delivery;
- `queue_backend` is recorded per execution, so during a migration the same
  ledger shows both backends' volume and failure rates side by side.

Every consumer must pass a REAL idempotency key derived from the work item
(`deploy:${deploymentId}`, `email:welcome:${userId}`), never a random value —
a random key defeats the ledger by construction.

## Requirements checklist for any new queue consumer

Idempotency key on every message; `runJobOnce()` around all side effects;
max-retry + exponential backoff configured on the queue; terminal-failure
visibility (the 'failed' ledger rows ARE the dead-letter view: `SELECT * FROM
job_executions WHERE status='failed'`); structured failure logging via
`recordEvent`; per-project concurrency limits where the work touches a
sandbox or deploy target.
