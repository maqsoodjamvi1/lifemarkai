-- Remove non-unique indexes that are exactly duplicated by an existing
-- unique index on the same keys, expressions, predicate, collation, and
-- operator classes. The unique indexes retain both query acceleration and
-- constraint enforcement.

drop index if exists public.idx_app_monetization_project;
drop index if exists public.idx_app_user_conn_lookup;
drop index if exists public.idx_invite_tokens_token;
drop index if exists public.idx_member_caps_team_user;
drop index if exists public.idx_oauth_tokens_user_connector;
drop index if exists public.idx_profiles_mcp_api_token;
drop index if exists public.idx_profiles_referral_code;
drop index if exists public.idx_workspace_branding_team;
drop index if exists public.idx_workspace_pools_team;
drop index if exists public.project_ai_agents_project_idx;
drop index if exists public.project_files_path;
