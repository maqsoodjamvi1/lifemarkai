-- Migration 021: Active Visitors
-- Tracks live visitors per project for real-time analytics

CREATE TABLE IF NOT EXISTS app_visitors (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  visitor_key  TEXT NOT NULL,      -- random ID assigned to browser session
  path         TEXT DEFAULT '/',
  referrer     TEXT,
  last_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (project_id, visitor_key)
);

CREATE INDEX IF NOT EXISTS app_visitors_project_last_seen_idx
  ON app_visitors (project_id, last_seen DESC);

-- Auto-clean stale visitors (older than 2 minutes)
CREATE OR REPLACE FUNCTION cleanup_stale_visitors()
RETURNS void LANGUAGE sql SECURITY DEFINER AS $$
  DELETE FROM app_visitors WHERE last_seen < now() - interval '2 minutes';
$$;

-- RLS
ALTER TABLE app_visitors ENABLE ROW LEVEL SECURITY;

-- Anyone can upsert (beacon calls are unauthenticated)
CREATE POLICY "app_visitors_upsert" ON app_visitors
  FOR ALL WITH CHECK (true);

-- Owner can read
CREATE POLICY "app_visitors_owner_select" ON app_visitors
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
      UNION
      SELECT project_id FROM collaborators WHERE user_id = auth.uid()
    )
  );

-- Enable Realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE app_visitors;
