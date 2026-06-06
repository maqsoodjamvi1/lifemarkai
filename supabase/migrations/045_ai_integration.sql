-- ── Migration 045: AI integration for built apps ──────────────────────────────
-- Allows projects to expose a managed AI endpoint so builders can add AI
-- to their apps without managing API keys themselves.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS ai_integration_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS ai_integration_model    TEXT NOT NULL DEFAULT 'gpt-4o-mini',
  ADD COLUMN IF NOT EXISTS ai_credits_used         INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS ai_credit_limit         INT NOT NULL DEFAULT 100;

COMMENT ON COLUMN projects.ai_integration_enabled IS
  'When true, the project can call /api/projects/[id]/ai-proxy with LifemarkAI managed keys';
COMMENT ON COLUMN projects.ai_integration_model IS
  'Model to use for AI proxy calls (gpt-4o-mini, gpt-4o, claude-haiku, etc.)';
COMMENT ON COLUMN projects.ai_credits_used IS
  'Running total of AI proxy credits consumed by this project';
COMMENT ON COLUMN projects.ai_credit_limit IS
  'Maximum AI proxy credits this project may consume (default 100)';
