-- Resolve the September 2026 Supabase security and performance advisor set.
--
-- The RLS rewrite below is deliberately generated from the policies that exist
-- when this migration runs. It preserves PostgreSQL's permissive-policy OR
-- semantics for each Data API role and command while reducing the result to one
-- policy per role/command. It also wraps auth helpers in SELECT init plans.

-- Views execute as their caller so the profiles RLS rules remain authoritative.
ALTER VIEW public.public_profiles SET (security_invoker = true);

-- Keep privileged helpers outside PostgREST's exposed public schema.
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION private.collab_channel_project_id(topic TEXT)
RETURNS UUID
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
BEGIN
  IF topic IS NULL OR left(topic, 7) <> 'collab:' THEN
    RETURN NULL;
  END IF;

  RETURN substring(topic FROM 8)::UUID;
EXCEPTION WHEN OTHERS THEN
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION private.can_read_collab_channel_project()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.projects AS p
     WHERE p.id = private.collab_channel_project_id(realtime.topic())
       AND (
         p.user_id = (SELECT auth.uid())
         OR p.is_public = TRUE
         OR EXISTS (
           SELECT 1
             FROM public.collaborators AS c
            WHERE c.project_id = p.id
              AND c.user_id = (SELECT auth.uid())
              AND c.accepted_at IS NOT NULL
         )
       )
  );
$$;

CREATE OR REPLACE FUNCTION private.can_write_collab_channel_project()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.projects AS p
     WHERE p.id = private.collab_channel_project_id(realtime.topic())
       AND (
         p.user_id = (SELECT auth.uid())
         OR EXISTS (
           SELECT 1
             FROM public.collaborators AS c
            WHERE c.project_id = p.id
              AND c.user_id = (SELECT auth.uid())
              AND c.role IN ('owner', 'editor')
              AND c.accepted_at IS NOT NULL
         )
       )
  );
$$;

REVOKE ALL ON FUNCTION private.collab_channel_project_id(TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_read_collab_channel_project() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.can_write_collab_channel_project() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.collab_channel_project_id(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_read_collab_channel_project() TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION private.can_write_collab_channel_project() TO anon, authenticated, service_role;

-- Retain the public workspace-credit RPC signature, but make the exposed
-- function an invoker that validates identity before entering the private
-- SECURITY DEFINER implementation.
-- Migration 085 left an older private implementation in place; migration 191
-- then replaced the public function with the corrected monthly-reset version.
-- Retire the stale private copy before moving the corrected implementation.
DROP FUNCTION private.deduct_workspace_credits(UUID, UUID, INTEGER, TEXT);

ALTER FUNCTION public.deduct_workspace_credits(UUID, UUID, INTEGER, TEXT)
  SET SCHEMA private;
ALTER FUNCTION private.deduct_workspace_credits(UUID, UUID, INTEGER, TEXT)
  RENAME TO deduct_workspace_credits_impl;
ALTER FUNCTION private.deduct_workspace_credits_impl(UUID, UUID, INTEGER, TEXT)
  SET search_path = '';

REVOKE ALL ON FUNCTION private.deduct_workspace_credits_impl(UUID, UUID, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION private.deduct_workspace_credits_impl(UUID, UUID, INTEGER, TEXT)
  TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.deduct_workspace_credits(
  p_team_id UUID,
  p_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT DEFAULT 'ai_generation'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
  IF (SELECT auth.role()) IS DISTINCT FROM 'service_role'
     AND (SELECT auth.uid()) IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'cannot deduct workspace credits for another user'
      USING ERRCODE = '42501';
  END IF;

  RETURN private.deduct_workspace_credits_impl(
    p_team_id,
    p_user_id,
    p_amount,
    p_reason
  );
END;
$$;

REVOKE ALL ON FUNCTION public.deduct_workspace_credits(UUID, UUID, INTEGER, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deduct_workspace_credits(UUID, UUID, INTEGER, TEXT)
  TO authenticated, service_role;

-- Trigger functions never need direct Data API execution.
REVOKE ALL ON FUNCTION public.enforce_team_member_self_update() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enforce_team_member_self_update() TO service_role;

-- Pin every mutable function search path reported by the advisor. These
-- functions were written against public objects, so a fixed public path keeps
-- their existing behavior and removes caller-controlled resolution.
ALTER FUNCTION public.set_project_slug() SET search_path = 'public';
ALTER FUNCTION public.get_project_view_stats(UUID, INTEGER) SET search_path = 'public';
ALTER FUNCTION public.update_updated_at() SET search_path = 'public';
ALTER FUNCTION public.reset_free_credits() SET search_path = 'public';
ALTER FUNCTION public.update_project_comments_updated_at() SET search_path = 'public';
ALTER FUNCTION public.update_project_groups_updated_at() SET search_path = 'public';
ALTER FUNCTION public.update_workspace_skills_updated_at() SET search_path = 'public';
ALTER FUNCTION public.update_domain_registrations_updated_at() SET search_path = 'public';
ALTER FUNCTION public.enforce_audit_log_append_only() SET search_path = 'public';
ALTER FUNCTION public.update_project_ai_agents_updated_at() SET search_path = 'public';

-- Snapshot, remove, and recreate permissive policies. All live policies use
-- only public/anon/authenticated roles, so computing the effective policy for
-- anon and authenticated preserves the original access model exactly.
CREATE TEMP TABLE lm_permissive_policy_snapshot ON COMMIT DROP AS
SELECT schemaname,
       tablename,
       policyname,
       roles,
       cmd,
       qual,
       with_check
  FROM pg_policies
 WHERE permissive = 'PERMISSIVE'
   AND schemaname IN ('public', 'realtime');

DO $$
DECLARE
  policy_row RECORD;
BEGIN
  FOR policy_row IN SELECT * FROM lm_permissive_policy_snapshot LOOP
    EXECUTE format(
      'DROP POLICY %I ON %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  END LOOP;
END;
$$;

DO $$
DECLARE
  table_row RECORD;
  action_name TEXT;
  role_name TEXT;
  using_expression TEXT;
  check_expression TEXT;
  policy_name TEXT;
BEGIN
  FOR table_row IN
    SELECT DISTINCT schemaname, tablename
      FROM lm_permissive_policy_snapshot
     ORDER BY schemaname, tablename
  LOOP
    FOREACH action_name IN ARRAY ARRAY['SELECT', 'INSERT', 'UPDATE', 'DELETE'] LOOP
      FOREACH role_name IN ARRAY ARRAY['anon', 'authenticated'] LOOP
        SELECT string_agg(
                 '(' || replace(
                   replace(
                     replace(
                       replace(source_expression,
                         'can_read_collab_channel_project()',
                         'private.can_read_collab_channel_project()'),
                       'can_write_collab_channel_project()',
                       'private.can_write_collab_channel_project()'),
                     'auth.uid()', '(select auth.uid())'),
                   'auth.role()', '(select auth.role())') || ')',
                 ' OR '
                 ORDER BY policyname
               )
          INTO using_expression
          FROM (
            SELECT policyname,
                   CASE
                     WHEN action_name IN ('SELECT', 'DELETE', 'UPDATE') THEN qual
                     ELSE NULL
                   END AS source_expression
              FROM lm_permissive_policy_snapshot
             WHERE schemaname = table_row.schemaname
               AND tablename = table_row.tablename
               AND cmd IN (action_name, 'ALL')
               AND ('public' = ANY(roles) OR role_name = ANY(roles))
          ) AS applicable
         WHERE source_expression IS NOT NULL;

        SELECT string_agg(
                 '(' || replace(
                   replace(
                     replace(
                       replace(source_expression,
                         'can_read_collab_channel_project()',
                         'private.can_read_collab_channel_project()'),
                       'can_write_collab_channel_project()',
                       'private.can_write_collab_channel_project()'),
                     'auth.uid()', '(select auth.uid())'),
                   'auth.role()', '(select auth.role())') || ')',
                 ' OR '
                 ORDER BY policyname
               )
          INTO check_expression
          FROM (
            SELECT policyname,
                   CASE
                     WHEN action_name IN ('INSERT', 'UPDATE')
                       THEN COALESCE(with_check, qual)
                     ELSE NULL
                   END AS source_expression
              FROM lm_permissive_policy_snapshot
             WHERE schemaname = table_row.schemaname
               AND tablename = table_row.tablename
               AND cmd IN (action_name, 'ALL')
               AND ('public' = ANY(roles) OR role_name = ANY(roles))
          ) AS applicable
         WHERE source_expression IS NOT NULL;

        policy_name := format('lm_%s_%s', lower(action_name), role_name);

        IF action_name IN ('SELECT', 'DELETE') AND using_expression IS NOT NULL THEN
          EXECUTE format(
            'CREATE POLICY %I ON %I.%I FOR %s TO %I USING (%s)',
            policy_name,
            table_row.schemaname,
            table_row.tablename,
            action_name,
            role_name,
            using_expression
          );
        ELSIF action_name = 'INSERT' AND check_expression IS NOT NULL THEN
          EXECUTE format(
            'CREATE POLICY %I ON %I.%I FOR INSERT TO %I WITH CHECK (%s)',
            policy_name,
            table_row.schemaname,
            table_row.tablename,
            role_name,
            check_expression
          );
        ELSIF action_name = 'UPDATE'
              AND using_expression IS NOT NULL
              AND check_expression IS NOT NULL THEN
          EXECUTE format(
            'CREATE POLICY %I ON %I.%I FOR UPDATE TO %I USING (%s) WITH CHECK (%s)',
            policy_name,
            table_row.schemaname,
            table_row.tablename,
            role_name,
            using_expression,
            check_expression
          );
        END IF;
      END LOOP;
    END LOOP;
  END LOOP;
END;
$$;

-- The old exposed collaboration helpers are no longer policy dependencies.
DROP FUNCTION public.can_read_collab_channel_project();
DROP FUNCTION public.can_write_collab_channel_project();
DROP FUNCTION public.collab_channel_project_id(TEXT);

-- Explicit deny policies document and preserve server-only access while
-- removing the ambiguous "RLS enabled with no policy" state.
DO $$
DECLARE
  table_name TEXT;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    '_publish_audience_backup_20260801',
    'app_data',
    'app_user_connections',
    'app_user_oauth_state',
    'client_telemetry',
    'credit_reservations',
    'job_executions',
    'paddle_events',
    'panel_opens',
    'project_cloud_credentials',
    'project_group_access',
    'stripe_events'
  ] LOOP
    IF to_regclass(format('public.%I', table_name)) IS NOT NULL THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I AS RESTRICTIVE FOR ALL TO anon, authenticated USING (false) WITH CHECK (false)',
        'deny_client_access',
        table_name
      );
    END IF;
  END LOOP;
END;
$$;

-- Preserve the 86-row historical backup while giving it a stable row key.
DO $$
BEGIN
  IF to_regclass('public._publish_audience_backup_20260801') IS NOT NULL THEN
    ALTER TABLE public._publish_audience_backup_20260801
      ADD COLUMN IF NOT EXISTS backup_row_id BIGINT GENERATED ALWAYS AS IDENTITY;

    IF NOT EXISTS (
      SELECT 1
        FROM pg_constraint
       WHERE conrelid = 'public._publish_audience_backup_20260801'::regclass
         AND contype = 'p'
    ) THEN
      ALTER TABLE public._publish_audience_backup_20260801
        ADD CONSTRAINT publish_audience_backup_pkey PRIMARY KEY (backup_row_id);
    END IF;
  END IF;
END;
$$;

-- Remove the lower-usage side of each confirmed identical index pair.
DROP INDEX IF EXISTS public.ai_eval_log_model_created_idx;
DROP INDEX IF EXISTS public.idx_project_files_project_id;
DROP INDEX IF EXISTS public.snapshots_project_id;

-- Add covering indexes for every foreign key reported by the advisor. The
-- generated name includes a hash so it remains unique after PostgreSQL's
-- 63-byte identifier limit.
DO $$
DECLARE
  constraint_row RECORD;
  index_name TEXT;
  index_columns TEXT;
BEGIN
  FOR constraint_row IN
    SELECT c.oid,
           n.nspname AS schema_name,
           t.relname AS table_name,
           c.conname,
           c.conrelid,
           c.conkey
      FROM pg_constraint AS c
      JOIN pg_class AS t ON t.oid = c.conrelid
      JOIN pg_namespace AS n ON n.oid = t.relnamespace
     WHERE c.contype = 'f'
       AND n.nspname = 'public'
       AND c.conname = ANY(ARRAY[
         'ai_eval_log_user_id_fkey',
         'app_auth_providers_user_id_fkey',
         'app_user_oauth_state_project_id_fkey',
         'collaborators_invited_by_fkey',
         'credit_logs_project_id_fkey',
         'credit_reservations_project_id_fkey',
         'credit_transfers_from_team_id_fkey',
         'credit_transfers_from_user_id_fkey',
         'credit_transfers_to_team_id_fkey',
         'credit_transfers_to_user_id_fkey',
         'db_backups_user_id_fkey',
         'dependency_cve_suppressions_suppressed_by_fkey',
         'deployment_logs_deployment_id_fkey',
         'generation_runs_user_id_fkey',
         'health_findings_user_id_fkey',
         'lifemark_cloud_auto_backups_snapshot_id_fkey',
         'lifemark_cloud_usage_user_id_fkey',
         'profiles_current_team_id_fkey',
         'profiles_referred_by_fkey',
         'project_ai_agent_decisions_decided_by_fkey',
         'project_ai_agent_messages_agent_id_fkey',
         'project_ai_initiative_events_project_id_fkey',
         'project_ai_initiatives_user_id_fkey',
         'project_chat_state_pinned_message_id_fkey',
         'project_comments_resolved_by_fkey',
         'project_comments_user_id_fkey',
         'project_data_writes_approved_by_fkey',
         'project_design_systems_user_id_fkey',
         'project_feature_flags_created_by_fkey',
         'project_group_access_group_id_fkey',
         'project_invite_tokens_created_by_fkey',
         'project_publish_grants_created_by_fkey',
         'project_publish_grants_group_id_fkey',
         'project_publish_grants_user_id_fkey',
         'project_revisions_created_by_fkey',
         'project_revisions_run_id_fkey',
         'project_snapshots_user_id_fkey',
         'projects_draft_of_fkey',
         'projects_remix_of_fkey',
         'repair_outcomes_user_id_fkey',
         'team_members_invited_by_fkey',
         'teams_owner_id_fkey',
         'workspace_member_caps_user_id_fkey'
       ])
  LOOP
    IF NOT EXISTS (
      SELECT 1
        FROM pg_index AS i
       WHERE i.indrelid = constraint_row.conrelid
         AND i.indisvalid
         AND i.indpred IS NULL
         AND (
           SELECT array_agg(key_column ORDER BY ordinal_position)
             FROM unnest(i.indkey::SMALLINT[]) WITH ORDINALITY
                    AS indexed_columns(key_column, ordinal_position)
            WHERE ordinal_position <= cardinality(constraint_row.conkey)
         ) = constraint_row.conkey
    ) THEN
      SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY key_column.ordinal_position)
        INTO index_columns
        FROM unnest(constraint_row.conkey) WITH ORDINALITY
               AS key_column(attnum, ordinal_position)
        JOIN pg_attribute AS a
          ON a.attrelid = constraint_row.conrelid
         AND a.attnum = key_column.attnum;

      index_name := left(
        'lm_fk_' || constraint_row.table_name || '_' || constraint_row.conname,
        54
      ) || '_' || substr(md5(constraint_row.conname), 1, 8);

      EXECUTE format(
        'CREATE INDEX %I ON %I.%I (%s)',
        index_name,
        constraint_row.schema_name,
        constraint_row.table_name,
        index_columns
      );
    END IF;
  END LOOP;
END;
$$;
