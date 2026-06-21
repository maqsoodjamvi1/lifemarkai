-- Migration 063: Lovable-parity credit system
--   1. Fractional credits (NUMERIC instead of INTEGER) — messages can cost 0.5 credits
--   2. Daily free credits — 5/day for every user, capped per calendar month
--      (30 on free, 150 on paid), granted lazily
--   3. Monthly rollover — unused plan credits carry over one billing cycle
--      (applied by the billing webhook via apply_plan_renewal)

-- ─── 1. Column type changes: INTEGER → NUMERIC(12,2) ────────────────────────
ALTER TABLE profiles    ALTER COLUMN credits TYPE NUMERIC(12,2) USING credits::NUMERIC(12,2);
ALTER TABLE credit_logs ALTER COLUMN amount  TYPE NUMERIC(12,2) USING amount::NUMERIC(12,2);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'teams' AND column_name = 'credits') THEN
    ALTER TABLE teams ALTER COLUMN credits TYPE NUMERIC(12,2) USING credits::NUMERIC(12,2);
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'team_members' AND column_name = 'credits_used') THEN
    ALTER TABLE team_members ALTER COLUMN credits_used TYPE NUMERIC(12,2) USING credits_used::NUMERIC(12,2);
  END IF;
END;
$$;

-- ─── 2. Daily-credit tracking columns ────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS daily_credits_granted_on DATE;
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS daily_credits_month TEXT;            -- 'YYYY-MM' (UTC)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS daily_credits_month_total NUMERIC(12,2) NOT NULL DEFAULT 0;

-- ─── 3. grant_daily_credits ──────────────────────────────────────────────────
-- Grants 5 credits once per UTC day, capped per calendar month:
--   free plan: 30/month     paid plans: 150/month
-- Returns the amount granted (0 if already granted today / cap reached).
CREATE OR REPLACE FUNCTION grant_daily_credits(p_user_id UUID)
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
  SELECT plan, daily_credits_granted_on, daily_credits_month, daily_credits_month_total
    INTO v_plan, v_granted_on, v_month, v_month_total
    FROM profiles WHERE id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN RETURN 0; END IF;
  IF v_granted_on = v_today THEN RETURN 0; END IF;

  -- Reset the monthly counter on calendar-month change (UTC)
  IF v_month IS DISTINCT FROM v_this_month THEN
    v_month_total := 0;
  END IF;

  v_cap := CASE WHEN COALESCE(v_plan, 'free') = 'free' THEN 30 ELSE 150 END;
  IF v_month_total >= v_cap THEN
    -- Cap hit: remember the check so we don't re-evaluate until tomorrow
    UPDATE profiles
       SET daily_credits_granted_on = v_today,
           daily_credits_month = v_this_month,
           daily_credits_month_total = v_month_total,
           updated_at = NOW()
     WHERE id = p_user_id;
    RETURN 0;
  END IF;

  v_grant := LEAST(v_grant, v_cap - v_month_total);

  UPDATE profiles
     SET credits = credits + v_grant,
         daily_credits_granted_on = v_today,
         daily_credits_month = v_this_month,
         daily_credits_month_total = v_month_total + v_grant,
         updated_at = NOW()
   WHERE id = p_user_id;

  INSERT INTO credit_logs (user_id, amount, action, description, created_at)
  VALUES (p_user_id, v_grant, 'daily_credits', 'Daily free credits', NOW());

  RETURN v_grant;
END;
$$;

-- ─── 4. deduct_credits: NUMERIC + lazy daily grant ───────────────────────────
DROP FUNCTION IF EXISTS deduct_credits(UUID, INTEGER, TEXT, UUID);
CREATE OR REPLACE FUNCTION deduct_credits(
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
BEGIN
  -- Lazily grant today's daily credits first (no-op if already granted)
  PERFORM grant_daily_credits(user_id);

  SELECT credits INTO current_credits FROM profiles WHERE id = user_id FOR UPDATE;

  IF current_credits < amount THEN
    RETURN FALSE;
  END IF;

  UPDATE profiles SET credits = credits - amount, updated_at = NOW() WHERE id = user_id;

  INSERT INTO credit_logs (user_id, amount, action, project_id)
  VALUES (user_id, -amount, action, project_id);

  RETURN TRUE;
END;
$$;

-- ─── 5. add_credits: NUMERIC ─────────────────────────────────────────────────
DROP FUNCTION IF EXISTS add_credits(UUID, INTEGER, TEXT, TEXT);
CREATE OR REPLACE FUNCTION add_credits(
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
BEGIN
  UPDATE profiles
  SET credits    = credits + p_amount,
      updated_at = NOW()
  WHERE id = p_user_id;

  INSERT INTO credit_logs (user_id, amount, action, description, created_at)
  VALUES (p_user_id, p_amount, p_action, COALESCE(p_description, p_action), NOW());
END;
$$;

-- ─── 6. apply_plan_renewal: monthly rollover ─────────────────────────────────
-- Called by the Stripe webhook on each billing-cycle invoice (subscription_cycle).
-- Unused credits from the previous cycle roll over, capped at one month's plan
-- allowance (Lovable behaviour): new_balance = LEAST(current, plan) + plan.
CREATE OR REPLACE FUNCTION apply_plan_renewal(
  p_user_id      UUID,
  p_plan_credits NUMERIC
)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current  NUMERIC;
  v_rollover NUMERIC;
  v_new      NUMERIC;
BEGIN
  SELECT credits INTO v_current FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;

  v_rollover := GREATEST(LEAST(COALESCE(v_current, 0), p_plan_credits), 0);
  v_new := v_rollover + p_plan_credits;

  UPDATE profiles SET credits = v_new, updated_at = NOW() WHERE id = p_user_id;

  INSERT INTO credit_logs (user_id, amount, action, description, created_at)
  VALUES (
    p_user_id,
    v_new - COALESCE(v_current, 0),
    'subscription_renewal',
    'Monthly renewal: ' || p_plan_credits || ' plan credits + ' || v_rollover || ' rolled over',
    NOW()
  );

  RETURN v_new;
END;
$$;

-- ─── 7. Grants ────────────────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION grant_daily_credits(UUID)            TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION deduct_credits(UUID, NUMERIC, TEXT, UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION add_credits(UUID, NUMERIC, TEXT, TEXT)    TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION apply_plan_renewal(UUID, NUMERIC)    TO service_role;
