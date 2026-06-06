-- Shareable invite links with expiry for projects

-- gen_random_bytes() lives in pgcrypto (gen_random_uuid() is built-in, this is not).
-- On Supabase the extension is installed in the `extensions` schema, which the
-- CLI's migration session does NOT have on its search_path — so put it there
-- explicitly for this migration.
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;
SET search_path = public, extensions;

CREATE TABLE IF NOT EXISTS project_invite_tokens (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  created_by   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'viewer' CHECK (role IN ('viewer','editor','admin')),
  token        TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(24), 'hex'),
  expires_at   TIMESTAMPTZ NOT NULL DEFAULT (now() + INTERVAL '7 days'),
  used_count   INT NOT NULL DEFAULT 0,
  max_uses     INT,          -- NULL = unlimited
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- RLS
ALTER TABLE project_invite_tokens ENABLE ROW LEVEL SECURITY;

-- Owners/admins can create/read/delete their own tokens
CREATE POLICY "invite_tokens_owner" ON project_invite_tokens
  FOR ALL USING (created_by = auth.uid());

-- Anyone with the token can read it (for accept flow — done server-side with service role)
-- The accept endpoint uses createAdminClient() so no RLS needed for that path.

CREATE INDEX IF NOT EXISTS idx_invite_tokens_token ON project_invite_tokens(token);
CREATE INDEX IF NOT EXISTS idx_invite_tokens_project ON project_invite_tokens(project_id);
