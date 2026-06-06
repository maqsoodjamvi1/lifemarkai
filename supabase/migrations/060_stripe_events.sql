-- Migration 060: dedicated Stripe webhook idempotency table
--
-- The webhook previously recorded processed events by inserting a row into
-- credit_logs with a sentinel user_id of 00000000-0000-0000-0000-000000000000.
-- credit_logs.user_id has a NOT NULL FK to profiles(id), so that insert failed
-- on every event (swallowed by .catch) — meaning the idempotency guard never
-- recorded anything and Stripe retries could double-credit users.

CREATE TABLE IF NOT EXISTS stripe_events (
  id           TEXT PRIMARY KEY,          -- Stripe event id (evt_...)
  type         TEXT NOT NULL,
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Service-role only — never exposed to clients.
ALTER TABLE stripe_events ENABLE ROW LEVEL SECURITY;
