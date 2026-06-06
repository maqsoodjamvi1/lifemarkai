-- Referral program: each user gets a unique code; track who referred whom

-- Add referral_code and referred_by to profiles
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE DEFAULT substr(md5(gen_random_uuid()::text), 1, 8),
  ADD COLUMN IF NOT EXISTS referred_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS referral_credits_earned INT NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_profiles_referral_code ON profiles(referral_code);

-- Track individual referral events
CREATE TABLE IF NOT EXISTS referrals (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  referrer_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  referee_id   UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','credited','expired')),
  credits_given INT NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  credited_at  TIMESTAMPTZ,
  UNIQUE(referee_id)  -- each new user can only be referred once
);

ALTER TABLE referrals ENABLE ROW LEVEL SECURITY;

-- Referrers can see their own referrals
CREATE POLICY "referrals_referrer_select" ON referrals
  FOR SELECT USING (referrer_id = auth.uid());

-- Admin inserts only (via service role)
CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id);
CREATE INDEX IF NOT EXISTS idx_referrals_status   ON referrals(status);
