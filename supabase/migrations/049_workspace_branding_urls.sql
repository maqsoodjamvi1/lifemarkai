-- Migration 049: Branded workspace URLs + verified workspace domains
--
-- Mirrors Lovable's "Workspace settings → Branded app URLs". Each workspace
-- (= user / team here) can verify domains and pick one as the source for a
-- branded subdomain. Published apps then use {app}.{subdomain}.lifemarkai.app.

-- ── workspace_domains: per-user verified domains ─────────────────────────────
CREATE TABLE IF NOT EXISTS workspace_domains (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  domain          TEXT NOT NULL,
  verification_token TEXT NOT NULL,
  verified_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, domain)
);

CREATE INDEX IF NOT EXISTS workspace_domains_user ON workspace_domains (user_id);
ALTER TABLE workspace_domains ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "domains_owner" ON workspace_domains;
CREATE POLICY "domains_owner" ON workspace_domains
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- ── profiles: branded subdomain config ───────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS branded_subdomain        TEXT,             -- e.g., 'acme'
  ADD COLUMN IF NOT EXISTS branded_source_domain    TEXT,             -- verified domain it derives from
  ADD COLUMN IF NOT EXISTS branded_status           TEXT NOT NULL DEFAULT 'inactive', -- inactive | provisioning_dns | issuing_ssl | active | failed | disabling
  ADD COLUMN IF NOT EXISTS branded_activated_at     TIMESTAMPTZ;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_branded_subdomain_unique
  ON profiles (branded_subdomain) WHERE branded_subdomain IS NOT NULL;

COMMENT ON COLUMN profiles.branded_subdomain IS
  'Workspace-level subdomain prefix for branded published-app URLs.';
COMMENT ON COLUMN profiles.branded_status IS
  'Lifecycle: inactive → provisioning_dns → issuing_ssl → active (or failed/disabling).';
