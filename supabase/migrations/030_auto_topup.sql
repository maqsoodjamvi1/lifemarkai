-- Auto top-up: let users automatically recharge credits when their balance falls below a threshold

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS auto_topup_enabled      boolean   NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_topup_threshold     integer   NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS auto_topup_amount        integer   NOT NULL DEFAULT 200,
  ADD COLUMN IF NOT EXISTS auto_topup_pm_id         text,         -- Stripe PaymentMethod ID for off-session charging
  ADD COLUMN IF NOT EXISTS auto_topup_last_triggered_at timestamptz; -- prevent double-charging

COMMENT ON COLUMN profiles.auto_topup_enabled  IS 'Automatically purchase credits when balance falls below threshold';
COMMENT ON COLUMN profiles.auto_topup_threshold IS 'Credit balance that triggers auto top-up';
COMMENT ON COLUMN profiles.auto_topup_amount    IS 'Credits to purchase when auto top-up fires (must match a CREDIT_PACK key)';
COMMENT ON COLUMN profiles.auto_topup_pm_id     IS 'Stripe PaymentMethod ID saved for off-session charging';
