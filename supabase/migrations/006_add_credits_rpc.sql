-- Migration 006: Add add_credits RPC + supporting functions for billing webhook

-- ─── add_credits ─────────────────────────────────────────────────────────────
-- Atomically adds credits to a user's profile and logs the transaction.
DROP FUNCTION IF EXISTS add_credits(UUID, INTEGER, TEXT, TEXT);
CREATE FUNCTION add_credits(
  p_user_id    UUID,
  p_amount     INTEGER,
  p_action     TEXT DEFAULT 'credit_purchase',
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

-- ─── add_team_credits ────────────────────────────────────────────────────────
-- Atomically adds credits to a team's shared pool.
DROP FUNCTION IF EXISTS add_team_credits(UUID, INTEGER, TEXT);
CREATE FUNCTION add_team_credits(
  p_team_id    UUID,
  p_amount     INTEGER,
  p_description TEXT DEFAULT 'Credit pack purchase'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE teams
  SET credits    = credits + p_amount,
      updated_at = NOW()
  WHERE id = p_team_id;

  -- Log to credit_logs for audit (team-level entry — no user_id)
  -- We store team_id in project_id column as a reference until a dedicated column is added
  INSERT INTO credit_logs (user_id, amount, action, description, created_at)
  SELECT owner_id, p_amount, 'team_credit_purchase', p_description, NOW()
  FROM team_members
  WHERE team_id = p_team_id AND role = 'owner'
  LIMIT 1;
END;
$$;

-- ─── update_member_credit_usage ──────────────────────────────────────────────
-- Resets monthly credit_used counters. Run on the 1st of each month via pg_cron.
DROP FUNCTION IF EXISTS reset_monthly_credit_usage();
CREATE FUNCTION reset_monthly_credit_usage()
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE team_members
  SET credits_used = 0,
      updated_at   = NOW()
  WHERE accepted_at IS NOT NULL;
END;
$$;

-- ─── Grant execute to authenticated users ────────────────────────────────────
GRANT EXECUTE ON FUNCTION add_credits(UUID, INTEGER, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION add_team_credits(UUID, INTEGER, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION reset_monthly_credit_usage() TO service_role;

-- ─── Ensure credit_logs has correct columns ──────────────────────────────────
-- Add description column if it doesn't already exist (migration 001 may not have it)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'credit_logs' AND column_name = 'description'
  ) THEN
    ALTER TABLE credit_logs ADD COLUMN description TEXT;
  END IF;
END;
$$;
