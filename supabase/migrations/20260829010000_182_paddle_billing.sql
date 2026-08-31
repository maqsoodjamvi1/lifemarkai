-- Migration 182: Paddle as a second billing provider (parity gap vs Lovable,
-- which uses Paddle as merchant-of-record for global tax/VAT handling).
--
-- Mirrors the existing Stripe billing plumbing exactly:
--   - profiles.stripe_customer_id / stripe_subscription_id -> profiles.paddle_customer_id / paddle_subscription_id
--   - stripe_events (060_stripe_events.sql + 089_stripe_event_claim_status.sql) -> paddle_events
--
-- Additive and optional: these columns/table are unused unless PADDLE_API_KEY
-- is configured (see src/lib/paddle/client.ts's isPaddleConfigured()). No
-- existing Stripe behavior changes.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS paddle_customer_id TEXT,
  ADD COLUMN IF NOT EXISTS paddle_subscription_id TEXT;

CREATE TABLE IF NOT EXISTS public.paddle_events (
  id           TEXT PRIMARY KEY,          -- Paddle event id (evt_...)
  type         TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed', 'failed')),
  claimed_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_error   TEXT
);

-- Service-role only — never exposed to clients, same as stripe_events.
ALTER TABLE public.paddle_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.paddle_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.paddle_events TO service_role;

COMMENT ON COLUMN public.paddle_events.status IS
  'Atomic claim state, same idempotency pattern as stripe_events.status. Failed/processing events are never replayed automatically; reconcile manually to avoid duplicate financial mutations.';

COMMENT ON COLUMN public.profiles.paddle_customer_id IS
  'Paddle customer id (ctm_...) for users who subscribed via Paddle instead of Stripe. A profile has at most one active billing provider at a time.';
COMMENT ON COLUMN public.profiles.paddle_subscription_id IS
  'Paddle subscription id (sub_...) mirroring stripe_subscription_id.';
