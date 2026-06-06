-- Migration 007: Knowledge base, SEO meta, Remix support, Workspace knowledge

-- ─── Projects: Knowledge + SEO + Remix fields ────────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS knowledge         TEXT,          -- project-level AI context
  ADD COLUMN IF NOT EXISTS seo_title         TEXT,          -- <title> override
  ADD COLUMN IF NOT EXISTS seo_description   TEXT,          -- <meta description>
  ADD COLUMN IF NOT EXISTS og_image_url      TEXT,          -- OG / social share image
  ADD COLUMN IF NOT EXISTS favicon_url       TEXT,          -- custom favicon URL
  ADD COLUMN IF NOT EXISTS remix_enabled     BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS remix_count       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS remix_of          UUID REFERENCES projects(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS badge_hidden      BOOLEAN NOT NULL DEFAULT FALSE;

-- slug index for public share URLs (/p/username/slug)
CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_slug ON projects(slug) WHERE slug IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_projects_public ON projects(is_public) WHERE is_public = TRUE;

-- ─── Profiles: Workspace knowledge ───────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS workspace_knowledge TEXT;  -- global AI context for all projects

-- ─── Function: increment remix count ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_remix_count(p_project_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE projects SET remix_count = remix_count + 1 WHERE id = p_project_id;
END;
$$;
GRANT EXECUTE ON FUNCTION increment_remix_count(UUID) TO authenticated, service_role;

-- ─── Function: generate unique slug from project name ────────────────────────
CREATE OR REPLACE FUNCTION generate_project_slug(p_name TEXT, p_user_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  counter   INTEGER := 0;
BEGIN
  -- Slugify: lowercase, replace non-alphanumeric with -, trim -
  base_slug := lower(regexp_replace(regexp_replace(p_name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
  base_slug := trim(both '-' from base_slug);
  IF base_slug = '' THEN base_slug := 'project'; END IF;
  base_slug := left(base_slug, 50);

  candidate := base_slug;
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM projects WHERE slug = candidate
    );
    counter := counter + 1;
    candidate := base_slug || '-' || counter;
  END LOOP;
  RETURN candidate;
END;
$$;
GRANT EXECUTE ON FUNCTION generate_project_slug(TEXT, UUID) TO authenticated, service_role;

-- ─── RLS: allow reading public projects by slug ───────────────────────────────
-- (Public projects are already readable via is_public=true policy in migration 001)
-- Ensure remix_enabled projects are findable
DROP POLICY IF EXISTS "Public remix projects visible to all" ON projects;
CREATE POLICY "Public remix projects visible to all"
  ON projects FOR SELECT
  USING (is_public = TRUE AND remix_enabled = TRUE);

