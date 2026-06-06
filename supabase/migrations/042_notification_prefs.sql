-- ── Migration 042: Notification preferences ───────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{
    "build_complete_email": true,
    "deploy_success_email": true,
    "collaborator_joined_email": true,
    "weekly_digest_email": false,
    "marketing_email": false,
    "credit_low_email": true
  }'::jsonb;

COMMENT ON COLUMN profiles.notification_prefs IS
  'Per-user email notification preferences stored as JSONB';
