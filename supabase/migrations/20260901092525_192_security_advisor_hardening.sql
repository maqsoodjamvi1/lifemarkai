-- Migration 192: security advisor hardening
--
-- Fixes the 1 ERROR-level and several WARN/INFO-level findings from
-- `mcp__Supabase__get_advisors(type=security)` as of 2026-09-01, after an
-- audit that cross-checked each finding against actual application code
-- (grep across src/) rather than blindly acting on the linter's text.
--
-- -- 1. ERROR: public.public_profiles is SECURITY DEFINER --------------------
-- The view is `SELECT id, username, full_name, avatar_url, created_at FROM
-- profiles WHERE is_public = true` -- deliberately public-facing (anon +
-- authenticated both hold SELECT). Because it's SECURITY DEFINER, it runs
-- with the view owner's rights and bypasses whatever RLS `profiles` has,
-- rather than respecting it. `profiles` already carries a matching policy
-- (`profiles_public_read`, `USING (is_public = true)`), so switching the
-- view to SECURITY INVOKER produces the exact same rows today, but the view
-- now inherits any future tightening of that policy instead of silently
-- continuing to leak all `is_public = true` rows forever. Postgres 15+
-- (this project runs 17.6) supports this via a view option, no rebuild
-- needed.
ALTER VIEW public.public_profiles SET (security_invoker = true);

-- -- 2. rls_enabled_no_policy / no_primary_key: stale one-off backup table --
-- public._publish_audience_backup_20260801 (id, publish_audience,
-- visibility, is_public, captured_at; 86 rows) has no FK references pointing
-- at it and appears in no view definition -- a one-time snapshot taken before
-- an earlier migration touched projects.publish_audience/visibility/
-- is_public, not a table the app reads or writes. Drop it rather than
-- retrofitting a primary key and RLS policy onto dead data.
DROP TABLE IF EXISTS public._publish_audience_backup_20260801;

-- -- 3. rls_enabled_no_policy: tables with zero anon/authenticated grants ----
-- app_user_connections, app_user_oauth_state, credit_reservations,
-- project_cloud_credentials, paddle_events, stripe_events all already have
-- NO grants to anon/authenticated (confirmed via information_schema.
-- role_table_grants) -- every access path is a service_role (admin) client
-- or a SECURITY DEFINER RPC that bypasses RLS by design (credit_reservations
-- is read/written exclusively through reserve_credits/settle_credit_
-- reservation/cancel_credit_reservation, migration 085). RLS-enabled-with-
-- no-policy is the CORRECT locked-down state for these six tables -- no
-- policy is added here; the finding is a false positive the linter can't
-- distinguish from an accidental lockout.

-- -- 4. rls_enabled_no_policy: tables with stray, unused anon/authenticated
--       grants -- full CRUD grants sitting under zero RLS policy. Right now
--       Postgres denies all access to these roles by default (RLS enabled +
--       no policy = deny), so there is no live exposure, but the grants
--       themselves serve no purpose: every real write path for these five
--       tables goes through a service_role admin client (grepped across
--       src/ below), so anon/authenticated never need any privilege on them
--       at all. Revoking removes the "one careless CREATE POLICY away from
--       a hole" risk instead of papering over it with a policy nothing uses.
--   - app_data            -- src/routes/api/public/app-data.$slug.ts (admin
--                            client only; its own resolveProject() already
--                            gates on project visibility === "public")
--   - client_telemetry    -- src/routes/api/telemetry/client.ts (admin client)
--   - job_executions      -- src/lib/queue/idempotency.ts + deploy-processor.ts
--                            (service-role client built directly from
--                            SUPABASE_SERVICE_ROLE_KEY; backend queue only)
--   - panel_opens         -- src/routes/api/telemetry/panel-open.ts (admin client)
--   - project_group_access -- no reference anywhere in src/ outside generated
--                            types; appears to be unshipped/dead
REVOKE ALL ON public.app_data FROM anon, authenticated;
REVOKE ALL ON public.client_telemetry FROM anon, authenticated;
REVOKE ALL ON public.job_executions FROM anon, authenticated;
REVOKE ALL ON public.panel_opens FROM anon, authenticated;
REVOKE ALL ON public.project_group_access FROM anon, authenticated;

-- -- 5. rls_enabled_no_policy + real correctness bug: lifemark_cloud_auto_backups
-- Writes go through the admin client (src/routes/api/cloud/daily-backups.ts,
-- remove.ts) so anon/authenticated never need write access. But the READ in
-- src/routes/api/cloud/status.ts uses `createClient()` -- the cookie-bound,
-- RLS-respecting client -- to list a project's recent backups for its owner.
-- With RLS enabled and zero policies, that SELECT has been returning an
-- empty array unconditionally: the "Backups" list in the cloud status panel
-- has been silently empty for every user regardless of how many backups
-- actually exist, because backups genuinely are being written (via the
-- admin client) but never visible (via the RLS-scoped client). This is a
-- silent-failure correctness bug, not just a hardening gap.
REVOKE ALL ON public.lifemark_cloud_auto_backups FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON public.lifemark_cloud_auto_backups FROM authenticated;

CREATE POLICY "lifemark_cloud_auto_backups_owner_read"
ON public.lifemark_cloud_auto_backups
FOR SELECT
TO authenticated
USING (
  project_id IN (
    SELECT id FROM public.projects WHERE user_id = (SELECT auth.uid())
  )
);

-- -- 6. function_search_path_mutable (11 functions) ---------------------------
-- None of these declared a search_path, so they resolve unqualified object
-- names against whatever search_path the calling session happens to have --
-- a session that manages to get a malicious schema earlier in its
-- search_path could shadow a table/function these rely on. Pin each to the
-- schema it actually needs, matching the pattern already used everywhere
-- else in this codebase's SECURITY DEFINER functions (`SET search_path TO
-- 'public'`).
ALTER FUNCTION public.set_project_slug() SET search_path = public;
ALTER FUNCTION public.get_project_view_stats(uuid, integer) SET search_path = public;
ALTER FUNCTION public.update_updated_at() SET search_path = public;
ALTER FUNCTION public.reset_free_credits() SET search_path = public;
ALTER FUNCTION public.update_project_comments_updated_at() SET search_path = public;
ALTER FUNCTION public.update_project_groups_updated_at() SET search_path = public;
ALTER FUNCTION public.update_workspace_skills_updated_at() SET search_path = public;
ALTER FUNCTION public.update_domain_registrations_updated_at() SET search_path = public;
ALTER FUNCTION public.enforce_audit_log_append_only() SET search_path = public;
ALTER FUNCTION public.update_project_ai_agents_updated_at() SET search_path = public;
ALTER FUNCTION public.collab_channel_project_id(text) SET search_path = public;

-- -- 7. anon/authenticated-callable SECURITY DEFINER functions (reviewed) ----
-- can_read_collab_channel_project() / can_write_collab_channel_project():
--   intentionally callable by anon/authenticated -- these ARE Supabase
--   Realtime's own authorization check (migration 188), invoked by the
--   Realtime server itself when a client tries to join a private collab
--   channel. Revoking EXECUTE would break realtime collaboration entirely.
--   No change.
-- deduct_workspace_credits(uuid, uuid, integer, text):
--   already self-defends: `IF auth.role() IS DISTINCT FROM 'service_role'
--   AND auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION` means a
--   direct authenticated RPC call can only ever deduct the caller's own
--   credits from a team they're an accepted member of. Reviewed as safe;
--   not called from src/ today, but leaving it directly callable is
--   intentionally low-risk RPC surface, not a bug. No change.
-- enforce_team_member_self_update():
--   a TRIGGER function (RETURNS trigger) -- Postgres already refuses to run
--   it outside trigger context regardless of grants ("trigger functions can
--   only be called as triggers"), so this WARN has no live exploitability.
--   Revoking EXECUTE from anon/authenticated is still correct hygiene: it
--   removes the dead /rest/v1/rpc/enforce_team_member_self_update route
--   entirely rather than relying on that runtime error, with zero effect on
--   the trigger itself (triggers fire independent of the function's
--   role-level EXECUTE grants).
REVOKE EXECUTE ON FUNCTION public.enforce_team_member_self_update() FROM anon, authenticated, PUBLIC;

-- -- 8. auth_leaked_password_protection -----------------------------------
-- This is a project-level Auth config flag (Authentication -> Policies ->
-- "Leaked password protection" in the dashboard, or the Auth config Admin
-- API), not a database object -- it cannot be turned on from a SQL
-- migration. Left for the user to enable directly; see the accompanying
-- report.
