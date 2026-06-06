-- ── Migration 043: Community stars for public projects ────────────────────────

-- Denormalized count on projects (fast reads)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS star_count INT NOT NULL DEFAULT 0;

-- Star relationship table
CREATE TABLE IF NOT EXISTS community_stars (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id  UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (project_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_community_stars_project ON community_stars(project_id);
CREATE INDEX IF NOT EXISTS idx_community_stars_user    ON community_stars(user_id);

-- RLS
ALTER TABLE community_stars ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "community_stars_read"   ON community_stars;
DROP POLICY IF EXISTS "community_stars_insert" ON community_stars;
DROP POLICY IF EXISTS "community_stars_delete" ON community_stars;
CREATE POLICY "community_stars_read"   ON community_stars FOR SELECT USING (true);
CREATE POLICY "community_stars_insert" ON community_stars FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "community_stars_delete" ON community_stars FOR DELETE USING (auth.uid() = user_id);
