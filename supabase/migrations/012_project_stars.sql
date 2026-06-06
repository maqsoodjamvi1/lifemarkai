-- Migration 012: project star/favorite support
-- Adds is_starred column to projects so users can pin important projects to the top of their dashboard.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_starred BOOLEAN NOT NULL DEFAULT false;

-- Index for fast ordering (starred first)
CREATE INDEX IF NOT EXISTS idx_projects_starred ON projects (user_id, is_starred DESC, created_at DESC);

COMMENT ON COLUMN projects.is_starred IS 'When true, project is pinned to the top of the dashboard.';
