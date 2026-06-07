-- Nested project folders (up to 3 levels), matching Lovable dashboard organisation

ALTER TABLE project_groups
  ADD COLUMN IF NOT EXISTS parent_id UUID REFERENCES project_groups(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_project_groups_parent_id
  ON project_groups(parent_id)
  WHERE parent_id IS NOT NULL;

COMMENT ON COLUMN project_groups.parent_id IS
  'Optional parent folder. Max depth 3 (root → child → grandchild).';
