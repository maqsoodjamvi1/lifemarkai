-- Migration 184: columns for real bidirectional GitHub sync.
--
-- github_repo/github_branch (001_initial_schema.sql) already let LifemarkAI
-- push and manually pull. There was no inbound path — GitHub never notified
-- LifemarkAI of a push, so "sync" only ran when a user clicked Pull. This
-- adds what a webhook receiver (src/routes/api/github/webhook.ts) needs to
-- verify a delivery is genuine and belongs to this project: a per-project
-- signing secret (HMAC over the raw request body, GitHub's
-- X-Hub-Signature-256 convention) and the registered hook's id, so it can be
-- looked up, replaced, or torn down later without another GitHub API call to
-- discover it.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS github_webhook_secret TEXT,
  ADD COLUMN IF NOT EXISTS github_webhook_id BIGINT;

COMMENT ON COLUMN public.projects.github_webhook_secret IS
  'Per-project random secret used to sign/verify the GitHub push webhook (src/routes/api/github/webhook.ts). Never sent to the client.';
COMMENT ON COLUMN public.projects.github_webhook_id IS
  'The GitHub-side webhook id returned by POST /repos/{owner}/{repo}/hooks, so it can be looked up or deleted without re-listing hooks.';
