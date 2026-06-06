-- Migration 055: per-project skill visibility
--
-- The skill auto-matcher (lib/ai/skill-matcher.ts) scores every workspace skill
-- against the user's prompt. Some skills make sense for one project but not
-- another (e.g. "Add Stripe checkout" shouldn't fire on a marketing site that
-- has no commerce surface). This migration adds a simple opt-out: a JSONB
-- array of disabled skill IDs per project.
--
-- We use JSONB on `projects` rather than a join table so the chat-API hot path
-- can read the disabled list with the project row that's already being
-- fetched, avoiding an extra round-trip.
--
-- Backwards compatible: NULL or [] means "no skills disabled" — preserves
-- existing matcher behavior.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS disabled_skill_ids JSONB NOT NULL DEFAULT '[]'::jsonb;

-- Helpful index for the matcher's filter step (small data, but partial index
-- keeps it cheap and avoids indexing the common '[]' case).
CREATE INDEX IF NOT EXISTS projects_disabled_skill_ids_idx
  ON projects USING GIN (disabled_skill_ids)
  WHERE jsonb_array_length(disabled_skill_ids) > 0;

COMMENT ON COLUMN projects.disabled_skill_ids IS
  'Array of workspace_skill IDs that should NOT auto-attach for this project. Managed via the Workspace Skills panel per-project toggle.';
