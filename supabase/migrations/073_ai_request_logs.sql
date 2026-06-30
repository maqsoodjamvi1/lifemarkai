-- ── Migration 073: in-app AI proxy request logs ──────────────────────────────
-- Per-request activity for /api/projects/[id]/ai-proxy so the AI Integration
-- panel can show recent calls (status, capability, model, cost, duration) —
-- parity with Lovable's per-project AI activity view. Inserts are written by the
-- proxy via the admin client (so public/unauthenticated app calls are still
-- logged); reads are RLS-gated to project owners and collaborators.

CREATE TABLE IF NOT EXISTS ai_request_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  capability  text NOT NULL,
  model       text,
  status      text NOT NULL DEFAULT 'success',  -- 'success' | 'error'
  tokens_used int  NOT NULL DEFAULT 0,
  cost        numeric(8,2) NOT NULL DEFAULT 0,
  duration_ms int  NOT NULL DEFAULT 0,
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_request_logs_project_created
  ON ai_request_logs (project_id, created_at DESC);

ALTER TABLE ai_request_logs ENABLE ROW LEVEL SECURITY;

-- Project owners and collaborators can read their project's AI activity.
DROP POLICY IF EXISTS "ai_request_logs_select" ON ai_request_logs;
CREATE POLICY "ai_request_logs_select" ON ai_request_logs
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM projects p WHERE p.id = ai_request_logs.project_id AND p.user_id = auth.uid())
    OR EXISTS (SELECT 1 FROM collaborators c WHERE c.project_id = ai_request_logs.project_id AND c.user_id = auth.uid())
  );

COMMENT ON TABLE ai_request_logs IS
  'Per-request activity for the in-app AI proxy (chat/image/embedding/tts/stt). Written server-side via admin client; read RLS-gated to owners/collaborators.';
