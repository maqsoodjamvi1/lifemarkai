-- GitHub Enterprise Server: per-user REST API base (https://host/api/v3).
-- Null means public github.com (or the instance GITHUB_ENTERPRISE_HOST default).

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS github_api_base text;

COMMENT ON COLUMN public.profiles.github_api_base IS
  'Octokit baseUrl for GitHub Enterprise Server, e.g. https://github.example.com/api/v3. Null = github.com.';
