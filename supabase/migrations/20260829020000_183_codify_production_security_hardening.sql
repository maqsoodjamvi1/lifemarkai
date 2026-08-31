-- Migration 183: codify a round of production security hardening that
-- was applied directly to the live database on 2026-08-13 and never
-- committed as migration files.
--
-- Discovered on 2026-08-29 while investigating the exec_sql vulnerability
-- (see 20260828020000_181_lockdown_exec_sql.sql): the live database's
-- migration history (supabase_migrations.schema_migrations) already listed
-- eight migrations dated 2026-08-13 with no matching file anywhere in this
-- repository's git history —
--   20260813174445_secure_public_profiles_view
--   20260813225126_restrict_exec_sql_rpc
--   20260813225220_restrict_claim_next_job_rpc
--   20260813225533_restrict_internal_maintenance_functions
--   20260813225908_restrict_generation_rpcs_to_authenticated
--   20260813230250_isolate_can_edit_project_definer
--   20260813230611_isolate_generation_security_definers
--   20260813230657_isolate_remaining_authenticated_definers
-- meaning someone (or some process) applied real fixes straight to
-- production without ever pushing the SQL back to this repo. That's how
-- 181 was able to find exec_sql already locked down days before this
-- session touched it — but it also means a fresh environment built from
-- this repo (a new deploy target, disaster recovery, a clean `supabase db
-- push`) would NOT get any of these eight fixes, including the exec_sql
-- lockdown, and would be exploitable again.
--
-- This file does not reproduce the original eight migrations' exact SQL
-- (that text was never in git and isn't recoverable from Postgres). It
-- reconstructs their combined END STATE instead, verified directly against
-- the live database via introspection (pg_proc.prosecdef,
-- has_function_privilege, pg_views, information_schema grants) on
-- 2026-08-29 — so what follows is honest about being a reconstruction, not
-- a byte-for-byte history replay, but every statement's target state has
-- been checked against production, not assumed. Everything below is
-- written idempotently, and the function-grant section (the exec_sql-class
-- fixes) is a confirmed no-op against the current production database —
-- those grants are already exactly this locked down. The public_profiles
-- view section is NOT a no-op: production's copy of that view was found to
-- still grant INSERT/UPDATE/DELETE/TRUNCATE to anon/authenticated (a
-- leftover from however 174445 originally ran) — not the same severity as
-- exec_sql, since the `profiles_self` RLS policy already confines any such
-- write to the caller's own row, but wider than a "public read view"
-- should expose. This migration tightens that for the first time.

-- ── secure_public_profiles_view ─────────────────────────────────────────
-- A public, read-only projection of `profiles` exposing only the columns
-- safe to show anyone (no email, no stripe/paddle ids, no api tokens),
-- scoped to is_public = true rows.
CREATE OR REPLACE VIEW public.public_profiles AS
  SELECT id, username, full_name, avatar_url, created_at
  FROM public.profiles
  WHERE is_public = true;

-- This is a simple, auto-updatable Postgres view (single base table, no
-- aggregates), so without an explicit grant restriction it inherits
-- INSERT/UPDATE/DELETE alongside SELECT — writable through the view by
-- anyone RLS's `profiles_self` (auth.uid() = id) policy would already let
-- write their own row directly, so this was never a privilege escalation,
-- just a wider surface than a "public read view" should expose. Restrict
-- it to SELECT only, matching intent.
REVOKE ALL ON public.public_profiles FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_profiles TO anon, authenticated;
GRANT ALL ON public.public_profiles TO service_role;

-- ── restrict_exec_sql_rpc / restrict_claim_next_job_rpc /
--    restrict_internal_maintenance_functions /
--    restrict_generation_rpcs_to_authenticated /
--    isolate_generation_security_definers /
--    isolate_remaining_authenticated_definers ──────────────────────────
-- Every SECURITY DEFINER function in `public` runs with the privileges of
-- its owner regardless of the calling role's own grants — a GRANT EXECUTE
-- to `authenticated` (or `anon`) makes it callable by any signed-in (or
-- anonymous) request directly against PostgREST's /rest/v1/rpc/<fn>
-- endpoint, completely independent of whatever ownership/auth check an
-- application route layers on top. (This is exactly the exec_sql bug from
-- 181 — that migration is a narrower, single-function version of what this
-- one applies across the board.) Confirmed live on 2026-08-29 that ALL
-- SECURITY DEFINER functions in `public` are locked down to service_role
-- only; codifying that same end state here for every one of them.
DO $$
DECLARE
  fn text;
  fn_oid regprocedure;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.add_credits(uuid, numeric, text, text)',
    'public.add_team_credits(uuid, integer, text)',
    'public.add_workspace_credits(uuid, integer)',
    'public.apply_plan_renewal(uuid, numeric)',
    'public.bill_cloud_usage(uuid, integer)',
    'public.cancel_credit_reservation(uuid)',
    'public.claim_next_job(text)',
    'public.cleanup_stale_visitors()',
    'public.consume_project_ai_credits(uuid, integer)',
    'public.debit_ai_balance(uuid, integer)',
    'public.exec_sql(text)',
    'public.handle_new_user()',
    'public.increment_project_views()',
    'public.log_free_credit_action(uuid, text, uuid)',
    'public.purge_old_audit_logs(integer)',
    'public.reset_free_credits()',
    'public.reset_monthly_credit_usage()',
    'public.rls_auto_enable()',
    'public.settle_credit_reservation(uuid, numeric)'
  ]
  LOOP
    -- regprocedure resolution fails (invalid_parameter_value /
    -- undefined_function) if a given function doesn't exist on this
    -- database (e.g. a fork missing one of the newer credit RPCs) — skip
    -- it rather than aborting the whole migration.
    BEGIN
      fn_oid := fn::regprocedure;
    EXCEPTION WHEN undefined_function OR invalid_text_representation THEN
      CONTINUE;
    END;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', fn_oid);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn_oid);
  END LOOP;
END $$;

-- ── isolate_can_edit_project_definer ────────────────────────────────────
-- can_edit_project(uuid) is confirmed live as NOT SECURITY DEFINER (a
-- plain RLS-respecting helper, safe to leave callable by anon/authenticated
-- since it runs with the caller's own permissions) — nothing to revoke.
-- Documented here only so this file is a complete record of what the
-- eight untracked migrations covered; no statement needed.
