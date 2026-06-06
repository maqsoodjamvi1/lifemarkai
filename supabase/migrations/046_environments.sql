-- ── Migration 046: Test / Live environment separation ─────────────────────────
-- Adds a lightweight environment toggle to every project.
-- When environment = 'live', the editor locks AI edits to prevent accidental
-- changes to the production version of the app.

ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS environment    TEXT        NOT NULL DEFAULT 'test',
  ADD COLUMN IF NOT EXISTS live_locked_at TIMESTAMPTZ;

-- Only two valid values (guarded — ADD CONSTRAINT has no IF NOT EXISTS form)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'projects_environment_check'
      AND conrelid = 'projects'::regclass
  ) THEN
    ALTER TABLE projects
      ADD CONSTRAINT projects_environment_check
      CHECK (environment IN ('test', 'live'));
  END IF;
END $$;

COMMENT ON COLUMN projects.environment IS
  'Current active environment: ''test'' (default) or ''live''. AI edits are blocked when ''live''.';
COMMENT ON COLUMN projects.live_locked_at IS
  'Timestamp when the project was last switched to the live environment.';
