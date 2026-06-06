-- Migration 061: Cloud tool permissions (Allow / Ask / Never)
-- Mirrors Lovable Cloud permission controls for AI-driven backend ops.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS cloud_tool_permissions JSONB NOT NULL DEFAULT '{
    "database": "ask",
    "storage": "ask",
    "edge_functions": "ask",
    "secrets": "ask",
    "ai": "ask",
    "deploy": "ask"
  }'::jsonb;

COMMENT ON COLUMN profiles.cloud_tool_permissions IS
  'Per-workspace AI permission for Lifemark Cloud tools: allow | ask | never.';
