-- Migration 085: secure and atomic credit accounting
--
-- Hardens the legacy credit RPCs against cross-account calls, makes credit
-- additions service-role only, and introduces reservation-based charging for
-- AI work. Reservations debit the visible balance immediately so concurrent
-- requests cannot overspend it. Only the final, actual charge is written to
-- credit_logs; cancellation, expiry, and unused reservation amounts are
-- refunded without inflating usage reports.

-- ---------------------------------------------------------------------------
-- 1. Harden the existing daily grant, deduction, and addition RPCs.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.grant_daily_credits(p_user_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan        TEXT;
  v_granted_on  DATE;
  v_month       TEXT;
  v_month_total NUMERIC;
  v_cap         NUMERIC;
  v_today       DATE := (NOW() AT TIME ZONE 'utc')::DATE;
  v_this_month  TEXT := TO_CHAR(NOW() AT TIME ZONE 'utc', 'YYYY-MM');
  v_grant       NUMERIC := 5;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'cannot grant daily credits for another user'
      USING ERRCODE = '42501';
  END IF;

  SELECT plan, daily_credits_granted_on, daily_credits_month, daily_credits_month_total
    INTO v_plan, v_granted_on, v_month, v_month_total
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;
  IF v_granted_on = v_today THEN
    RETURN 0;
  END IF;

  IF v_month IS DISTINCT FROM v_this_month THEN
    v_month_total := 0;
  END IF;

  v_cap := CASE WHEN COALESCE(v_plan, 'free') = 'free' THEN 30 ELSE 150 END;
  IF v_month_total >= v_cap THEN
    UPDATE public.profiles
       SET daily_credits_granted_on = v_today,
           daily_credits_month = v_this_month,
           daily_credits_month_total = v_month_total,
           updated_at = NOW()
     WHERE id = p_user_id;
    RETURN 0;
  END IF;

  v_grant := LEAST(v_grant, v_cap - v_month_total);

  UPDATE public.profiles
     SET credits = credits + v_grant,
         daily_credits_granted_on = v_today,
         daily_credits_month = v_this_month,
         daily_credits_month_total = v_month_total + v_grant,
         updated_at = NOW()
   WHERE id = p_user_id;

  INSERT INTO public.credit_logs (user_id, amount, action, description, created_at)
  VALUES (p_user_id, v_grant, 'daily_credits', 'Daily free credits', NOW());

  RETURN v_grant;
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_credits(
  user_id UUID,
  amount NUMERIC,
  action TEXT,
  project_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_credits NUMERIC;
  normalized_amount NUMERIC(12,2) := ROUND(amount, 2);
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND auth.uid() IS DISTINCT FROM user_id THEN
    RAISE EXCEPTION 'cannot deduct credits from another user'
      USING ERRCODE = '42501';
  END IF;

  IF normalized_amount IS NULL OR normalized_amount <= 0 THEN
    RAISE EXCEPTION 'credit deduction amount must be positive'
      USING ERRCODE = '22023';
  END IF;

  -- Lazily grant today's credits before evaluating the available balance.
  PERFORM public.grant_daily_credits(user_id);

  SELECT credits
    INTO current_credits
    FROM public.profiles
   WHERE id = user_id
   FOR UPDATE;

  IF NOT FOUND OR current_credits < normalized_amount THEN
    RETURN FALSE;
  END IF;

  UPDATE public.profiles
     SET credits = credits - normalized_amount,
         updated_at = NOW()
   WHERE id = user_id;

  INSERT INTO public.credit_logs (user_id, amount, action, project_id)
  VALUES (user_id, -normalized_amount, action, project_id);

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_credits(
  p_user_id     UUID,
  p_amount      NUMERIC,
  p_action      TEXT DEFAULT 'credit_purchase',
  p_description TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount NUMERIC(12,2) := ROUND(p_amount, 2);
BEGIN
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'credit addition amount must be positive'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.profiles
     SET credits = credits + v_amount,
         updated_at = NOW()
   WHERE id = p_user_id;

  INSERT INTO public.credit_logs (user_id, amount, action, description, created_at)
  VALUES (p_user_id, v_amount, p_action, COALESCE(p_description, p_action), NOW());
END;
$$;

-- Free editor actions still need a quota audit row, but a zero-amount call to
-- deduct_credits is no longer permitted. Keep that non-monetary operation in a
-- narrow RPC with a fixed action allowlist instead of weakening deductions.
CREATE OR REPLACE FUNCTION public.log_free_credit_action(
  p_user_id UUID,
  p_action TEXT,
  p_project_id UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'cannot log a free AI action for another user'
      USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('auto_fix', 'inline_edit') THEN
    RAISE EXCEPTION 'unsupported free AI action'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.credit_logs (
    user_id,
    amount,
    action,
    project_id,
    description,
    created_at
  )
  VALUES (
    p_user_id,
    0,
    p_action,
    p_project_id,
    'Free ' || REPLACE(p_action, '_', ' ') || ' quota usage',
    NOW()
  );
END;
$$;

-- Atomically claims one daily free action. Locking the profile row serializes
-- the count-and-insert sequence so parallel requests cannot all observe the
-- same remaining quota.
CREATE OR REPLACE FUNCTION public.claim_free_credit_action(
  p_user_id UUID,
  p_action TEXT,
  p_daily_limit INTEGER,
  p_project_id UUID DEFAULT NULL
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used INTEGER;
  v_day_start TIMESTAMPTZ := date_trunc('day', clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC';
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'cannot claim a free AI action for another user'
      USING ERRCODE = '42501';
  END IF;

  IF p_action NOT IN ('auto_fix', 'inline_edit') THEN
    RAISE EXCEPTION 'unsupported free AI action'
      USING ERRCODE = '22023';
  END IF;
  IF p_daily_limit IS NULL OR p_daily_limit < 1 OR p_daily_limit > 1000 THEN
    RAISE EXCEPTION 'daily free action limit must be between 1 and 1000'
      USING ERRCODE = '22023';
  END IF;
  IF p_project_id IS NOT NULL
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1
         FROM public.projects p
        WHERE p.id = p_project_id
          AND (
            p.user_id = p_user_id
            OR EXISTS (
              SELECT 1
                FROM public.collaborators c
               WHERE c.project_id = p.id
                 AND c.user_id = p_user_id
                 AND c.accepted_at IS NOT NULL
            )
          )
     ) THEN
    RAISE EXCEPTION 'project access required for free AI action'
      USING ERRCODE = '42501';
  END IF;

  PERFORM 1 FROM public.profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)::INTEGER
    INTO v_used
    FROM public.credit_logs
   WHERE user_id = p_user_id
     AND action = p_action
     AND created_at >= v_day_start
     AND created_at < v_day_start + INTERVAL '1 day';

  IF v_used >= p_daily_limit THEN
    RETURN 0;
  END IF;

  INSERT INTO public.credit_logs (
    user_id, amount, action, project_id, description, created_at
  )
  VALUES (
    p_user_id,
    0,
    p_action,
    p_project_id,
    'Free ' || REPLACE(p_action, '_', ' ') || ' quota usage',
    NOW()
  );

  RETURN v_used + 1;
END;
$$;

REVOKE ALL ON FUNCTION public.grant_daily_credits(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.grant_daily_credits(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.grant_daily_credits(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.grant_daily_credits(UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.deduct_credits(UUID, NUMERIC, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_credits(UUID, NUMERIC, TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.deduct_credits(UUID, NUMERIC, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_credits(UUID, NUMERIC, TEXT, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.add_credits(UUID, NUMERIC, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_credits(UUID, NUMERIC, TEXT, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.add_credits(UUID, NUMERIC, TEXT, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.add_credits(UUID, NUMERIC, TEXT, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.log_free_credit_action(UUID, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.log_free_credit_action(UUID, TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.log_free_credit_action(UUID, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.log_free_credit_action(UUID, TEXT, UUID) TO service_role;

REVOKE ALL ON FUNCTION public.claim_free_credit_action(UUID, TEXT, INTEGER, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_free_credit_action(UUID, TEXT, INTEGER, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.claim_free_credit_action(UUID, TEXT, INTEGER, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.claim_free_credit_action(UUID, TEXT, INTEGER, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Close legacy administrative/team credit RPC privilege bypasses.
--
-- PostgreSQL grants EXECUTE on new functions to PUBLIC by default. Several
-- older migrations granted a desired role without first revoking PUBLIC, so
-- the administrative restriction was ineffective. Each credit-mutating
-- SECURITY DEFINER function is explicitly classified and granted below.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_plan_renewal(
  p_user_id UUID,
  p_plan_credits NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_credits NUMERIC(12,2) := ROUND(p_plan_credits, 2);
  v_current NUMERIC;
  v_rollover NUMERIC;
  v_new NUMERIC;
BEGIN
  IF v_plan_credits IS NULL OR v_plan_credits <= 0 THEN
    RAISE EXCEPTION 'plan credit allowance must be positive'
      USING ERRCODE = '22023';
  END IF;

  SELECT credits
    INTO v_current
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  v_rollover := GREATEST(LEAST(COALESCE(v_current, 0), v_plan_credits), 0);
  v_new := v_rollover + v_plan_credits;

  UPDATE public.profiles
     SET credits = v_new,
         updated_at = NOW()
   WHERE id = p_user_id;

  INSERT INTO public.credit_logs (user_id, amount, action, description, created_at)
  VALUES (
    p_user_id,
    v_new - COALESCE(v_current, 0),
    'subscription_renewal',
    'Monthly renewal: ' || v_plan_credits || ' plan credits + ' || v_rollover || ' rolled over',
    NOW()
  );

  RETURN v_new;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_team_credits(
  p_team_id UUID,
  p_amount INTEGER,
  p_description TEXT DEFAULT 'Credit pack purchase'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'team credit addition amount must be positive'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.teams
     SET credits = credits + p_amount,
         updated_at = NOW()
   WHERE id = p_team_id;

  INSERT INTO public.credit_logs (user_id, amount, action, description, created_at)
  SELECT user_id,
         p_amount,
         'team_credit_purchase',
         COALESCE(p_description, 'Credit pack purchase'),
         NOW()
    FROM public.team_members
   WHERE team_id = p_team_id
     AND role = 'owner'
   LIMIT 1;
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_team_credits(
  p_team_id UUID,
  p_user_id UUID,
  p_amount INTEGER,
  p_action TEXT,
  p_project_id UUID DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool NUMERIC;
  v_allowance NUMERIC;
  v_used NUMERIC;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'cannot deduct team credits for another user'
      USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'team credit deduction amount must be positive'
      USING ERRCODE = '22023';
  END IF;
  IF p_action IS NULL OR BTRIM(p_action) = '' THEN
    RAISE EXCEPTION 'team credit deduction action is required'
      USING ERRCODE = '22023';
  END IF;

  SELECT credits
    INTO v_pool
    FROM public.teams
   WHERE id = p_team_id
   FOR UPDATE;

  IF NOT FOUND OR v_pool < p_amount THEN
    RETURN FALSE;
  END IF;

  SELECT credit_allowance, credits_used
    INTO v_allowance, v_used
    FROM public.team_members
   WHERE team_id = p_team_id
     AND user_id = p_user_id
     AND accepted_at IS NOT NULL;

  -- Only accepted members can consume a team's pool.
  IF NOT FOUND THEN
    RETURN FALSE;
  END IF;
  IF v_allowance IS NOT NULL AND (v_used + p_amount) > v_allowance THEN
    RETURN FALSE;
  END IF;

  UPDATE public.teams
     SET credits = credits - p_amount,
         updated_at = NOW()
   WHERE id = p_team_id;

  UPDATE public.team_members
     SET credits_used = credits_used + p_amount
   WHERE team_id = p_team_id
     AND user_id = p_user_id;

  INSERT INTO public.credit_logs (user_id, amount, action, project_id, description)
  VALUES (p_user_id, -p_amount, p_action, p_project_id, 'Team pool: ' || p_team_id::TEXT);

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.transfer_credits(
  p_from_user_id UUID,
  p_to_user_id UUID DEFAULT NULL,
  p_to_team_id UUID DEFAULT NULL,
  p_amount INTEGER DEFAULT 0,
  p_note TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance NUMERIC;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND auth.uid() IS DISTINCT FROM p_from_user_id THEN
    RAISE EXCEPTION 'cannot transfer credits from another user'
      USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN FALSE;
  END IF;
  -- Exactly one recipient is required.
  IF (p_to_user_id IS NULL AND p_to_team_id IS NULL)
     OR (p_to_user_id IS NOT NULL AND p_to_team_id IS NOT NULL) THEN
    RETURN FALSE;
  END IF;
  IF p_to_user_id = p_from_user_id THEN
    RETURN FALSE;
  END IF;
  IF p_to_user_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_to_user_id) THEN
    RETURN FALSE;
  END IF;
  IF p_to_team_id IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.teams WHERE id = p_to_team_id) THEN
    RETURN FALSE;
  END IF;

  SELECT credits
    INTO v_balance
    FROM public.profiles
   WHERE id = p_from_user_id
   FOR UPDATE;

  IF NOT FOUND OR v_balance < p_amount THEN
    RETURN FALSE;
  END IF;

  UPDATE public.profiles
     SET credits = credits - p_amount,
         updated_at = NOW()
   WHERE id = p_from_user_id;

  IF p_to_user_id IS NOT NULL THEN
    UPDATE public.profiles
       SET credits = credits + p_amount,
           updated_at = NOW()
     WHERE id = p_to_user_id;
  ELSE
    UPDATE public.teams
       SET credits = credits + p_amount,
           updated_at = NOW()
     WHERE id = p_to_team_id;
  END IF;

  INSERT INTO public.credit_transfers (
    from_user_id,
    to_user_id,
    to_team_id,
    amount,
    note
  )
  VALUES (p_from_user_id, p_to_user_id, p_to_team_id, p_amount, p_note);

  INSERT INTO public.credit_logs (user_id, amount, action, description)
  VALUES (
    p_from_user_id,
    -p_amount,
    'credit_transfer',
    COALESCE(p_note, 'Transferred to ' || COALESCE(p_to_user_id::TEXT, p_to_team_id::TEXT))
  );

  RETURN TRUE;
END;
$$;

CREATE OR REPLACE FUNCTION public.reset_monthly_credit_usage()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- team_members has no updated_at column; the legacy function attempted to
  -- write one and failed whenever the monthly job ran.
  UPDATE public.team_members
     SET credits_used = 0
   WHERE accepted_at IS NOT NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.deduct_workspace_credits(
  p_team_id UUID,
  p_user_id UUID,
  p_amount INTEGER,
  p_reason TEXT DEFAULT 'ai_generation'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pool public.workspace_credit_pools%ROWTYPE;
  v_cap public.workspace_member_caps%ROWTYPE;
  v_available INTEGER;
  v_reason TEXT := COALESCE(NULLIF(BTRIM(p_reason), ''), 'ai_generation');
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'cannot deduct workspace credits for another user'
      USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'workspace credit deduction amount must be positive'
      USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.team_members
     WHERE team_id = p_team_id
       AND user_id = p_user_id
       AND accepted_at IS NOT NULL
  ) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'Not an accepted workspace member');
  END IF;

  SELECT *
    INTO v_pool
    FROM public.workspace_credit_pools
   WHERE team_id = p_team_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'No credit pool for workspace');
  END IF;

  v_available := v_pool.total_credits - v_pool.used_credits;
  IF v_available < p_amount THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'Workspace out of credits');
  END IF;

  SELECT *
    INTO v_cap
    FROM public.workspace_member_caps
   WHERE team_id = p_team_id
     AND user_id = p_user_id
   FOR UPDATE;

  IF FOUND AND v_cap.monthly_cap > 0 THEN
    IF (v_cap.used_this_month + p_amount) > v_cap.monthly_cap THEN
      RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'Member monthly cap reached');
    END IF;

    UPDATE public.workspace_member_caps
       SET used_this_month = used_this_month + p_amount,
           updated_at = NOW()
     WHERE team_id = p_team_id
       AND user_id = p_user_id;
  END IF;

  UPDATE public.workspace_credit_pools
     SET used_credits = used_credits + p_amount,
         updated_at = NOW()
   WHERE team_id = p_team_id;

  -- Migration 023 referenced non-existent credit_logs.reason/metadata columns.
  INSERT INTO public.credit_logs (user_id, amount, action, description)
  VALUES (
    p_user_id,
    -p_amount,
    v_reason,
    'Workspace pool: ' || p_team_id::TEXT
  );

  RETURN JSONB_BUILD_OBJECT('ok', TRUE, 'remaining', v_available - p_amount);
END;
$$;

CREATE OR REPLACE FUNCTION public.add_workspace_credits(
  p_team_id UUID,
  p_amount INTEGER
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'workspace credit addition amount must be positive'
      USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.workspace_credit_pools AS pool (team_id, total_credits)
  VALUES (p_team_id, p_amount)
  ON CONFLICT (team_id) DO UPDATE
    SET total_credits = pool.total_credits + p_amount,
        updated_at = NOW();
END;
$$;

-- User-authorized funding moves personal credits into the workspace pool in a
-- single transaction. Administrative add_workspace_credits remains service-only.
CREATE OR REPLACE FUNCTION public.fund_workspace_credit_pool(
  p_team_id UUID,
  p_user_id UUID,
  p_amount INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_balance NUMERIC;
  v_remaining NUMERIC;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'cannot fund a workspace from another user account'
      USING ERRCODE = '42501';
  END IF;

  IF p_amount IS NULL OR p_amount <= 0 THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'Amount must be positive');
  END IF;

  IF NOT EXISTS (
    SELECT 1
      FROM public.team_members
     WHERE team_id = p_team_id
       AND user_id = p_user_id
       AND role IN ('owner', 'admin')
       AND accepted_at IS NOT NULL
  ) THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'Workspace admin access required');
  END IF;

  SELECT credits
    INTO v_balance
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;

  IF NOT FOUND OR v_balance < p_amount THEN
    RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'Insufficient personal credits');
  END IF;

  UPDATE public.profiles
     SET credits = credits - p_amount,
         updated_at = NOW()
   WHERE id = p_user_id
  RETURNING credits INTO v_remaining;

  INSERT INTO public.workspace_credit_pools AS pool (team_id, total_credits)
  VALUES (p_team_id, p_amount)
  ON CONFLICT (team_id) DO UPDATE
    SET total_credits = pool.total_credits + p_amount,
        updated_at = NOW();

  INSERT INTO public.credit_transfers (from_user_id, to_team_id, amount, note)
  VALUES (p_user_id, p_team_id, p_amount, 'Funded workspace credit pool');

  INSERT INTO public.credit_logs (user_id, amount, action, description, created_at)
  VALUES (
    p_user_id,
    -p_amount,
    'workspace_funding',
    'Funded workspace pool ' || p_team_id::TEXT,
    NOW()
  );

  RETURN JSONB_BUILD_OBJECT('ok', TRUE, 'remaining', v_remaining);
END;
$$;

-- Administrative profile mutations: billing/cron service role only.
REVOKE ALL ON FUNCTION public.apply_plan_renewal(UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.apply_plan_renewal(UUID, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION public.apply_plan_renewal(UUID, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.apply_plan_renewal(UUID, NUMERIC) TO service_role;

REVOKE ALL ON FUNCTION public.reset_free_credits() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_free_credits() FROM anon;
REVOKE ALL ON FUNCTION public.reset_free_credits() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reset_free_credits() TO service_role;

-- Administrative team/workspace additions and usage resets: service role only.
REVOKE ALL ON FUNCTION public.add_team_credits(UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_team_credits(UUID, INTEGER, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.add_team_credits(UUID, INTEGER, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.add_team_credits(UUID, INTEGER, TEXT) TO service_role;

REVOKE ALL ON FUNCTION public.add_workspace_credits(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_workspace_credits(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.add_workspace_credits(UUID, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.add_workspace_credits(UUID, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.fund_workspace_credit_pool(UUID, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.fund_workspace_credit_pool(UUID, UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.fund_workspace_credit_pool(UUID, UUID, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.fund_workspace_credit_pool(UUID, UUID, INTEGER) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.reset_monthly_credit_usage() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reset_monthly_credit_usage() FROM anon;
REVOKE ALL ON FUNCTION public.reset_monthly_credit_usage() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reset_monthly_credit_usage() TO service_role;

-- Self-service consumption/transfer RPCs validate auth.uid() in their bodies.
REVOKE ALL ON FUNCTION public.deduct_team_credits(UUID, UUID, INTEGER, TEXT, UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_team_credits(UUID, UUID, INTEGER, TEXT, UUID) FROM anon;
REVOKE ALL ON FUNCTION public.deduct_team_credits(UUID, UUID, INTEGER, TEXT, UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_team_credits(UUID, UUID, INTEGER, TEXT, UUID) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.transfer_credits(UUID, UUID, UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.transfer_credits(UUID, UUID, UUID, INTEGER, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.transfer_credits(UUID, UUID, UUID, INTEGER, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_credits(UUID, UUID, UUID, INTEGER, TEXT) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.deduct_workspace_credits(UUID, UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_workspace_credits(UUID, UUID, INTEGER, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.deduct_workspace_credits(UUID, UUID, INTEGER, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_workspace_credits(UUID, UUID, INTEGER, TEXT) TO authenticated, service_role;

-- These functions were already intended to be service-role only, but their
-- original migrations revoked API roles without explicitly granting the
-- service role used by the Gateway and Cloud billing cron.
REVOKE ALL ON FUNCTION public.bill_cloud_usage(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bill_cloud_usage(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.bill_cloud_usage(UUID, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bill_cloud_usage(UUID, INTEGER) TO service_role;

REVOKE ALL ON FUNCTION public.debit_ai_balance(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.debit_ai_balance(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.debit_ai_balance(UUID, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.debit_ai_balance(UUID, INTEGER) TO service_role;

-- ---------------------------------------------------------------------------
-- 3. Atomic reservations for AI routes.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.credit_reservations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  project_id UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  action TEXT NOT NULL,
  reserved_amount NUMERIC(12,2) NOT NULL,
  settled_amount NUMERIC(12,2),
  refunded_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  expires_at TIMESTAMPTZ NOT NULL,
  completed_at TIMESTAMPTZ,
  balance_after NUMERIC(12,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT credit_reservations_amount_positive CHECK (reserved_amount > 0),
  CONSTRAINT credit_reservations_settled_amount_valid CHECK (
    settled_amount IS NULL OR (settled_amount >= 0 AND settled_amount <= reserved_amount)
  ),
  CONSTRAINT credit_reservations_refund_valid CHECK (
    refunded_amount >= 0 AND refunded_amount <= reserved_amount
  ),
  CONSTRAINT credit_reservations_status_valid CHECK (
    status IN ('active', 'settled', 'cancelled', 'expired')
  )
);

CREATE INDEX IF NOT EXISTS idx_credit_reservations_user_created
  ON public.credit_reservations (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_credit_reservations_active_expiry
  ON public.credit_reservations (user_id, expires_at)
  WHERE status = 'active';

ALTER TABLE public.credit_reservations ENABLE ROW LEVEL SECURITY;

-- Reservation rows are intentionally opaque to API roles. Authenticated users
-- can manipulate only their own reservations through the checked RPCs below.
REVOKE ALL ON TABLE public.credit_reservations FROM PUBLIC;
REVOKE ALL ON TABLE public.credit_reservations FROM anon;
REVOKE ALL ON TABLE public.credit_reservations FROM authenticated;
GRANT ALL ON TABLE public.credit_reservations TO service_role;

COMMENT ON TABLE public.credit_reservations IS
  'Short-lived credit holds for AI work. Active holds are already subtracted from profiles.credits; credit_logs records only settled usage.';

CREATE OR REPLACE FUNCTION public.reserve_credits(
  p_user_id UUID,
  p_amount NUMERIC,
  p_action TEXT,
  p_project_id UUID DEFAULT NULL,
  p_ttl_seconds INTEGER DEFAULT 1800
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount NUMERIC(12,2) := ROUND(p_amount, 2);
  v_balance NUMERIC;
  v_expired_refund NUMERIC := 0;
  v_reservation_id UUID;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role'
     AND auth.uid() IS DISTINCT FROM p_user_id THEN
    RAISE EXCEPTION 'cannot reserve credits for another user'
      USING ERRCODE = '42501';
  END IF;

  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'credit reservation amount must be positive'
      USING ERRCODE = '22023';
  END IF;
  IF p_action IS NULL OR BTRIM(p_action) = '' THEN
    RAISE EXCEPTION 'credit reservation action is required'
      USING ERRCODE = '22023';
  END IF;
  IF length(p_action) > 100 THEN
    RAISE EXCEPTION 'credit reservation action is too long'
      USING ERRCODE = '22023';
  END IF;
  IF p_ttl_seconds IS NULL OR p_ttl_seconds < 60 OR p_ttl_seconds > 86400 THEN
    RAISE EXCEPTION 'credit reservation TTL must be between 60 and 86400 seconds'
      USING ERRCODE = '22023';
  END IF;
  IF p_project_id IS NOT NULL
     AND auth.role() IS DISTINCT FROM 'service_role'
     AND NOT EXISTS (
       SELECT 1
         FROM public.projects p
        WHERE p.id = p_project_id
          AND (
            p.user_id = p_user_id
            OR EXISTS (
              SELECT 1
                FROM public.collaborators c
               WHERE c.project_id = p.id
                 AND c.user_id = p_user_id
                 AND c.accepted_at IS NOT NULL
            )
          )
     ) THEN
    RAISE EXCEPTION 'project access required for credit reservation'
      USING ERRCODE = '42501';
  END IF;

  -- Preserve the existing lazy daily-credit behavior before the balance gate.
  PERFORM public.grant_daily_credits(p_user_id);

  -- This profile lock serializes reservations, settlements, cancellations, and
  -- legacy deductions for the user. It prevents concurrent overspending.
  SELECT credits
    INTO v_balance
    FROM public.profiles
   WHERE id = p_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  -- Reclaim abandoned holds while the same profile lock is held. No usage log
  -- is written because an expired reservation never became a charge.
  WITH expired AS (
    UPDATE public.credit_reservations
       SET status = 'expired',
           refunded_amount = reserved_amount,
           completed_at = v_now
     WHERE user_id = p_user_id
       AND status = 'active'
       AND expires_at <= v_now
     RETURNING reserved_amount
  )
  SELECT COALESCE(SUM(reserved_amount), 0)
    INTO v_expired_refund
    FROM expired;

  v_balance := v_balance + v_expired_refund;

  IF v_balance < v_amount THEN
    IF v_expired_refund > 0 THEN
      UPDATE public.profiles
         SET credits = v_balance,
             updated_at = NOW()
       WHERE id = p_user_id;
    END IF;
    RETURN NULL;
  END IF;

  UPDATE public.profiles
     SET credits = v_balance - v_amount,
         updated_at = NOW()
   WHERE id = p_user_id;

  INSERT INTO public.credit_reservations (
    user_id,
    project_id,
    action,
    reserved_amount,
    expires_at
  )
  VALUES (
    p_user_id,
    p_project_id,
    p_action,
    v_amount,
    v_now + (p_ttl_seconds * INTERVAL '1 second')
  )
  RETURNING id INTO v_reservation_id;

  RETURN v_reservation_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.settle_credit_reservation(
  p_reservation_id UUID,
  p_actual_amount NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_reserved NUMERIC;
  v_actual NUMERIC(12,2) := ROUND(p_actual_amount, 2);
  v_previous_actual NUMERIC;
  v_action TEXT;
  v_project_id UUID;
  v_status TEXT;
  v_stored_balance NUMERIC;
  v_balance NUMERIC;
  v_refund NUMERIC;
  v_expired_refund NUMERIC := 0;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  IF v_actual IS NULL OR v_actual < 0 THEN
    RAISE EXCEPTION 'actual credit amount must be zero or positive'
      USING ERRCODE = '22023';
  END IF;

  SELECT user_id
    INTO v_user_id
    FROM public.credit_reservations
   WHERE id = p_reservation_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role'
     AND auth.uid() IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'cannot settle another user''s credit reservation'
      USING ERRCODE = '42501';
  END IF;

  -- Every reservation mutation locks the profile first, then the reservation,
  -- giving all three RPCs a consistent lock order.
  SELECT credits
    INTO v_balance
    FROM public.profiles
   WHERE id = v_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  WITH expired AS (
    UPDATE public.credit_reservations
       SET status = 'expired',
           refunded_amount = reserved_amount,
           completed_at = v_now
     WHERE user_id = v_user_id
       AND status = 'active'
       AND expires_at <= v_now
     RETURNING reserved_amount
  )
  SELECT COALESCE(SUM(reserved_amount), 0)
    INTO v_expired_refund
    FROM expired;

  IF v_expired_refund > 0 THEN
    UPDATE public.profiles
       SET credits = credits + v_expired_refund,
           updated_at = NOW()
     WHERE id = v_user_id
     RETURNING credits INTO v_balance;
  END IF;

  SELECT reserved_amount,
         settled_amount,
         action,
         project_id,
         status,
         balance_after
    INTO v_reserved,
         v_previous_actual,
         v_action,
         v_project_id,
         v_status,
         v_stored_balance
    FROM public.credit_reservations
   WHERE id = p_reservation_id
   FOR UPDATE;

  IF v_actual > v_reserved THEN
    RAISE EXCEPTION 'actual credit amount (%) exceeds reserved amount (%)', v_actual, v_reserved
      USING ERRCODE = '22023';
  END IF;

  -- Retrying the same settlement returns the original result without another
  -- refund or log entry. A conflicting retry is invalid.
  IF v_status = 'settled' THEN
    IF v_previous_actual = v_actual THEN
      RETURN COALESCE(v_stored_balance, v_balance);
    END IF;
    RETURN NULL;
  END IF;

  IF v_status <> 'active' THEN
    RETURN NULL;
  END IF;

  v_refund := v_reserved - v_actual;

  UPDATE public.profiles
     SET credits = credits + v_refund,
         updated_at = NOW()
   WHERE id = v_user_id
   RETURNING credits INTO v_balance;

  UPDATE public.credit_reservations
     SET status = 'settled',
         settled_amount = v_actual,
         refunded_amount = v_refund,
         completed_at = v_now,
         balance_after = v_balance
   WHERE id = p_reservation_id;

  -- Exactly one usage entry is recorded, for the actual charge rather than the
  -- maximum hold. This remains correct when the actual amount is zero.
  INSERT INTO public.credit_logs (
    user_id,
    amount,
    action,
    project_id,
    description,
    created_at
  )
  VALUES (
    v_user_id,
    -v_actual,
    v_action,
    v_project_id,
    'Settled credit reservation ' || p_reservation_id::TEXT ||
      ' (reserved ' || v_reserved::TEXT || ')',
    NOW()
  );

  RETURN v_balance;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_credit_reservation(p_reservation_id UUID)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID;
  v_reserved NUMERIC;
  v_status TEXT;
  v_stored_balance NUMERIC;
  v_balance NUMERIC;
  v_expired_refund NUMERIC := 0;
  v_now TIMESTAMPTZ := clock_timestamp();
BEGIN
  SELECT user_id
    INTO v_user_id
    FROM public.credit_reservations
   WHERE id = p_reservation_id;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  IF auth.role() IS DISTINCT FROM 'service_role'
     AND auth.uid() IS DISTINCT FROM v_user_id THEN
    RAISE EXCEPTION 'cannot cancel another user''s credit reservation'
      USING ERRCODE = '42501';
  END IF;

  SELECT credits
    INTO v_balance
    FROM public.profiles
   WHERE id = v_user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN NULL;
  END IF;

  WITH expired AS (
    UPDATE public.credit_reservations
       SET status = 'expired',
           refunded_amount = reserved_amount,
           completed_at = v_now
     WHERE user_id = v_user_id
       AND status = 'active'
       AND expires_at <= v_now
     RETURNING reserved_amount
  )
  SELECT COALESCE(SUM(reserved_amount), 0)
    INTO v_expired_refund
    FROM expired;

  IF v_expired_refund > 0 THEN
    UPDATE public.profiles
       SET credits = credits + v_expired_refund,
           updated_at = NOW()
     WHERE id = v_user_id
     RETURNING credits INTO v_balance;
  END IF;

  SELECT reserved_amount, status, balance_after
    INTO v_reserved, v_status, v_stored_balance
    FROM public.credit_reservations
   WHERE id = p_reservation_id
   FOR UPDATE;

  -- Repeating a completed cancellation is safe and returns the first result.
  IF v_status = 'cancelled' THEN
    RETURN COALESCE(v_stored_balance, v_balance);
  END IF;

  IF v_status <> 'active' THEN
    RETURN NULL;
  END IF;

  UPDATE public.profiles
     SET credits = credits + v_reserved,
         updated_at = NOW()
   WHERE id = v_user_id
   RETURNING credits INTO v_balance;

  UPDATE public.credit_reservations
     SET status = 'cancelled',
         refunded_amount = v_reserved,
         completed_at = v_now,
         balance_after = v_balance
   WHERE id = p_reservation_id;

  RETURN v_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.reserve_credits(UUID, NUMERIC, TEXT, UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.reserve_credits(UUID, NUMERIC, TEXT, UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.reserve_credits(UUID, NUMERIC, TEXT, UUID, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_credits(UUID, NUMERIC, TEXT, UUID, INTEGER) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.settle_credit_reservation(UUID, NUMERIC) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.settle_credit_reservation(UUID, NUMERIC) FROM anon;
REVOKE ALL ON FUNCTION public.settle_credit_reservation(UUID, NUMERIC) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.settle_credit_reservation(UUID, NUMERIC) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_credit_reservation(UUID) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_credit_reservation(UUID) FROM anon;
REVOKE ALL ON FUNCTION public.cancel_credit_reservation(UUID) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_credit_reservation(UUID) TO service_role;

-- ---------------------------------------------------------------------------
-- 4. Atomic metering for AI calls made by generated/public apps.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.consume_project_ai_credits(
  p_project_id UUID,
  p_amount INTEGER DEFAULT 1
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_usage INTEGER;
BEGIN
  IF p_amount IS NULL OR p_amount <= 0 THEN
    RAISE EXCEPTION 'project AI credit amount must be positive'
      USING ERRCODE = '22023';
  END IF;

  UPDATE public.projects
     SET ai_credits_used = ai_credits_used + p_amount,
         updated_at = NOW()
   WHERE id = p_project_id
     AND ai_credits_used::BIGINT + p_amount::BIGINT <= ai_credit_limit::BIGINT
  RETURNING ai_credits_used INTO v_new_usage;

  -- NULL means the project is missing or the requested amount would exceed
  -- its configured limit. In either case no counter was changed.
  RETURN v_new_usage;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_project_ai_credits(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.consume_project_ai_credits(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION public.consume_project_ai_credits(UUID, INTEGER) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.consume_project_ai_credits(UUID, INTEGER) TO service_role;
