-- Migration 051: Member groups (people groups, not project folders)
--
-- Mirrors Lovable's "Groups" feature on the People tab. A workspace owner can
-- organise teammates into named groups (e.g., Engineers, Designers, Marketing)
-- and use them to grant per-group access to projects and published apps.

CREATE TABLE IF NOT EXISTS member_groups (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE, -- workspace owner
  name        TEXT NOT NULL,
  description TEXT,
  color       TEXT,                           -- visual chip color hint
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, name)
);

CREATE INDEX IF NOT EXISTS member_groups_user ON member_groups (user_id);
ALTER TABLE member_groups ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "member_groups_owner" ON member_groups;
CREATE POLICY "member_groups_owner" ON member_groups
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Members of a group (a workspace member can be in multiple groups)
CREATE TABLE IF NOT EXISTS member_group_members (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id     UUID NOT NULL REFERENCES member_groups(id) ON DELETE CASCADE,
  member_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (group_id, member_id)
);

CREATE INDEX IF NOT EXISTS mgm_group ON member_group_members (group_id);
CREATE INDEX IF NOT EXISTS mgm_member ON member_group_members (member_id);

-- Project access granted via a group (vs explicit collaborator row)
CREATE TABLE IF NOT EXISTS project_group_access (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  group_id     UUID NOT NULL REFERENCES member_groups(id) ON DELETE CASCADE,
  role         TEXT NOT NULL DEFAULT 'viewer',   -- viewer | editor
  added_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, group_id)
);

CREATE INDEX IF NOT EXISTS pga_project ON project_group_access (project_id);
ALTER TABLE project_group_access ENABLE ROW LEVEL SECURITY;
