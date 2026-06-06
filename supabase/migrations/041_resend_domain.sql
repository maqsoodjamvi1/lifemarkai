-- ── Migration 041: Resend custom email domain columns ─────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS resend_domain_id     TEXT,
  ADD COLUMN IF NOT EXISTS resend_domain_name   TEXT,
  ADD COLUMN IF NOT EXISTS resend_domain_status TEXT;

COMMENT ON COLUMN profiles.resend_domain_id     IS 'Resend domain object ID (dom_xxx)';
COMMENT ON COLUMN profiles.resend_domain_name   IS 'The verified sending domain, e.g. mail.myapp.com';
COMMENT ON COLUMN profiles.resend_domain_status IS 'Last known Resend verification status: not_started | pending | verified | failure';
