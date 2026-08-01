-- Migration 158: visitor error telemetry for PUBLISHED apps.
--
-- preview_telemetry (094) covers the editor preview: authenticated, one row per
-- project, written by the owner's own browser. This is the opposite situation -
-- the writers are anonymous visitors of a published app, on a domain we do not
-- control, with no session. That changes three things:
--
-- 1. AGGREGATED, NOT APPENDED. One row per (project, fingerprint) with a counter,
--    not one row per occurrence. A single broken render loop can fire thousands of
--    errors a second; appending would let one visitor write unbounded rows into a
--    table nobody is paying attention to. Aggregation turns that into an UPDATE of
--    one counter, which is both cheaper and a natural abuse ceiling.
--
-- 2. WRITES ARE SERVICE-ROLE ONLY. There is deliberately no INSERT policy for
--    anon/authenticated. The public endpoint validates the project is genuinely
--    published, caps the payload, and writes with the admin client. Opening RLS to
--    anon INSERT would let anyone write rows for any project id they can guess.
--
-- 3. NO PII, ENFORCED BY SHAPE. There is no column for user id, email, IP, cookies
--    or full URL. The route strips query strings before writing; not storing the
--    field at all is a stronger guarantee than remembering to scrub it, because a
--    future contributor cannot accidentally start populating a column that does not
--    exist.

CREATE TABLE IF NOT EXISTS public.app_error_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,

  -- Stable grouping key: hash of (message + first stack frame), computed by the
  -- route. Groups "the same bug" across visitors without storing anything
  -- identifying about who hit it.
  fingerprint TEXT NOT NULL,

  message TEXT NOT NULL,
  -- Truncated by the route. Kept for debugging; capped so one visitor cannot
  -- write a megabyte per error.
  stack TEXT,
  -- PATH ONLY - the route strips the query string. Published apps put ids and
  -- tokens in query params.
  path TEXT,
  -- Coarse bucket ("Chrome", "Safari", "Firefox", "other") rather than the raw
  -- user agent string, which is a fingerprinting vector.
  browser TEXT,

  occurrences INTEGER NOT NULL DEFAULT 1,
  first_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,

  CONSTRAINT app_error_events_unique_group UNIQUE (project_id, fingerprint),
  CONSTRAINT app_error_events_message_len CHECK (char_length(message) <= 500),
  CONSTRAINT app_error_events_stack_len CHECK (stack IS NULL OR char_length(stack) <= 2000),
  CONSTRAINT app_error_events_path_len CHECK (path IS NULL OR char_length(path) <= 300)
);

CREATE INDEX IF NOT EXISTS idx_app_error_events_project_last_seen
  ON public.app_error_events (project_id, last_seen DESC);

-- Unresolved-first is the query the UI actually runs.
CREATE INDEX IF NOT EXISTS idx_app_error_events_unresolved
  ON public.app_error_events (project_id, resolved_at) WHERE resolved_at IS NULL;

ALTER TABLE public.app_error_events ENABLE ROW LEVEL SECURITY;

-- Owners and collaborators read. Deliberately no INSERT/UPDATE policy for anon or
-- authenticated: the public ingest endpoint uses the service role after validating
-- that the project is published.
DROP POLICY IF EXISTS "app_error_events_select" ON public.app_error_events;
CREATE POLICY "app_error_events_select" ON public.app_error_events
  FOR SELECT USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    OR project_id IN (
      SELECT project_id FROM public.collaborators
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
    )
  );

-- Owners/editors may resolve (and delete) their own groups.
DROP POLICY IF EXISTS "app_error_events_write" ON public.app_error_events;
CREATE POLICY "app_error_events_write" ON public.app_error_events
  FOR UPDATE USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
    OR project_id IN (
      SELECT project_id FROM public.collaborators
      WHERE user_id = auth.uid() AND accepted_at IS NOT NULL AND role IN ('owner','editor')
    )
  );

DROP POLICY IF EXISTS "app_error_events_delete" ON public.app_error_events;
CREATE POLICY "app_error_events_delete" ON public.app_error_events
  FOR DELETE USING (
    project_id IN (SELECT id FROM public.projects WHERE user_id = auth.uid())
  );

-- Record-or-increment in one statement.
--
-- SECURITY DEFINER with a fixed search_path: the endpoint is public, so this must
-- not be hijackable by a mutable search_path. It takes no user identity and cannot
-- read anything - it only upserts a counter.
--
-- The distinct-group cap is the real abuse control. Occurrences of a KNOWN error
-- are just an increment, so they are cheap and effectively unbounded; but a visitor
-- generating randomised messages would otherwise create a new row every time. Past
-- the cap new groups are dropped and only existing ones increment, so the table can
-- never exceed a bounded size per project.
CREATE OR REPLACE FUNCTION public.record_app_error(
  p_project_id UUID,
  p_fingerprint TEXT,
  p_message TEXT,
  p_stack TEXT,
  p_path TEXT,
  p_browser TEXT
) RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_groups INTEGER;
  v_cap CONSTANT INTEGER := 200;
BEGIN
  UPDATE public.app_error_events
     SET occurrences = occurrences + 1,
         last_seen = NOW(),
         -- A previously resolved error recurring is news: surface it again.
         resolved_at = NULL
   WHERE project_id = p_project_id AND fingerprint = p_fingerprint;

  IF FOUND THEN
    RETURN 'incremented';
  END IF;

  SELECT COUNT(*) INTO v_groups
    FROM public.app_error_events WHERE project_id = p_project_id;

  IF v_groups >= v_cap THEN
    RETURN 'capped';
  END IF;

  INSERT INTO public.app_error_events
    (project_id, fingerprint, message, stack, path, browser)
  VALUES
    (p_project_id, p_fingerprint, p_message, p_stack, p_path, p_browser)
  ON CONFLICT (project_id, fingerprint) DO UPDATE
    SET occurrences = public.app_error_events.occurrences + 1,
        last_seen = NOW();

  RETURN 'created';
END;
$$;

REVOKE ALL ON FUNCTION public.record_app_error(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_app_error(UUID, TEXT, TEXT, TEXT, TEXT, TEXT) TO service_role;
