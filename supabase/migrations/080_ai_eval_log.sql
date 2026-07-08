-- 080_ai_eval_log.sql
-- Lightweight, self-hosted AI observability (no external eval vendor / no Braintrust).
-- One row per generateAI() call: model, latency, token usage, outcome. Lets us see
-- regressions when model tiers change in lib/ai/model-defaults.ts without shipping blind.

CREATE TABLE IF NOT EXISTS public.ai_eval_log (
  id           BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  user_id      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  project_id   UUID,
  model        TEXT NOT NULL,
  task         TEXT,
  latency_ms   INTEGER,
  tokens_used  INTEGER,
  tool_calls   INTEGER NOT NULL DEFAULT 0,
  success      BOOLEAN NOT NULL DEFAULT TRUE,
  error        TEXT,
  via_gateway  BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS ai_eval_log_created_idx ON public.ai_eval_log (created_at DESC);
CREATE INDEX IF NOT EXISTS ai_eval_log_project_idx ON public.ai_eval_log (project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS ai_eval_log_model_idx   ON public.ai_eval_log (model, created_at DESC);

ALTER TABLE public.ai_eval_log ENABLE ROW LEVEL SECURITY;

-- Users may read their own telemetry rows; inserts happen via service role only
-- (lib/ai/eval-log.ts), which bypasses RLS.
DROP POLICY IF EXISTS ai_eval_log_select_own ON public.ai_eval_log;
CREATE POLICY ai_eval_log_select_own ON public.ai_eval_log
  FOR SELECT USING (auth.uid() = user_id);

COMMENT ON TABLE public.ai_eval_log IS
  'Self-hosted AI observability: one row per generateAI call (model, latency, tokens, outcome). Written by lib/ai/eval-log.ts via service role.';
