-- Migration 004: Project version history (snapshots)

-- Store file snapshots before each AI generation
CREATE TABLE IF NOT EXISTS project_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label TEXT,                        -- e.g. "Before: Add dark mode"
  files JSONB NOT NULL DEFAULT '[]', -- Array of {path, content, language}
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS
ALTER TABLE project_snapshots ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "snapshots_owner" ON project_snapshots;
CREATE POLICY "snapshots_owner" ON project_snapshots
  FOR ALL USING (user_id = auth.uid());

-- Index for fast per-project lookups
CREATE INDEX IF NOT EXISTS snapshots_project_id ON project_snapshots (project_id, created_at DESC);

-- custom_domain column on projects (if not added by migration 003)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS custom_domain TEXT;
