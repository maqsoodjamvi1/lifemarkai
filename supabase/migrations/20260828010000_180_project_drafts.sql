-- Migration 180: multiple independent drafts/branches per project (Lovable
-- parity: "multiple independent drafts/branches per project each with its
-- own chat history").
--
-- Deliberately reuses the existing `projects` table rather than a new join
-- table: a draft is a first-class project row of its own (its own files via
-- project_files, its own chat via messages, its own preview/deploy/snapshot
-- history) — the two new columns below just record how it relates to the
-- project it was branched from. This is the same "clone the whole row" shape
-- the pre-existing remix_of column already uses for public template
-- remixing; draft_of/draft_root_id are kept separate from remix_of/
-- remix_count because those are public-facing (remix trees, remix counts on
-- published templates) and a private draft branch should never be conflated
-- with that social feature.
--
-- draft_of: the immediate parent this draft was branched from.
-- draft_root_id: the original project every draft in the group traces back
--   to, so listing "all drafts of this idea" is one query
--   (id = root_id OR draft_root_id = root_id) instead of walking a chain.
--   Set to the root's own id on every draft, including one branched from
--   another draft (inherited, not re-derived, from the parent's
--   draft_root_id).
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS draft_of UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS draft_root_id UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS draft_label TEXT;

CREATE INDEX IF NOT EXISTS idx_projects_draft_root_id ON projects(draft_root_id) WHERE draft_root_id IS NOT NULL;

COMMENT ON COLUMN projects.draft_of IS
  'Immediate parent project this draft was branched from (NULL for an original, non-draft project)';
COMMENT ON COLUMN projects.draft_root_id IS
  'Root project every draft in this group traces back to — lets sibling drafts be listed in one query';
COMMENT ON COLUMN projects.draft_label IS
  'Display label for this draft within its group (e.g. "Draft 2"); NULL for the root project';
