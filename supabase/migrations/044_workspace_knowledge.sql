-- ── Migration 044: Workspace-level AI knowledge ───────────────────────────────
-- Adds a per-user workspace knowledge field that is injected into every AI call
-- across all projects, providing a global coding standard / rule set.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS workspace_knowledge TEXT;

COMMENT ON COLUMN profiles.workspace_knowledge IS
  'Global coding standards and conventions injected into every AI prompt for this user';
