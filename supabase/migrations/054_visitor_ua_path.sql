-- Migration 054: capture user-agent and path on visitor records for richer analytics
--
-- Lovable-style analytics needs Source (referrer), Page (path), and Device (derived from UA)
-- breakdowns. We already store referrer + path on app_visitors and referrer on project_views.
-- This migration adds:
--   • project_views.path        — the request path so we can show the Pages breakdown over a window
--   • project_views.user_agent  — raw UA string, used to bucket device (desktop/mobile/tablet)
--   • app_visitors.user_agent   — raw UA on the live-visitor row so the live panel can show device
--
-- All columns are nullable so old rows continue to work; new beacon writes populate them.

ALTER TABLE project_views
  ADD COLUMN IF NOT EXISTS path       TEXT,
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

ALTER TABLE app_visitors
  ADD COLUMN IF NOT EXISTS user_agent TEXT;

-- Helpful indexes for the breakdown queries inside the analytics endpoint.
-- These are partial indexes so they stay cheap (only index rows that have a value).
CREATE INDEX IF NOT EXISTS project_views_project_path_idx
  ON project_views (project_id, path)
  WHERE path IS NOT NULL;

CREATE INDEX IF NOT EXISTS project_views_project_referrer_idx
  ON project_views (project_id, referrer)
  WHERE referrer IS NOT NULL;
