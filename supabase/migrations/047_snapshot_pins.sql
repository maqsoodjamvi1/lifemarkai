-- Migration 047: Pin stable snapshots
--
-- Lovable best-practice: "After every working feature: Pin it"
-- Pinned snapshots float to the top of the History panel so users can quickly
-- return to a known-good state.

ALTER TABLE project_snapshots
  ADD COLUMN IF NOT EXISTS is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS pinned_at TIMESTAMPTZ;

COMMENT ON COLUMN project_snapshots.is_pinned IS
  'When true, this snapshot is marked as a stable checkpoint and renders pinned-first in the History panel.';

-- Index so the pinned-first query is fast.
CREATE INDEX IF NOT EXISTS snapshots_project_pinned
  ON project_snapshots (project_id, is_pinned DESC, created_at DESC);
