-- Track database backup records per project
CREATE TABLE IF NOT EXISTS db_backups (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label        TEXT NOT NULL,
  size_bytes   INT,
  storage_path TEXT,          -- path in Supabase Storage (backups bucket)
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','complete','failed')),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE db_backups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "db_backups_owner" ON db_backups FOR ALL USING (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS idx_db_backups_project ON db_backups(project_id);
