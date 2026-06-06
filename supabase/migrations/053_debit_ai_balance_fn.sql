-- Migration 053: debit_ai_balance RPC
--
-- Called by the AI Gateway Worker after each inference request.
-- Atomically debits the workspace AI balance (cloud_ai_balance_cents on profiles).
-- Uses SECURITY DEFINER + service-role caller — never exposed to the browser.

CREATE OR REPLACE FUNCTION debit_ai_balance(
  p_user_id UUID,
  p_cents    INTEGER
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Clamp to 0 — we allow going slightly negative (credits can be topped up later)
  -- but don't want unbounded debt from a runaway loop.
  UPDATE profiles
  SET cloud_ai_balance_cents = GREATEST(-10000, cloud_ai_balance_cents - p_cents)
  WHERE id = p_user_id;
END;
$$;

-- Only the service role should call this function
REVOKE ALL ON FUNCTION debit_ai_balance(UUID, INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION debit_ai_balance(UUID, INTEGER) FROM anon;
REVOKE ALL ON FUNCTION debit_ai_balance(UUID, INTEGER) FROM authenticated;
