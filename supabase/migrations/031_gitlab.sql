-- GitLab integration columns (mirrors github_username / github_access_token)
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS gitlab_username     text,
  ADD COLUMN IF NOT EXISTS gitlab_access_token text;

-- Optional: store which git provider a project is linked to
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS git_provider text NOT NULL DEFAULT 'github'
    CHECK (git_provider IN ('github', 'gitlab', 'none'));
