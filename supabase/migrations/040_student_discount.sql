-- ── Migration 040: Student discount tracking ──────────────────────────────────
-- Tracks whether a user has already claimed the 50% student discount.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS student_discount_used BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN profiles.student_discount_used IS
  'TRUE once the one-time 50% student discount has been applied via a .edu email.';
