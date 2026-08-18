-- 175_build_runs.sql
-- Phase 6 of the Vercel adoption plan: durable build runs.
--
-- A build today lives inside one SSE request: close the browser and the run's
-- history is gone, reconnecting shows nothing, and a retried step could redo
-- paid work. These tables give a build an existence independent of any HTTP
-- connection:
--
--   build_runs        one row per user-visible build (id = the Phase 0
--                     buildRunId, run_…), with the plan's full field list.
--   build_run_events  the SSE event log. The browser replays events after its
--                     last seen id on reconnect — closing the laptop no longer
--                     loses the build.
--   build_run_steps   step ledger with UNIQUE(run_id, step_key): a replayed
--                     step finds its stored result instead of executing twice.
--                     This is the no-duplicate-files/-migrations/-charges
--                     guarantee, enforced by the database, not by discipline.
--
-- Credit idempotency: reservation/finalization keys are UNIQUE columns on
-- build_runs, so "reserve twice" and "finalize twice" are constraint
-- violations, not silent double-charges.

CREATE TABLE IF NOT EXISTS public.build_runs (
  id                     TEXT PRIMARY KEY CHECK (id ~ '^run_[A-Za-z0-9_-]+$'),
  project_id             UUID NOT NULL,
  user_id                UUID NOT NULL,
  mode                   TEXT NOT NULL CHECK (mode IN ('agent', 'build', 'patch', 'chat')),
  status                 TEXT NOT NULL DEFAULT 'running'
                         CHECK (status IN ('running', 'completed', 'failed', 'cancelled')),
  workflow_provider      TEXT NOT NULL DEFAULT 'in-request',   -- 'in-request' | 'vercel-workflow'
  workflow_run_id        TEXT,
  sandbox_provider       TEXT,
  ai_gateway_provider    TEXT,
  model                  TEXT,
  credits_reserved       NUMERIC(12,4),
  credits_finalized      NUMERIC(12,4),
  credit_reservation_key TEXT UNIQUE,
  credit_finalization_key TEXT UNIQUE,
  candidate_version      INTEGER,
  verification_passed    BOOLEAN,
  failure_code           TEXT,
  started_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at           TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS build_runs_project_idx ON public.build_runs (project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS build_runs_user_idx    ON public.build_runs (user_id, started_at DESC);
-- Watchdog query: runs that never reached a terminal state.
CREATE INDEX IF NOT EXISTS build_runs_running_idx ON public.build_runs (started_at)
  WHERE status = 'running';

CREATE TABLE IF NOT EXISTS public.build_run_events (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id     TEXT NOT NULL REFERENCES public.build_runs(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  payload    JSONB NOT NULL
);
-- Replay cursor: "events for this run after id N, in order".
CREATE INDEX IF NOT EXISTS build_run_events_run_idx ON public.build_run_events (run_id, id);

CREATE TABLE IF NOT EXISTS public.build_run_steps (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  run_id       TEXT NOT NULL REFERENCES public.build_runs(id) ON DELETE CASCADE,
  step_key     TEXT NOT NULL,
  status       TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'failed')),
  result       JSONB,
  error        TEXT,
  started_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- THE idempotency guarantee: one execution record per (run, step), enforced
  -- by the database. A replay INSERTs, hits 23505, and reads the stored result.
  CONSTRAINT build_run_steps_unique UNIQUE (run_id, step_key)
);

ALTER TABLE public.build_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_run_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.build_run_steps   ENABLE ROW LEVEL SECURITY;

-- Owners may read their runs and events (reconnect/replay path uses the user's
-- own session); writes go through the service role only.
DROP POLICY IF EXISTS build_runs_select_own ON public.build_runs;
CREATE POLICY build_runs_select_own ON public.build_runs
  FOR SELECT USING (auth.uid() = user_id);
DROP POLICY IF EXISTS build_run_events_select_own ON public.build_run_events;
CREATE POLICY build_run_events_select_own ON public.build_run_events
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.build_runs r WHERE r.id = run_id AND r.user_id = auth.uid()
  ));
DROP POLICY IF EXISTS build_run_steps_select_own ON public.build_run_steps;
CREATE POLICY build_run_steps_select_own ON public.build_run_steps
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.build_runs r WHERE r.id = run_id AND r.user_id = auth.uid()
  ));

COMMENT ON TABLE public.build_runs IS
  'Phase 6 durable build runs: one row per user-visible build, id = Phase 0 buildRunId. Events + steps give reconnect/replay and DB-enforced idempotency.';
