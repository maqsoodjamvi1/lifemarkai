-- Add badge_hidden flag to projects table.
-- When true, the "Built with LifemarkAI" badge is suppressed in the editor
-- preview and omitted from the deployed HTML (Pro feature).

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS badge_hidden boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN projects.badge_hidden IS
  'Pro feature — when true, suppress the "Built with LifemarkAI" badge on deployed apps.';
