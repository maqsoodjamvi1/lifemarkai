-- ============================================================
-- Migration 010: Deploy history — snapshot_id on deployments
-- ============================================================

-- Link each deployment to the snapshot taken at deploy time
-- so we can roll back to any previous deploy.
ALTER TABLE deployments
  ADD COLUMN IF NOT EXISTS snapshot_id UUID REFERENCES project_snapshots(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS file_count  INTEGER,
  ADD COLUMN IF NOT EXISTS commit_sha  TEXT;

-- Index for rollback lookups
CREATE INDEX IF NOT EXISTS idx_deployments_snapshot_id ON deployments(snapshot_id);
