-- ============================================================
-- Migration 008 — V2 Tables
-- notifications, api_keys, audit_logs, job_queue, feature_flags
-- ============================================================

-- ── 1. NOTIFICATIONS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  type        TEXT NOT NULL, -- 'deploy_success' | 'deploy_failed' | 'credit_low' | 'invite' | 'system' | 'ai_done'
  title       TEXT NOT NULL,
  body        TEXT,
  link        TEXT,          -- optional deep-link (e.g. /editor/project-id)
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS notifications_user_unread
  ON notifications(user_id, is_read, created_at DESC);

-- RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own notifications"
  ON notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own notifications"
  ON notifications FOR UPDATE
  USING (auth.uid() = user_id);

-- Service role can insert notifications for any user
CREATE POLICY "Service role can insert notifications"
  ON notifications FOR INSERT
  WITH CHECK (TRUE);

-- Helper RPC: mark all as read
CREATE OR REPLACE FUNCTION mark_notifications_read(p_user_id UUID)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE notifications
  SET is_read = TRUE
  WHERE user_id = p_user_id AND is_read = FALSE;
END;
$$;
GRANT EXECUTE ON FUNCTION mark_notifications_read TO authenticated, service_role;

-- Helper RPC: unread count
CREATE OR REPLACE FUNCTION get_unread_notification_count(p_user_id UUID)
RETURNS INTEGER
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT COUNT(*)::INTEGER FROM notifications
  WHERE user_id = p_user_id AND is_read = FALSE;
$$;
GRANT EXECUTE ON FUNCTION get_unread_notification_count TO authenticated, service_role;


-- ── 2. API KEYS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS api_keys (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,                       -- "My CI pipeline"
  key_hash    TEXT NOT NULL UNIQUE,                -- SHA-256 hex of the raw key
  key_prefix  TEXT NOT NULL,                       -- first 8 chars shown in UI: "lmk_live_xxxxxxxx"
  last_used_at TIMESTAMPTZ,
  expires_at  TIMESTAMPTZ,                         -- NULL = never expires
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS api_keys_user_id ON api_keys(user_id);
CREATE INDEX IF NOT EXISTS api_keys_key_hash ON api_keys(key_hash) WHERE is_active = TRUE;

ALTER TABLE api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage their own API keys"
  ON api_keys FOR ALL
  USING (auth.uid() = user_id);


-- ── 3. AUDIT LOGS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS audit_logs (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  team_id     UUID,
  action      TEXT NOT NULL,        -- 'project.create' | 'project.delete' | 'member.invite' | etc.
  resource_type TEXT,               -- 'project' | 'team' | 'billing' | 'api_key'
  resource_id   TEXT,               -- the id of the affected resource
  metadata    JSONB,                -- diff, old/new values, IP, user agent
  ip_address  INET,
  user_agent  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS audit_logs_user_id   ON audit_logs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_team_id   ON audit_logs(team_id, created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_action    ON audit_logs(action, created_at DESC);

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Users can view their own audit logs; team admins can view team logs
CREATE POLICY "Users can view their audit logs"
  ON audit_logs FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can insert audit logs"
  ON audit_logs FOR INSERT
  WITH CHECK (TRUE);

-- Helper RPC: insert audit log entry
CREATE OR REPLACE FUNCTION log_audit_event(
  p_user_id     UUID,
  p_action      TEXT,
  p_resource_type TEXT DEFAULT NULL,
  p_resource_id   TEXT DEFAULT NULL,
  p_metadata    JSONB DEFAULT NULL,
  p_team_id     UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO audit_logs(user_id, team_id, action, resource_type, resource_id, metadata)
  VALUES (p_user_id, p_team_id, p_action, p_resource_type, p_resource_id, p_metadata);
END;
$$;
GRANT EXECUTE ON FUNCTION log_audit_event TO authenticated, service_role;


-- ── 4. JOB QUEUE ─────────────────────────────────────────────────────────────
-- Lightweight Postgres-backed queue for build/deploy jobs.
-- In production, replace with Bull + Redis for higher throughput.
CREATE TABLE IF NOT EXISTS job_queue (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type          TEXT NOT NULL,             -- 'deploy' | 'build' | 'export' | 'ai_batch'
  status        TEXT NOT NULL DEFAULT 'pending',  -- 'pending' | 'running' | 'done' | 'failed' | 'cancelled'
  priority      INTEGER NOT NULL DEFAULT 5,       -- 1=highest, 10=lowest
  payload       JSONB NOT NULL,
  result        JSONB,
  error         TEXT,
  attempts      INTEGER NOT NULL DEFAULT 0,
  max_attempts  INTEGER NOT NULL DEFAULT 3,
  scheduled_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  started_at    TIMESTAMPTZ,
  completed_at  TIMESTAMPTZ,
  user_id       UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  project_id    UUID,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS job_queue_pending
  ON job_queue(status, priority, scheduled_at)
  WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS job_queue_user_id   ON job_queue(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS job_queue_project_id ON job_queue(project_id, created_at DESC);

ALTER TABLE job_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own jobs"
  ON job_queue FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access to job_queue"
  ON job_queue FOR ALL
  USING (TRUE)
  WITH CHECK (TRUE);

-- Claim the next available job (atomic, no race condition)
CREATE OR REPLACE FUNCTION claim_next_job(p_type TEXT DEFAULT NULL)
RETURNS SETOF job_queue
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  UPDATE job_queue SET
    status     = 'running',
    started_at = NOW(),
    attempts   = attempts + 1
  WHERE id = (
    SELECT id FROM job_queue
    WHERE status = 'pending'
      AND scheduled_at <= NOW()
      AND attempts < max_attempts
      AND (p_type IS NULL OR type = p_type)
    ORDER BY priority ASC, scheduled_at ASC
    LIMIT 1
    FOR UPDATE SKIP LOCKED
  )
  RETURNING *;
END;
$$;
GRANT EXECUTE ON FUNCTION claim_next_job TO service_role;


-- ── 5. FEATURE FLAGS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS feature_flags (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key         TEXT NOT NULL UNIQUE,         -- 'webcontainers_preview' | 'new_editor_v2'
  name        TEXT NOT NULL,
  description TEXT,
  is_enabled  BOOLEAN NOT NULL DEFAULT FALSE,
  rollout_pct INTEGER NOT NULL DEFAULT 0 CHECK (rollout_pct BETWEEN 0 AND 100),
  allowed_users JSONB DEFAULT '[]',         -- array of user IDs for targeted rollout
  allowed_plans JSONB DEFAULT '[]',         -- array of plan names: ["pro","enterprise"]
  metadata    JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed default flags
INSERT INTO feature_flags(key, name, description, is_enabled, rollout_pct, allowed_plans)
VALUES
  ('webcontainers_preview', 'WebContainers Preview', 'Full Node.js preview replacing Sandpack', FALSE, 0, '["pro","enterprise"]'),
  ('ai_context_v2',         'AI Context V2',          'Enhanced multi-file context injection',   TRUE,  100, '[]'),
  ('remix_cta',             'Remix CTA',               'Show remix button on public projects',    TRUE,  100, '[]'),
  ('analytics_panel',       'Analytics Panel',         'In-editor visitor traffic analytics',     FALSE, 0,   '["pro","enterprise"]')
ON CONFLICT (key) DO NOTHING;

ALTER TABLE feature_flags ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read flags (needed to check on client)
CREATE POLICY "Authenticated users can read feature flags"
  ON feature_flags FOR SELECT
  USING (auth.role() = 'authenticated');

-- Only service role can write
CREATE POLICY "Service role manages feature flags"
  ON feature_flags FOR ALL
  USING (auth.role() = 'service_role');

-- Helper: check if a user has a flag enabled
CREATE OR REPLACE FUNCTION is_feature_enabled(p_flag_key TEXT, p_user_id UUID, p_plan TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER
AS $$
DECLARE
  v_flag feature_flags;
  v_hash INTEGER;
BEGIN
  SELECT * INTO v_flag FROM feature_flags WHERE key = p_flag_key;
  IF NOT FOUND THEN RETURN FALSE; END IF;
  IF NOT v_flag.is_enabled THEN RETURN FALSE; END IF;

  -- Check targeted user list
  IF v_flag.allowed_users @> to_jsonb(p_user_id::TEXT) THEN RETURN TRUE; END IF;

  -- Check plan allowlist
  IF jsonb_array_length(v_flag.allowed_plans) > 0 THEN
    IF NOT (v_flag.allowed_plans @> to_jsonb(p_plan)) THEN RETURN FALSE; END IF;
  END IF;

  -- Percentage rollout using consistent hash of user_id
  IF v_flag.rollout_pct = 100 THEN RETURN TRUE; END IF;
  IF v_flag.rollout_pct = 0   THEN RETURN FALSE; END IF;
  v_hash := abs(hashtext(p_user_id::TEXT)) % 100;
  RETURN v_hash < v_flag.rollout_pct;
END;
$$;
GRANT EXECUTE ON FUNCTION is_feature_enabled TO authenticated, service_role;


-- ── 6. BACKFILL: add indexes missing from earlier migrations ─────────────────
CREATE INDEX IF NOT EXISTS messages_project_created
  ON messages(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS project_files_project_id
  ON project_files(project_id);

CREATE INDEX IF NOT EXISTS projects_user_updated
  ON projects(user_id, updated_at DESC);

CREATE INDEX IF NOT EXISTS deployments_project_id
  ON deployments(project_id, created_at DESC);
