-- 173_ai_eval_log_correlation.sql
-- Phase 1 of the Vercel adoption plan: make ai_eval_log rows joinable to builds.
--
-- Phase 0 gave every request a requestId and every build a buildRunId, but the
-- eval log had no columns for them — AI rows could only be tied to a build by
-- grepping timestamps in server logs. With these two columns, "which model
-- calls did failing build X make, and what did they cost?" is one SQL query.
--
-- TEXT, not UUID: the ids are prefixed opaque strings (req_…, run_…) minted by
-- src/lib/observability/correlation.ts.

ALTER TABLE public.ai_eval_log
  ADD COLUMN IF NOT EXISTS request_id   TEXT,
  ADD COLUMN IF NOT EXISTS build_run_id TEXT;

-- Only the build join needs an index; request_id is a debugging aid read via
-- the build index or recent-rows scans. Partial: most historical rows are NULL.
CREATE INDEX IF NOT EXISTS ai_eval_log_build_run_idx
  ON public.ai_eval_log (build_run_id, created_at DESC)
  WHERE build_run_id IS NOT NULL;

COMMENT ON COLUMN public.ai_eval_log.request_id   IS 'Correlation id of the HTTP request that made this AI call (req_…).';
COMMENT ON COLUMN public.ai_eval_log.build_run_id IS 'Correlation id of the user-visible build this call belonged to (run_…).';
