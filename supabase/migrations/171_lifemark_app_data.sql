-- LifemarkData: default hosted data layer for generated apps (no Cloud
-- provisioning needed). One shared table, keyed by project + collection.
-- Accessed exclusively through /api/public/app-data/$slug (service role);
-- no anon/authenticated grants on purpose.

-- Helper used by the updated_at trigger; created here defensively because
-- this database predates any migration that defined it.
CREATE OR REPLACE FUNCTION public.update_updated_at_column() RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TABLE IF NOT EXISTS public.app_data (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  collection text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX app_data_project_collection_idx
  ON public.app_data (project_id, collection, created_at DESC);

GRANT ALL ON public.app_data TO service_role;

ALTER TABLE public.app_data ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER update_app_data_updated_at
BEFORE UPDATE ON public.app_data
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
