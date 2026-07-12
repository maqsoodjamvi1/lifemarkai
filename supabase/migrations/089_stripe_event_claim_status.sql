-- Migration 089: record webhook claim/completion state for reconciliation.

ALTER TABLE public.stripe_events
  ADD COLUMN IF NOT EXISTS status TEXT NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS last_error TEXT;

UPDATE public.stripe_events
   SET status = 'completed',
       completed_at = COALESCE(completed_at, processed_at),
       claimed_at = COALESCE(claimed_at, processed_at)
 WHERE status IS DISTINCT FROM 'completed'
    OR completed_at IS NULL;

ALTER TABLE public.stripe_events
  ALTER COLUMN status SET DEFAULT 'processing';

ALTER TABLE public.stripe_events
  DROP CONSTRAINT IF EXISTS stripe_events_status_check;
ALTER TABLE public.stripe_events
  ADD CONSTRAINT stripe_events_status_check
  CHECK (status IN ('processing', 'completed', 'failed'));

REVOKE ALL ON TABLE public.stripe_events FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.stripe_events TO service_role;

COMMENT ON COLUMN public.stripe_events.status IS
  'Atomic claim state. Failed/processing events are never replayed automatically; reconcile manually to avoid duplicate financial mutations.';
