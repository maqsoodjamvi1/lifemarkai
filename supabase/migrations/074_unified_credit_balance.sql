-- Migration 074: Unified credit balance (Lovable parity)
--
-- Merges the separate Cloud wallet (profiles.cloud_balance_cents, migration 048)
-- and the AI wallet (profiles.cloud_ai_balance_cents, migrations 048/053) into
-- the single fractional credit balance (profiles.credits, NUMERIC(12,2),
-- migration 063). After this migration, Cloud usage and AI-gateway usage debit
-- CREDITS, not cents.
--
-- CONVERSION RATE: 1 credit = 4 cents (CENTS_PER_CREDIT = 4).
--   Rationale: Pro plan is $20/mo for 500 credits → 2000¢ / 500cr = 4¢/credit.
--   The same constant lives in TS as CENTS_PER_CREDIT in lib/credits.ts and
--   gateway/src/index.ts — keep all three in sync.
--
-- Additive only: the cloud_*_balance_cents columns are kept (zeroed + marked
-- deprecated) so old rows/queries don't break; both RPCs keep their exact
-- signatures so existing callers (bill-usage cron, gateway Worker) work
-- unchanged.

-- ── 1. One-time conversion: move wallet cents into credits ────────────────────
-- 4 cents = 1 credit, rounded to 2 dp (matches NUMERIC(12,2) precision).
UPDATE profiles
   SET credits             = credits + ROUND(cloud_balance_cents / 4.0, 2),
       cloud_balance_cents = 0
 WHERE cloud_balance_cents > 0;

-- The AI wallet is debited by debit_ai_balance (redefined below to hit credits),
-- so convert any remaining positive AI-wallet balance the same way.
UPDATE profiles
   SET credits                = credits + ROUND(cloud_ai_balance_cents / 4.0, 2),
       cloud_ai_balance_cents = 0
 WHERE cloud_ai_balance_cents > 0;

COMMENT ON COLUMN profiles.cloud_balance_cents IS
  'DEPRECATED (migration 074): Cloud usage now debits profiles.credits at 4 cents/credit. Kept for backwards compatibility; always 0.';
COMMENT ON COLUMN profiles.cloud_ai_balance_cents IS
  'DEPRECATED (migration 074): AI-gateway usage now debits profiles.credits at 4 cents/credit. Kept for backwards compatibility; always 0.';

-- ── 2. bill_cloud_usage: allowance first, then debit credits ─────────────────
-- Signature unchanged (p_user_id UUID, p_cents INTEGER) RETURNS INTEGER — the
-- daily cron (/api/cloud/bill-usage) keeps calling it exactly as before.
-- The $25/month free allowance (cloud_free_month / cloud_free_used_cents,
-- migration 065) is consumed first; the remainder is converted to credits at
-- 4 cents/credit (ROUND 2 dp) and debited from profiles.credits.
--
-- Return value stays "balance in cents" for the caller's exhaustion check:
-- the remaining credit balance expressed as cents-equivalent (credits × 4).
-- <= 0 means exhausted (pause paid-tier projects); any positive credit
-- balance returns >= 1 so a small fractional balance never pauses projects.
-- Debt floor: -2500 credits (= the original -10000¢ floor) so a runaway loop
-- can't create unbounded debt.
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
  v_credits    NUMERIC;
  v_this_month TEXT := TO_CHAR(NOW() AT TIME ZONE 'utc', 'YYYY-MM');
  v_allowance  CONSTANT INTEGER := 2500;    -- $25/month free Cloud usage
  v_rate       CONSTANT NUMERIC := 4.0;     -- CENTS_PER_CREDIT: 1 credit = 4 cents
  v_floor      CONSTANT NUMERIC := -2500;   -- credits (= -10000 cents, migration 065 policy)
  v_covered    INTEGER;
  v_remainder  INTEGER;
  v_debit      NUMERIC;
BEGIN
  SELECT cloud_free_month, cloud_free_used_cents, credits
    INTO v_free_month, v_free_used, v_credits
    FROM profiles WHERE id = p_user_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 0; END IF;

  -- Reset the free allowance on calendar-month change (UTC)
  IF v_free_month IS DISTINCT FROM v_this_month THEN
    v_free_used := 0;
    v_free_month := v_this_month;
  END IF;

  v_covered   := LEAST(GREATEST(p_cents, 0), GREATEST(v_allowance - v_free_used, 0));
  v_remainder := GREATEST(p_cents, 0) - v_covered;
  v_debit     := ROUND(v_remainder / v_rate, 2);
  v_credits   := GREATEST(v_floor, COALESCE(v_credits, 0) - v_debit);

  UPDATE profiles
     SET cloud_free_month      = v_free_month,
         cloud_free_used_cents = v_free_used + v_covered,
         credits               = v_credits,
         updated_at            = NOW()
   WHERE id = p_user_id;

  -- Audit trail (same pattern as deduct_credits, migration 063)
  IF v_debit > 0 THEN
    INSERT INTO credit_logs (user_id, amount, action, description, created_at)
    VALUES (
      p_user_id,
      -v_debit,
      'cloud_usage',
      'Lifemark Cloud usage: ' || v_remainder || '¢ beyond free allowance (4¢/credit)',
      NOW()
    );
  END IF;

  -- Cents-equivalent of the remaining credit balance (see header comment).
  IF v_credits > 0 THEN
    RETURN GREATEST(1, ROUND(v_credits * v_rate))::INTEGER;
  END IF;
  RETURN FLOOR(v_credits * v_rate)::INTEGER;
END;
$$;

-- Service-role only (called by the billing cron) — same policy as migration 065
REVOKE ALL ON FUNCTION bill_cloud_usage(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION bill_cloud_usage(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION bill_cloud_usage(UUID, INTEGER) FROM authenticated;

-- ── 3. debit_ai_balance: debit credits instead of the AI wallet ──────────────
-- Signature unchanged (p_user_id UUID, p_cents INTEGER) RETURNS void — the
-- AI Gateway Worker keeps calling it exactly as before.
CREATE OR REPLACE FUNCTION debit_ai_balance(
  p_user_id UUID,
  p_cents    INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rate  CONSTANT NUMERIC := 4.0;    -- CENTS_PER_CREDIT: 1 credit = 4 cents
  v_floor CONSTANT NUMERIC := -2500;  -- credits (= -10000 cents, migration 053 policy)
  v_debit NUMERIC := ROUND(GREATEST(p_cents, 0) / v_rate, 2);
BEGIN
  IF v_debit <= 0 THEN RETURN; END IF;

  UPDATE profiles
     SET credits    = GREATEST(v_floor, credits - v_debit),
         updated_at = NOW()
   WHERE id = p_user_id;

  INSERT INTO credit_logs (user_id, amount, action, description, created_at)
  VALUES (
    p_user_id,
    -v_debit,
    'cloud_ai_usage',
    'AI gateway usage: ' || p_cents || '¢ (4¢/credit)',
    NOW()
  );
END;
$$;

-- Only the service role should call this function — same policy as migration 053
REVOKE ALL ON FUNCTION debit_ai_balance(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION debit_ai_balance(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION debit_ai_balance(UUID, INTEGER) FROM authenticated;
