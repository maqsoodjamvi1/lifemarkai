-- Migration 048: Lifemark Cloud
--
-- Mirrors Lovable Cloud — a managed backend bundle (DB + auth + storage + edge
-- functions + AI + secrets + daily backups) on top of Supabase. This migration
-- adds per-project cloud configuration so projects can opt into hosted mode.

-- ── projects: cloud opt-in fields ────────────────────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS cloud_enabled      BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS cloud_region       TEXT,         -- 'americas' | 'europe' | 'asia-pacific'
  ADD COLUMN IF NOT EXISTS cloud_instance     TEXT NOT NULL DEFAULT 'tiny', -- tiny | mini | small | medium | large
  ADD COLUMN IF NOT EXISTS cloud_provisioned_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cloud_status       TEXT NOT NULL DEFAULT 'inactive'; -- inactive | provisioning | active | failed | paused

COMMENT ON COLUMN projects.cloud_enabled IS
  'When true, project uses Lifemark Cloud managed backend (DB/auth/storage/edge/AI/secrets/backups).';
COMMENT ON COLUMN projects.cloud_region IS
  'Hosting region — locked once provisioning is active.';
COMMENT ON COLUMN projects.cloud_instance IS
  'Instance tier: tiny (free) | mini | small | medium | large.';

-- ── workspace-level cloud preferences ────────────────────────────────────────
ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS cloud_default_region TEXT,                -- preferred region for new projects
  ADD COLUMN IF NOT EXISTS cloud_balance_cents  INTEGER NOT NULL DEFAULT 0,  -- usage-based wallet
  ADD COLUMN IF NOT EXISTS cloud_ai_balance_cents INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN profiles.cloud_balance_cents IS 'Workspace Cloud wallet balance (cents). Pays for hosted-app usage beyond free tier.';
COMMENT ON COLUMN profiles.cloud_ai_balance_cents IS 'Workspace AI wallet balance (cents). Pays for built-in AI inside deployed apps.';

-- ── lifemark_cloud_usage: per-project daily usage records ────────────────────
CREATE TABLE IF NOT EXISTS lifemark_cloud_usage (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id   UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  recorded_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Usage breakdown by category (cents)
  db_server_cents      INTEGER NOT NULL DEFAULT 0,
  db_storage_cents     INTEGER NOT NULL DEFAULT 0,
  compute_cents        INTEGER NOT NULL DEFAULT 0,
  storage_cents        INTEGER NOT NULL DEFAULT 0,
  live_updates_cents   INTEGER NOT NULL DEFAULT 0,
  network_cents        INTEGER NOT NULL DEFAULT 0,
  ai_cents             INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS lifemark_cloud_usage_project ON lifemark_cloud_usage (project_id, recorded_at DESC);

ALTER TABLE lifemark_cloud_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "cloud_usage_owner_select" ON lifemark_cloud_usage;
CREATE POLICY "cloud_usage_owner_select" ON lifemark_cloud_usage
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- ── lifemark_cloud_auto_backups: scheduled daily snapshots ───────────────────
-- Logs which projects had auto-backups run, so the cron job can be idempotent.
CREATE TABLE IF NOT EXISTS lifemark_cloud_auto_backups (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id       UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  snapshot_id      UUID REFERENCES project_snapshots(id) ON DELETE SET NULL,
  run_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  status           TEXT NOT NULL DEFAULT 'ok',  -- ok | failed | skipped
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(project_id, run_date)
);

CREATE INDEX IF NOT EXISTS lifemark_cloud_backups_project ON lifemark_cloud_auto_backups (project_id, run_date DESC);
ALTER TABLE lifemark_cloud_auto_backups ENABLE ROW LEVEL SECURITY;

-- ── Instance tier metadata (used by upgrade flow) ────────────────────────────
-- Static lookup; the API consults this to validate upgrade requests.
CREATE TABLE IF NOT EXISTS lifemark_cloud_instances (
  tier         TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  monthly_cents INTEGER NOT NULL,
  ram_mb       INTEGER NOT NULL,
  cpu_units    INTEGER NOT NULL,
  description  TEXT NOT NULL
);

INSERT INTO lifemark_cloud_instances (tier, display_name, monthly_cents, ram_mb, cpu_units, description) VALUES
  ('tiny',    'Tiny',    0,    512,  1, 'Great for trying things out (Free tier)'),
  ('mini',    'Mini',    1000, 1024, 1, 'Reliable for early projects'),
  ('small',   'Small',   2500, 2048, 2, 'Room to grow with your app'),
  ('medium',  'Medium',  6000, 4096, 4, 'Steady choice for regular use'),
  ('large',   'Large',   15000, 8192, 8, 'Confident option for higher demand')
ON CONFLICT (tier) DO NOTHING;
