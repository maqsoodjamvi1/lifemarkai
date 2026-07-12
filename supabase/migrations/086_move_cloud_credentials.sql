-- Migration 086: move managed backend secrets out of owner-readable projects

CREATE TABLE IF NOT EXISTS public.project_cloud_credentials (
  project_id UUID PRIMARY KEY REFERENCES public.projects(id) ON DELETE CASCADE,
  service_key TEXT,
  db_password TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.project_cloud_credentials ENABLE ROW LEVEL SECURITY;

-- No authenticated policies are intentional. Managed credentials are only
-- read and written through server-side service-role clients.
REVOKE ALL ON TABLE public.project_cloud_credentials FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.project_cloud_credentials TO service_role;

INSERT INTO public.project_cloud_credentials (project_id, service_key, db_password)
SELECT id, cloud_service_key, cloud_db_password
  FROM public.projects
 WHERE cloud_service_key IS NOT NULL OR cloud_db_password IS NOT NULL
ON CONFLICT (project_id) DO UPDATE
SET service_key = COALESCE(EXCLUDED.service_key, project_cloud_credentials.service_key),
    db_password = COALESCE(EXCLUDED.db_password, project_cloud_credentials.db_password),
    updated_at = NOW();

-- Keeping these values on projects defeats the server-only table because
-- project owners can select their own rows through RLS/PostgREST.
ALTER TABLE public.projects DROP COLUMN IF EXISTS cloud_service_key;
ALTER TABLE public.projects DROP COLUMN IF EXISTS cloud_db_password;

COMMENT ON TABLE public.project_cloud_credentials IS
  'Server-only credentials for dedicated managed backends. Never expose through project APIs.';
