-- Migration 084: safe clean app slugs
--
-- Creates the correctly-shaped generator used by project creation and fills
-- only projects that do not already have an app_slug. Existing slugs and
-- deployed_url values are deliberately preserved so public URLs never change
-- as a side effect of this migration.

CREATE OR REPLACE FUNCTION public.generate_app_slug(p_name TEXT)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  base_slug TEXT;
  candidate TEXT;
  suffix TEXT := '';
  counter INTEGER := 0;
BEGIN
  base_slug := trim(
    both '-' from regexp_replace(lower(coalesce(p_name, '')), '[^a-z0-9]+', '-', 'g')
  );
  IF base_slug = '' THEN base_slug := 'app'; END IF;
  IF length(base_slug) < 3 THEN base_slug := left(base_slug || 'app', 40); END IF;

  LOOP
    suffix := CASE WHEN counter = 0 THEN '' ELSE '-' || counter::TEXT END;
    candidate := trim(both '-' from left(base_slug, 40 - length(suffix))) || suffix;
    IF length(candidate) < 3 THEN candidate := left(candidate || 'app', 3); END IF;

    EXIT WHEN NOT EXISTS (
      SELECT 1 FROM public.projects WHERE app_slug = candidate
    );
    counter := counter + 1;
  END LOOP;

  RETURN candidate;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_app_slug(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_app_slug(TEXT) TO authenticated, service_role;

-- Stable-order backfill. Existing non-null values are never touched.
DO $$
DECLARE
  project_row RECORD;
  generated_slug TEXT;
BEGIN
  FOR project_row IN
    SELECT id, name
      FROM public.projects
     WHERE app_slug IS NULL OR app_slug = ''
     ORDER BY created_at NULLS LAST, id
  LOOP
    generated_slug := public.generate_app_slug(coalesce(project_row.name, 'app'));
    UPDATE public.projects
       SET app_slug = generated_slug
     WHERE id = project_row.id
       AND (app_slug IS NULL OR app_slug = '');
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.generate_app_slug(TEXT) IS
  'Returns an available 3-40 character app_slug without modifying existing project URLs.';
