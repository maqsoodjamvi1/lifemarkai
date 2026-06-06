-- Secrets vault: encrypted per-project secrets with audit trail
CREATE TABLE IF NOT EXISTS project_secrets (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  key          text NOT NULL,
  value_enc    text NOT NULL,  -- AES-256-GCM encrypted (done server-side)
  description  text,
  last_used_at timestamptz,
  rotate_after_days int DEFAULT 90,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE(project_id, key)
);

CREATE TABLE IF NOT EXISTS secret_access_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  secret_id   uuid NOT NULL REFERENCES project_secrets(id) ON DELETE CASCADE,
  project_id  uuid NOT NULL,
  user_id     uuid NOT NULL,
  action      text NOT NULL CHECK (action IN ('read', 'write', 'delete', 'rotate')),
  accessed_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE project_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE secret_access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owner manages secrets" ON project_secrets
  FOR ALL USING (
    project_id IN (SELECT id FROM projects WHERE user_id = auth.uid())
  );

CREATE POLICY "Owner views access logs" ON secret_access_logs
  FOR SELECT USING (user_id = auth.uid());

CREATE INDEX idx_secrets_project ON project_secrets(project_id);
CREATE INDEX idx_secret_logs_secret ON secret_access_logs(secret_id);
