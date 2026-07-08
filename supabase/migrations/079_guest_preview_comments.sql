-- Migration 079: anonymous ("no account needed") preview comments — Lovable parity.
-- Lets stakeholders comment on a PUBLIC project's preview without a LifemarkAI
-- account. Guest inserts happen server-side via the /api/embed/comments route
-- (service role), which validates the project is public before writing — so no
-- permissive anon RLS policy is added.

ALTER TABLE project_comments ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS guest_name TEXT;
ALTER TABLE project_comments ADD COLUMN IF NOT EXISTS is_guest BOOLEAN NOT NULL DEFAULT FALSE;

-- Every comment must have an author: a real user OR a named guest.
ALTER TABLE project_comments DROP CONSTRAINT IF EXISTS project_comments_author_chk;
ALTER TABLE project_comments ADD CONSTRAINT project_comments_author_chk
  CHECK (user_id IS NOT NULL OR guest_name IS NOT NULL);

COMMENT ON COLUMN project_comments.guest_name IS
  'Display name for an anonymous (no-account) commenter on a public preview.';
COMMENT ON COLUMN project_comments.is_guest IS
  'True when the comment was posted by an anonymous guest via /api/embed/comments.';
