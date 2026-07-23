-- ── Migration 095: redacted request preview on ai_request_logs ───────────────
-- Lovable-parity in-app AI activity: store a short, secret-redacted preview of
-- what the generated app sent to /ai-proxy so owners can debug without logging
-- raw API keys / PII blobs.

ALTER TABLE ai_request_logs
  ADD COLUMN IF NOT EXISTS request_preview text;

COMMENT ON COLUMN ai_request_logs.request_preview IS
  'Truncated, secret-redacted preview of the inbound proxy request (prompt/messages/input). Never stores raw credentials.';
