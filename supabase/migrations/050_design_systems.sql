-- Migration 050: Design Systems (project-as-design-system pattern)
--
-- Mirrors Lovable's "Design Systems" feature. Any project can be marked as a
-- Design System. It owns a `.lovable/` virtual folder (stored as files with
-- path beginning with `.lovable/`) containing `system.md` and `rules/*.md`.
-- Other projects can connect to one or more design systems; the connected
-- design system's `.lovable/` contents are injected into the system prompt.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS is_design_system BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS design_system_meta JSONB; -- optional display metadata (name, icon, etc.)

COMMENT ON COLUMN projects.is_design_system IS
  'When true, this project is a Design System — other projects can connect to it.';

-- ── project_design_systems: many-to-many connection between projects ─────────
CREATE TABLE IF NOT EXISTS project_design_systems (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  consumer_project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  source_project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  priority            INTEGER NOT NULL DEFAULT 100,    -- lower = applied first
  enabled             BOOLEAN NOT NULL DEFAULT TRUE,
  connected_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  user_id             UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  UNIQUE (consumer_project_id, source_project_id)
);

CREATE INDEX IF NOT EXISTS project_design_systems_consumer ON project_design_systems (consumer_project_id, priority);
CREATE INDEX IF NOT EXISTS project_design_systems_source ON project_design_systems (source_project_id);

ALTER TABLE project_design_systems ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "pds_owner_all" ON project_design_systems;
CREATE POLICY "pds_owner_all" ON project_design_systems
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
