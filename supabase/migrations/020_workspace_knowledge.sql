-- Migration 020: Workspace Knowledge
-- Adds workspace_knowledge column to profiles for cross-project AI context

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS workspace_knowledge TEXT DEFAULT NULL;

COMMENT ON COLUMN profiles.workspace_knowledge IS
  'Shared rules/conventions injected as AI system context into every project chat for this user';
