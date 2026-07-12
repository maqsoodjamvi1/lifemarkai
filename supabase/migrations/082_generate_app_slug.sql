-- 082_generate_app_slug.sql
-- Fix clean slug-only deploy URLs ({app_slug}.apps.lifemarkai.com).
--
-- Migration 081 tried to reuse generate_project_slug(p_name TEXT, p_user_id UUID)
-- by calling it as generate_project_slug(project_id) — a signature mismatch that
-- threw for every row, so all projects got the name+id-fragment FALLBACK slug
-- (e.g. "saas-dashboard-with-fb18d6"). The app code called it the same wrong way,
-- so NEW projects would fail too.
--
-- This migration introduces a dedicated, correct function that slugifies a name
-- and dedupes against the app_slug column, then re-slugs every project cleanly.

-- ─── Clean app-slug generator (dedupes against app_slug, not slug) ────────────
CREATE OR REPLACE FUNCTION public.generate_app_slug(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  counter   INTEGER := 0;
BEGIN
  -- Slugify: lowercase FIRST (so A-Z aren't caught by the [^a-z0-9] class and
  -- turned into '-'), then collapse non-alphanumerics to '-' and trim.
  base_slug := regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g');
  base_slug := trim(both '-' from base_slug);
  IF base_slug = '' THEN base_slug := 'app'; END IF;

  -- Constraint app_slug_format requires ^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$
  -- (3..40 chars, alphanumeric start/end). Cap the base at 36 to leave room for
  -- a "-<counter>" dedup suffix, and re-trim so it never ends with '-'.
  base_slug := trim(both '-' from left(base_slug, 36));
  IF base_slug = '' THEN base_slug := 'app'; END IF;
  -- Pad to the 3-char minimum for very short names.
  IF length(base_slug) < 3 THEN base_slug := left(base_slug || 'app', 36); END IF;

  candidate := base_slug;
  LOOP
    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.projects WHERE app_slug = candidate
    );
    counter := counter + 1;
    candidate := base_slug || '-' || counter;  -- base<=36, suffix small => <=40
  END LOOP;
  RETURN candidate;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_app_slug(TEXT) TO authenticated, service_role;

-- ─── Re-slug every project cleanly ────────────────────────────────────────────
-- Clear all app_slugs first so dedupe starts fresh, then assign one-by-one in a
-- stable order (earliest project keeps the unsuffixed slug). No apps have live
-- wildcard traffic yet, so re-slugging existing rows is safe.
DO $$
DECLARE
  r RECORD;
  s TEXT;
BEGIN
  UPDATE public.projects SET app_slug = NULL;

  FOR r IN
    SELECT id, name
      FROM public.projects
     ORDER BY created_at NULLS LAST, id
  LOOP
    s := public.generate_app_slug(coalesce(r.name, 'app'));
    UPDATE public.projects SET app_slug = s WHERE id = r.id;
  END LOOP;
END $$;

-- ─── Rewrite Lifemark-hosted deploy URLs to the clean slug host ───────────────
UPDATE public.projects
   SET deployed_url = 'https://' || app_slug || '.apps.lifemarkai.com'
 WHERE deployed_url IS NOT NULL
   AND app_slug IS NOT NULL
   AND (deployed_url LIKE '%.lifemarkai.app%' OR deployed_url LIKE '%.apps.lifemarkai.com%');

-- Uniqueness is already enforced by the existing UNIQUE constraint
-- projects_app_slug_key, so no additional index is created here.
