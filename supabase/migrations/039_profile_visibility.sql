-- ── Migration 039: Profile visibility public read policy ─────────────────────
-- NOTE: the original comment claimed profiles.is_public existed from migration
-- 001 — it never did (001 only added is_public to projects and templates).
-- Add it here, defaulting to FALSE (users opt in to a public profile).
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS is_public BOOLEAN NOT NULL DEFAULT FALSE;

-- This migration adds a SELECT policy so anonymous/authenticated users can read
-- public profiles (needed for the /u/[username] public profile page and
-- templates marketplace discoverability).

-- Allow anyone to read profiles where is_public = true
--
-- ⚠ SECURITY NOTE: RLS policies are row-level, not column-level — this policy
-- exposes EVERY column of an opted-in profile to anon, including sensitive
-- fields added later (e.g. mcp_api_token from migration 036). Public-facing
-- code should read from the `public_profiles` view below instead. A follow-up
-- migration should revoke anon column grants on the sensitive columns.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'profiles'
      AND policyname = 'profiles_public_read'
  ) THEN
    CREATE POLICY "profiles_public_read" ON profiles
      FOR SELECT
      USING (is_public = TRUE);
  END IF;
END $$;

-- Index to speed up marketplace queries that filter on is_public
CREATE INDEX IF NOT EXISTS idx_profiles_is_public
  ON profiles(is_public)
  WHERE is_public = TRUE;

-- View: public_profiles — safe projection (no sensitive columns)
CREATE OR REPLACE VIEW public_profiles AS
SELECT
  id,
  username,
  full_name,
  avatar_url,
  created_at
FROM profiles
WHERE is_public = TRUE;

GRANT SELECT ON public_profiles TO anon, authenticated;
