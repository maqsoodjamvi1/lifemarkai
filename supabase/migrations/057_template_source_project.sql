-- Migration 057: link community templates back to their source project
--
-- publish-template previously had "no direct project_id link in templates" and
-- detected re-publishing by matching template name == project name — fragile
-- (renames duplicate, identical names collide). Add an explicit source link and
-- a per-creator uniqueness guard so re-publishing updates the template in place.

ALTER TABLE templates
  ADD COLUMN IF NOT EXISTS source_project_id UUID REFERENCES projects(id) ON DELETE SET NULL;

COMMENT ON COLUMN templates.source_project_id IS
  'The project this community template was published from. NULL for built-in/seeded templates.';

-- One template per (creator, source project). Partial so built-in templates
-- (source_project_id IS NULL) are unaffected.
CREATE UNIQUE INDEX IF NOT EXISTS templates_creator_source_uniq
  ON templates (created_by, source_project_id)
  WHERE source_project_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_templates_source_project
  ON templates (source_project_id);
