-- Migration 065: Cloud usage billing (Lovable parity)
--
-- Every workspace gets $25/month of free Cloud usage; beyond that, usage is
-- debited from the Cloud wallet (profiles.cloud_balance_cents, migration 048).
-- The daily cron /api/cloud/bill-usage records each project's instance cost
-- and calls bill_cloud_usage(); when the wallet is exhausted, projects pause.

-- ── Free monthly allowance tracking ──────────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cloud_free_month TEXT;                       -- 'YYYY-MM' (UTC)
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS cloud_free_used_cents INTEGER NOT NULL DEFAULT 0;

-- ── bill_cloud_usage ─────────────────────────────────────────────────────────
-- Applies the monthly free allowance first, then debits the Cloud wallet.
-- Returns the resulting wallet balance (cents). Floor: -10000 (same policy as
-- debit_ai_balance) so a runaway loop can't create unbounded debt.
CREATE OR REPLACE FUNCTION bill_cloud_usage(
  p_user_id UUID,
  p_cents   INTEGER
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_free_month TEXT;
  v_free_used  INTEGER;
  v_balance    INTEGER;
  v_this_month TEXT := TO_CHAR(NOW() AT TIME ZONE 'utc', 'YYYY-MM');
  v_allowance  CONSTANT INTEGER := 2500;  -- $25/month free Cloud usage
  v_covered    INTEGER;
  v_remainder  INTEGER;
BEGIN
  SELECT cloud_free_month, cloud_free_used_cents, cloud_balance_cents
    INTO v_free_month, v_free_used, v_balance
    FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Reset the free allowance on calendar-month change (UTC)
  IF v_free_month IS DISTINCT FROM v_this_month THEN
    v_free_used := 0;
    v_free_month := v_this_month;
  END IF;

  v_covered   := LEAST(GREATEST(p_cents, 0), GREATEST(v_allowance - v_free_used, 0));
  v_remainder := GREATEST(p_cents, 0) - v_covered;
  v_balance   := GREATEST(-10000, v_balance - v_remainder);

  UPDATE profiles
     SET cloud_free_month      = v_free_month,
         cloud_free_used_cents = v_free_used + v_covered,
         cloud_balance_cents   = v_balance,
         updated_at            = NOW()
   WHERE id = p_user_id;

  RETURN v_balance;
END;
$$;

-- Service-role only (called by the billing cron)
REVOKE ALL ON FUNCTION bill_cloud_usage(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION bill_cloud_usage(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION bill_cloud_usage(UUID, INTEGER) FROM authenticated;
