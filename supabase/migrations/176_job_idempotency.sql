-- 176_job_idempotency.sql
-- Phase 8 of the Vercel adoption plan: make duplicate delivery harmless.
--
-- Both BullMQ (at-least-once on retry) and Vercel Queues (at-least-once by
-- contract) can deliver a message twice. The plan's acceptance criterion is
-- "duplicate delivery is harmless" — which requires a dedup ledger OUTSIDE the
-- queue, because the queue is exactly the thing being swapped.
--
-- One row per (consumer, idempotency key). A handler claims its key before
-- doing side effects; the second delivery loses the PK insert and skips.
-- Same pattern as stripe_events (migration 089), generalised to every queue
-- consumer so both queue backends share one dedup story.

CREATE TABLE IF NOT EXISTS public.job_executions (
  consumer     TEXT NOT NULL,          -- e.g. 'deploy-processor', 'usage-aggregator'
  idempotency_key TEXT NOT NULL,       -- e.g. 'deploy:dep_abc123'
  status       TEXT NOT NULL DEFAULT 'processing'
               CHECK (status IN ('processing', 'completed', 'failed')),
  attempts     INTEGER NOT NULL DEFAULT 1,
  queue_backend TEXT,                  -- 'bullmq' | 'vercel-queues' (comparison datum)
  claimed_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ,
  error        TEXT,
  PRIMARY KEY (consumer, idempotency_key)
);

-- Stuck-job sweep: 'processing' rows older than the consumer's max runtime are
-- crash leftovers; the sweeper (or a manual query) can requeue or fail them.
CREATE INDEX IF NOT EXISTS job_executions_stuck_idx
  ON public.job_executions (claimed_at)
  WHERE status = 'processing';

ALTER TABLE public.job_executions ENABLE ROW LEVEL SECURITY;
-- Service-role only: queue consumers run server-side.

COMMENT ON TABLE public.job_executions IS
  'Phase 8 queue-consumer dedup ledger: one row per (consumer, idempotency key). Makes at-least-once delivery harmless for BullMQ today and Vercel Queues later.';
