-- Migration 024: OAuth token storage for gateway-based connectors

CREATE TABLE IF NOT EXISTS oauth_tokens (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  connector     text NOT NULL,                -- "slack" | "google_workspace" | "hubspot"
  access_token  text NOT NULL,
  refresh_token text,
  expires_at    timestamptz,
  scope         text,
  raw           jsonb,                        -- full OAuth response for debugging
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, connector)
);

ALTER TABLE oauth_tokens ENABLE ROW LEVEL SECURITY;

-- Users can only see their own tokens
CREATE POLICY "users manage own tokens" ON oauth_tokens
  FOR ALL USING (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_oauth_tokens_user_connector ON oauth_tokens(user_id, connector);
