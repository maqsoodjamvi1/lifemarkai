-- Migration 088: move AI conversation summaries out of public project metadata.
--
-- `projects` rows can be publicly readable, so private conversation-derived
-- context must live behind its own RLS boundary. One row is kept per project.

CREATE TABLE IF NOT EXISTS public.project_private_context (
  project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  context_summary TEXT,
  context_summary_at TIMESTAMPTZ,
  context_summary_covers INTEGER CHECK (
    context_summary_covers IS NULL OR context_summary_covers >= 0
  ),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Keep the table private while legacy data is moved below. Migrations execute
-- as the database owner, so application roles do not need temporary access.
REVOKE ALL ON TABLE public.project_private_context FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS update_project_private_context_updated_at
  ON public.project_private_context;
CREATE TRIGGER update_project_private_context_updated_at
  BEFORE UPDATE ON public.project_private_context
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- Backfill defensively: metadata is user-editable, so malformed timestamps or
-- counts must not abort the security migration.
DO $$
DECLARE
  project_row RECORD;
  summary_value TEXT;
  summary_at_value TIMESTAMPTZ;
  summary_covers_value INTEGER;
BEGIN
  FOR project_row IN
    SELECT id, metadata
      FROM public.projects
     WHERE metadata ?| ARRAY[
       'context_summary',
       'context_summary_at',
       'context_summary_covers'
     ]
  LOOP
    summary_value := CASE
      WHEN jsonb_typeof(project_row.metadata -> 'context_summary') = 'string'
        THEN project_row.metadata ->> 'context_summary'
      ELSE NULL
    END;

    summary_at_value := NULL;
    IF jsonb_typeof(project_row.metadata -> 'context_summary_at') = 'string' THEN
      BEGIN
        summary_at_value := (project_row.metadata ->> 'context_summary_at')::TIMESTAMPTZ;
      EXCEPTION WHEN OTHERS THEN
        summary_at_value := NULL;
      END;
    END IF;

    summary_covers_value := NULL;
    IF jsonb_typeof(project_row.metadata -> 'context_summary_covers') = 'number' THEN
      BEGIN
        summary_covers_value := (project_row.metadata ->> 'context_summary_covers')::INTEGER;
        IF summary_covers_value < 0 THEN
          summary_covers_value := NULL;
        END IF;
      EXCEPTION WHEN OTHERS THEN
        summary_covers_value := NULL;
      END;
    END IF;

    INSERT INTO public.project_private_context (
      project_id,
      context_summary,
      context_summary_at,
      context_summary_covers
    ) VALUES (
      project_row.id,
      summary_value,
      summary_at_value,
      summary_covers_value
    )
    ON CONFLICT (project_id) DO UPDATE
      SET context_summary = EXCLUDED.context_summary,
          context_summary_at = EXCLUDED.context_summary_at,
          context_summary_covers = EXCLUDED.context_summary_covers,
          updated_at = NOW();
  END LOOP;
END;
$$;

-- Remove all private summary keys after the backfill. Other project metadata is
-- preserved exactly.
UPDATE public.projects
   SET metadata = metadata
     - 'context_summary'
     - 'context_summary_at'
     - 'context_summary_covers'
 WHERE metadata ?| ARRAY[
   'context_summary',
   'context_summary_at',
   'context_summary_covers'
 ];

-- RLS policies need to inspect collaborators without depending on the caller's
-- visibility of that table. This helper derives the caller from auth.uid(); it
-- accepts no user id and cannot be used to impersonate another account.
CREATE OR REPLACE FUNCTION public.can_access_project_private_context(
  p_project_id UUID,
  p_write BOOLEAN DEFAULT FALSE
)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT auth.uid() IS NOT NULL
    AND EXISTS (
      SELECT 1
        FROM public.projects AS project
       WHERE project.id = p_project_id
         AND (
           project.user_id = auth.uid()
           OR EXISTS (
             SELECT 1
               FROM public.collaborators AS collaborator
              WHERE collaborator.project_id = project.id
                AND collaborator.user_id = auth.uid()
                AND collaborator.accepted_at IS NOT NULL
                AND (
                  NOT p_write
                  OR collaborator.role IN ('owner', 'editor', 'admin')
                )
           )
         )
    );
$$;

REVOKE ALL ON FUNCTION public.can_access_project_private_context(UUID, BOOLEAN)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_access_project_private_context(UUID, BOOLEAN)
  TO authenticated, service_role;

ALTER TABLE public.project_private_context ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.project_private_context FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS project_private_context_read
  ON public.project_private_context;
CREATE POLICY project_private_context_read
  ON public.project_private_context
  FOR SELECT
  TO authenticated
  USING (public.can_access_project_private_context(project_id, FALSE));

DROP POLICY IF EXISTS project_private_context_insert
  ON public.project_private_context;
CREATE POLICY project_private_context_insert
  ON public.project_private_context
  FOR INSERT
  TO authenticated
  WITH CHECK (public.can_access_project_private_context(project_id, TRUE));

DROP POLICY IF EXISTS project_private_context_update
  ON public.project_private_context;
CREATE POLICY project_private_context_update
  ON public.project_private_context
  FOR UPDATE
  TO authenticated
  USING (public.can_access_project_private_context(project_id, TRUE))
  WITH CHECK (public.can_access_project_private_context(project_id, TRUE));

DROP POLICY IF EXISTS project_private_context_delete
  ON public.project_private_context;
CREATE POLICY project_private_context_delete
  ON public.project_private_context
  FOR DELETE
  TO authenticated
  USING (public.can_access_project_private_context(project_id, TRUE));

GRANT SELECT, INSERT, UPDATE, DELETE
  ON TABLE public.project_private_context TO authenticated;
GRANT ALL ON TABLE public.project_private_context TO service_role;

COMMENT ON TABLE public.project_private_context IS
  'Private, conversation-derived project context. Never exposed through public project reads.';
