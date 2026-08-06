-- Migration 161: did the repair actually work?
--
-- The system has never been able to answer that. `ai_eval_log` (080) records
-- whether the HTTP call to the model returned - not whether the code it wrote
-- ran. `health_findings` (075) records only errors that SURVIVED a fix, so a
-- successful repair leaves no trace at all. `autofix-ledger` computes a good
-- normalised error identity and then writes it to localStorage, per browser,
-- cleared whenever the code changes. Nothing crosses a project boundary.
--
-- The consequence is visible in the code: `learned-rules.ts` can only ever emit
-- one of seven paragraphs somebody typed by hand, because there is no data for
-- it to learn anything else from. This table is the missing input.
--
-- THREE DESIGN CHOICES WORTH THE WORDS:
--
-- 1. SETS, NOT COUNTS. `resolved` / `introduced` / `remaining` hold fingerprint
--    arrays, not totals. A round that fixes one error and creates another leaves
--    the count unchanged while having made things strictly worse - and that exact
--    ratchet is what turned one bad model write into a dead project in production.
--    A count-based label would have recorded it as neutral and taught the system
--    nothing, or worse, that the repair was fine.
--
-- 2. APPEND, NOT AGGREGATE. Unlike app_error_events (158), the writers here are
--    our own server-side repair loops, at most a handful of rows per generation
--    turn - not anonymous visitors who can fire thousands a second. Keeping each
--    attempt lets us ask questions aggregation forecloses: does model X fix
--    fingerprint Y more reliably than model Z, does round 2 ever succeed where
--    round 1 failed, has a failure become more common since a prompt change.
--
-- 3. WRITES ARE SERVICE-ROLE ONLY. There is deliberately no INSERT policy. Only
--    the repair loops write here, always through the admin client, so a client
--    cannot fabricate outcome data - which would poison the signal that later
--    decides what goes into a system prompt.

CREATE TABLE IF NOT EXISTS public.repair_outcomes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- Which loop produced this: 'autofix' (http/fix.ts, user-triggered or error
  -- bridge), 'self_verify' (post-build rounds), 'build' (generation-time repair).
  stage TEXT NOT NULL,
  -- Round number within that stage, 1-based. Lets us ask whether later rounds
  -- ever help, which decides whether maxRounds is worth its latency and spend.
  round INT NOT NULL DEFAULT 1,
  model TEXT,

  -- Where the labels came from: 'typecheck' is objective and cheap; 'runtime'
  -- depends on which routes a render happened to reach; 'validation' is our own
  -- regex approximation. Never compare success rates across sources without
  -- filtering on this - they are not measuring the same thing.
  signal TEXT NOT NULL,

  -- Fingerprints, from src/lib/ai/failure-fingerprint.ts.
  before_fingerprints TEXT[] NOT NULL DEFAULT '{}',
  resolved TEXT[] NOT NULL DEFAULT '{}',
  introduced TEXT[] NOT NULL DEFAULT '{}',
  remaining TEXT[] NOT NULL DEFAULT '{}',

  -- Human-readable sample so a dashboard row means something without a join to
  -- a fingerprint dictionary we do not have yet. Truncated by the writer.
  sample_label TEXT,

  -- Files the attempt actually wrote, after the write guard rejected any it
  -- refused. Empty when every proposed write was rejected - itself a useful
  -- signal, and one that is otherwise invisible.
  files_written TEXT[] NOT NULL DEFAULT '{}',
  files_rejected TEXT[] NOT NULL DEFAULT '{}',

  duration_ms INT,

  -- Denormalised for the common query "what is failing lately", so the dashboard
  -- does not have to unnest arrays to count the obvious.
  fully_resolved BOOLEAN NOT NULL DEFAULT false,
  made_worse BOOLEAN NOT NULL DEFAULT false
);

-- "What is failing most often, recently" - the query that drives both the
-- dashboard and the cross-project prompt rules.
CREATE INDEX IF NOT EXISTS repair_outcomes_recent_idx
  ON public.repair_outcomes (created_at DESC);

-- Per-project history, for the existing per-project learned-rules path.
CREATE INDEX IF NOT EXISTS repair_outcomes_project_idx
  ON public.repair_outcomes (project_id, created_at DESC);

-- "Which repairs make things worse" - rare rows, worth finding fast.
CREATE INDEX IF NOT EXISTS repair_outcomes_worse_idx
  ON public.repair_outcomes (created_at DESC)
  WHERE made_worse;

-- Fingerprint lookup across projects. GIN over the arrays, because the question
-- is always "which attempts touched fingerprint X".
CREATE INDEX IF NOT EXISTS repair_outcomes_before_gin
  ON public.repair_outcomes USING GIN (before_fingerprints);

ALTER TABLE public.repair_outcomes ENABLE ROW LEVEL SECURITY;

-- Owners can read their own project's repair history; nobody can write from a
-- client session. Service-role bypasses RLS entirely, which is how the loops
-- write.
DROP POLICY IF EXISTS repair_outcomes_select_own ON public.repair_outcomes;
CREATE POLICY repair_outcomes_select_own ON public.repair_outcomes
  FOR SELECT
  USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

COMMENT ON TABLE public.repair_outcomes IS
  'One row per repair attempt, labelled by fingerprint sets. The input to any system that learns which failures recur and which fixes actually work.';
