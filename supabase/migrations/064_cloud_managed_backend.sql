-- Migration 064: real managed-backend provisioning for Lifemark Cloud
-- Stores the dedicated Supabase project created via the Management API
-- (lib/cloud/management.ts) when Cloud is enabled for a project.

ALTER TABLE projects ADD COLUMN IF NOT EXISTS cloud_project_ref TEXT;          -- Supabase project ref (e.g. abcdefghijklmnop)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cloud_supabase_url TEXT;         -- https://{ref}.supabase.co
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cloud_anon_key TEXT;             -- publishable anon key
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cloud_service_key TEXT;          -- service-role key (server-side only; RLS keeps it owner-readable)
ALTER TABLE projects ADD COLUMN IF NOT EXISTS cloud_db_password TEXT;          -- generated Postgres password

COMMENT ON COLUMN projects.cloud_project_ref IS
  'Dedicated Supabase project ref provisioned via the Management API. NULL when Cloud runs in local mode.';
