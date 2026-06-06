-- Migration 011: project_views table for analytics
-- Tracks public project page visits with privacy-safe IP hashing

-- ── Table ────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS project_views (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  viewer_id    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ip_hash      TEXT,           -- SHA-256 of IP + salt (never raw IP)
  referrer     TEXT,           -- document.referrer, trimmed
  country_code TEXT,           -- 2-letter ISO from CF-IPCountry header
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS project_views_project_id_idx
  ON project_views (project_id);

CREATE INDEX IF NOT EXISTS project_views_project_created_idx
  ON project_views (project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_views_viewer_idx
  ON project_views (viewer_id)
  WHERE viewer_id IS NOT NULL;

-- ── RLS ──────────────────────────────────────────────────────────────────────

ALTER TABLE project_views ENABLE ROW LEVEL SECURITY;

-- Anyone can insert a view (anonymous visits are valid)
CREATE POLICY "project_views_insert" ON project_views
  FOR INSERT WITH CHECK (true);

-- Only the project owner (or collaborators) can read views
CREATE POLICY "project_views_owner_read" ON project_views
  FOR SELECT USING (
    project_id IN (
      SELECT id FROM projects WHERE user_id = auth.uid()
      UNION
      SELECT project_id FROM collaborators WHERE user_id = auth.uid()
    )
  );

-- ── Aggregate view counts on projects ────────────────────────────────────────
-- Convenience: denormalized total_views column on projects table

ALTER TABLE projects ADD COLUMN IF NOT EXISTS total_views INTEGER NOT NULL DEFAULT 0;

-- Function to increment total_views when a view is inserted
CREATE OR REPLACE FUNCTION increment_project_views()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  UPDATE projects
  SET total_views = total_views + 1
  WHERE id = NEW.project_id;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_project_view ON project_views;
CREATE TRIGGER on_project_view
  AFTER INSERT ON project_views
  FOR EACH ROW EXECUTE FUNCTION increment_project_views();

-- ── Daily unique views function (for analytics chart) ────────────────────────
CREATE OR REPLACE FUNCTION get_project_view_stats(p_project_id UUID, p_days INTEGER DEFAULT 30)
RETURNS TABLE (
  view_date   DATE,
  total_views BIGINT,
  unique_ips  BIGINT
) LANGUAGE sql STABLE AS $$
  SELECT
    created_at::DATE                     AS view_date,
    COUNT(*)                             AS total_views,
    COUNT(DISTINCT COALESCE(ip_hash, id::TEXT)) AS unique_ips
  FROM project_views
  WHERE project_id = p_project_id
    AND created_at >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY created_at::DATE
  ORDER BY view_date;
$$;
