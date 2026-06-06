-- Migration 052: Auth providers for end-users of built apps
--
-- Mirrors Lovable's Cloud Google Auth + Cloud SAML SSO features. Each project
-- can configure auth providers that its END USERS (not the LifemarkAI users
-- themselves) sign in with.

CREATE TABLE IF NOT EXISTS app_auth_providers (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  provider     TEXT NOT NULL,                            -- 'google' | 'saml' | 'oidc'
  mode         TEXT NOT NULL DEFAULT 'managed',         -- 'managed' (Lifemark-managed OAuth) | 'byok' (own creds)
  enabled      BOOLEAN NOT NULL DEFAULT TRUE,
  config       JSONB NOT NULL DEFAULT '{}'::jsonb,      -- provider-specific config
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, provider)
);

CREATE INDEX IF NOT EXISTS aap_project ON app_auth_providers (project_id, enabled);
ALTER TABLE app_auth_providers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "aap_owner" ON app_auth_providers;
CREATE POLICY "aap_owner" ON app_auth_providers
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
