# Database Schema Summary

Source: generated from `supabase/migrations/*.sql`

## Tables (high-level)

- `profiles`: id (UUID PK), email, full_name, avatar_url, plan, credits, credits_reset_at, github_username, github_access_token, stripe_customer_id, stripe_subscription_id, username, bio, created_at, updated_at
- `projects`: id, user_id (FK→profiles), name, description, framework, status, is_public, preview_url, deployed_url, github_repo, github_branch, supabase_project_url, template_id, metadata (JSONB), team_id, custom_domain, total_views, created_at, updated_at
- `project_files`: id, project_id (FK→projects), path, content, language, created_at, updated_at
- `messages`: id, project_id, role, content, tokens_used, model, mode, metadata (JSONB), created_at
- `deployments`: id, project_id, user_id, url, status, provider, provider_deployment_id, build_log, deployed_at, created_at
- `collaborators`: id, project_id, user_id, role, invited_by, invited_at, accepted_at
- `templates`: id, name, description, category, preview_url, files (JSONB), is_featured, is_public, created_by, fork_count, created_at
- `credit_logs`: id, user_id, amount, action, project_id, description, created_at
- `teams`: id, name, slug, owner_id, plan, credits, max_members, avatar_url, stripe_* ids, created_at, updated_at
- `team_members`: id, team_id, user_id, role, credit_allowance, credits_used, invited_by, accepted_at, created_at
- `credit_packs`: id, user_id, team_id, amount, price_cents, stripe_payment_intent_id, stripe_session_id, status, pack_key, created_at
- `credit_transfers`: id, from_user_id/from_team_id, to_user_id/to_team_id, amount, note, created_at
- `deployment_logs`: id, deployment_id, message, level, created_at
- `analytics_events`: id, user_id, project_id, event_type, properties (JSONB), created_at
- `project_snapshots`: id, project_id, user_id, label, files (JSONB), created_at
- `notifications`: id, user_id, type, title, body, link, is_read, metadata, created_at
- `api_keys`: id, user_id, name, key_hash, key_prefix, last_used_at, expires_at, is_active, created_at
- `audit_logs`: id, user_id, team_id, action, resource_type, resource_id, metadata, ip_address, user_agent, created_at
- `job_queue`: id, type, status, priority, payload, result, error, attempts, max_attempts, scheduled_at, started_at, completed_at, user_id, project_id, created_at
- `feature_flags`: id, key, name, description, is_enabled, rollout_pct, allowed_users, allowed_plans, metadata, created_at, updated_at
- `project_views`: id, project_id, viewer_id, ip_hash, referrer, country_code, created_at

## Notes
- Row-level security (RLS) policies are present for most tables (profiles, projects, project_files, messages, deployments, collaborators, templates, credit_logs, etc.).
- `projects` includes denormalized `total_views` and `metadata` JSONB for integrations.
- Several helper functions and triggers exist (credit management, update timestamps, project snapshots, view counters, job queue claim function).

If you want, I can:
- produce a full CREATE TABLE SQL export assembled from migrations, or
- run `supabase db pull --yes` and produce the exact remote schema (requires Docker Desktop + WSL2 running locally).
