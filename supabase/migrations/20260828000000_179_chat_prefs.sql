-- Migration 179: chat panel UI preferences (Lovable parity, "toggleable
-- off in account settings" for follow-up suggestion chips).
--
-- Same shape as 042's notification_prefs, but kept in its own column
-- rather than folded into that one: notification_prefs is specifically
-- "which emails do I receive" and this is "how does the chat panel behave
-- for me" — different concerns a maintainer would reasonably expect to
-- find in different places.
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS chat_prefs JSONB NOT NULL DEFAULT '{
    "suggestion_chips_enabled": true
  }'::jsonb;

COMMENT ON COLUMN profiles.chat_prefs IS
  'Per-user chat panel UI preferences (e.g. follow-up suggestion chips), stored as JSONB';
