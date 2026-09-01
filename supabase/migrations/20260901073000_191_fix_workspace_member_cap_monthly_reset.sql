-- Migration 191: fix workspace_member_caps.used_this_month never resetting
--
-- workspace_member_caps.used_this_month is checked against monthly_cap as a
-- rolling per-month counter (deduct_workspace_credits, migration 023, carried
-- forward unchanged by migration 085's CREATE OR REPLACE). No migration ever
-- resets it. The one function that looks like it should — 
-- reset_monthly_credit_usage() — zeroes team_members.credits_used, an
-- entirely different, unrelated column; used_this_month is never touched by
-- any function or scheduled job in this codebase.
--
-- The counter therefore only ever grows. Once a workspace member's
-- cumulative ALL-TIME usage crosses their monthly_cap, every subsequent
-- deduct_workspace_credits() call for them returns "Member monthly cap
-- reached" — permanently, in every later month too, not just the month the
-- cap was actually reached in. A member who should have a fresh allowance
-- every month instead loses workspace AI access for good the first time
-- their lifetime usage exceeds one month's cap.
--
-- Fix: self-heal the same way grant_daily_credits() already does for the
-- personal daily allowance (migration 085) — treat the counter as belonging
-- to whichever month it was last written in (workspace_member_caps.updated_at
-- is already set on every increment), and reset it to 0 before adding this
-- charge whenever that month isn't the current UTC month. No schema change
-- needed: updated_at already carries the information required.

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
    -- See the migration-level comment above: `used_this_month` is never
    -- reset by any job, so treat a value left over from an earlier UTC month
    -- as 0 rather than letting it keep denying requests forever.
    IF TO_CHAR(v_cap.updated_at AT TIME ZONE 'utc', 'YYYY-MM')
       IS DISTINCT FROM TO_CHAR(NOW() AT TIME ZONE 'utc', 'YYYY-MM') THEN
      v_cap.used_this_month := 0;
    END IF;

    IF (v_cap.used_this_month + p_amount) > v_cap.monthly_cap THEN
      RETURN JSONB_BUILD_OBJECT('ok', FALSE, 'error', 'Member monthly cap reached');
    END IF;

    UPDATE public.workspace_member_caps
       SET used_this_month = v_cap.used_this_month + p_amount,
           updated_at = NOW()
     WHERE team_id = p_team_id
       AND user_id = p_user_id;
  END IF;

  UPDATE public.workspace_credit_pools
     SET used_credits = used_credits + p_amount,
         updated_at = NOW()
   WHERE team_id = p_team_id;

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

-- CREATE OR REPLACE with an unchanged signature preserves existing grants,
-- but re-asserting them explicitly keeps this migration self-contained and
-- matches this codebase's convention of always pairing a function
-- definition with its own grants rather than relying on an earlier
-- migration's still being in effect.
REVOKE ALL ON FUNCTION public.deduct_workspace_credits(UUID, UUID, INTEGER, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.deduct_workspace_credits(UUID, UUID, INTEGER, TEXT) FROM anon;
REVOKE ALL ON FUNCTION public.deduct_workspace_credits(UUID, UUID, INTEGER, TEXT) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.deduct_workspace_credits(UUID, UUID, INTEGER, TEXT) TO authenticated, service_role;
