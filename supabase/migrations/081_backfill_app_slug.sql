-- 081_backfill_app_slug.sql
-- Clean slug-only deploy URLs ({app_slug}.apps.lifemarkai.com).
-- 1) Give every existing project a unique app_slug.
-- 2) Rewrite existing LIFEMARK-HOSTED deploy URLs to the clean slug form
--    (leaves Vercel/Netlify/custom-domain URLs untouched).
--
-- Reuses the app's generate_project_slug(project_id) function; falls back to a
-- name-derived slug + short id if that ever fails, so no row is left without one.

DO $$
DECLARE
  r  RECORD;
  s  TEXT;
BEGIN
  FOR r IN SELECT id, name FROM public.projects WHERE app_slug IS NULL OR app_slug = '' LOOP
    BEGIN
      s := public.generate_project_slug(r.id);
    EXCEPTION WHEN OTHERS THEN
      s := NULL;
    END;

    IF s IS NULL OR s = '' THEN
      s := trim(both '-' from left(regexp_replace(lower(coalesce(r.name, 'app')), '[^a-z0-9]+', '-', 'g'), 20));
      IF s = '' THEN s := 'app'; END IF;
      s := s || '-' || left(replace(r.id::text, '-', ''), 6);
    END IF;

    UPDATE public.projects
      SET app_slug = s
      WHERE id = r.id AND (app_slug IS NULL OR app_slug = '');
  END LOOP;
END $$;

-- Rewrite only Lifemark-hosted deploy URLs to the clean slug host.
UPDATE public.projects
   SET deployed_url = 'https://' || app_slug || '.apps.lifemarkai.com'
 WHERE deployed_url IS NOT NULL
   AND app_slug IS NOT NULL
   AND (deployed_url LIKE '%.lifemarkai.app%' OR deployed_url LIKE '%.apps.lifemarkai.com%');

-- Recommended (uncomment if app_slug isn't already unique): enforce uniqueness.
-- Fails if a duplicate slipped through — resolve dupes first, then apply.
-- CREATE UNIQUE INDEX IF NOT EXISTS projects_app_slug_key
--   ON public.projects (app_slug) WHERE app_slug IS NOT NULL;
