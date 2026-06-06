-- Migration 023: Workspace credit pool
-- Adds shared credit pools for team workspaces with per-member caps

-- ── workspace_credit_pools ───────────────────────────────────────────────────
-- One pool per team/workspace (linked via team_id)
CREATE TABLE IF NOT EXISTS workspace_credit_pools (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  total_credits int  NOT NULL DEFAULT 0,
  used_credits  int  NOT NULL DEFAULT 0,
  reset_day     int  NOT NULL DEFAULT 1,   -- day of month credits reset (1–28)
  last_reset_at timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id)
);

-- ── workspace_member_caps ────────────────────────────────────────────────────
-- Optional per-member monthly credit cap within the pool
CREATE TABLE IF NOT EXISTS workspace_member_caps (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id     uuid NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  monthly_cap int  NOT NULL DEFAULT 0,   -- 0 = unlimited within pool
  used_this_month int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(team_id, user_id)
);

-- ── visibility column on projects ────────────────────────────────────────────
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'public'
  CHECK (visibility IN ('public', 'workspace', 'private'));

-- Backfill: projects marked is_public=false → workspace, true → public
UPDATE projects SET visibility = CASE WHEN is_public THEN 'public' ELSE 'workspace' END;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE workspace_credit_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_member_caps  ENABLE ROW LEVEL SECURITY;

-- Pool: team members can read, admins can update
CREATE POLICY "team members read pool" ON workspace_credit_pools
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = workspace_credit_pools.team_id
        AND tm.user_id = auth.uid()
    )
  );

CREATE POLICY "team admins update pool" ON workspace_credit_pools
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = workspace_credit_pools.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

-- Caps: team members can read their own cap
CREATE POLICY "members read own cap" ON workspace_member_caps
  FOR SELECT USING (
    user_id = auth.uid() OR
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = workspace_member_caps.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY "team admins manage caps" ON workspace_member_caps
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM team_members tm
      WHERE tm.team_id = workspace_member_caps.team_id
        AND tm.user_id = auth.uid()
        AND tm.role IN ('owner', 'admin')
    )
  );

-- ── deduct_workspace_credits RPC ─────────────────────────────────────────────
-- Called instead of the per-user deduction when a user belongs to a workspace
CREATE OR REPLACE FUNCTION deduct_workspace_credits(
  p_team_id   uuid,
  p_user_id   uuid,
  p_amount    int,
  p_reason    text DEFAULT 'ai_generation'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_pool  workspace_credit_pools%ROWTYPE;
  v_cap   workspace_member_caps%ROWTYPE;
  v_available int;
BEGIN
  -- Lock pool row
  SELECT * INTO v_pool FROM workspace_credit_pools
  WHERE team_id = p_team_id FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No credit pool for workspace');
  END IF;

  -- Check pool balance
  v_available := v_pool.total_credits - v_pool.used_credits;
  IF v_available < p_amount THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Workspace out of credits');
  END IF;

  -- Check per-member cap (if set)
  SELECT * INTO v_cap FROM workspace_member_caps
  WHERE team_id = p_team_id AND user_id = p_user_id;

  IF FOUND AND v_cap.monthly_cap > 0 THEN
    IF (v_cap.used_this_month + p_amount) > v_cap.monthly_cap THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Member monthly cap reached');
    END IF;
    UPDATE workspace_member_caps
    SET used_this_month = used_this_month + p_amount,
        updated_at = now()
    WHERE team_id = p_team_id AND user_id = p_user_id;
  END IF;

  -- Deduct from pool
  UPDATE workspace_credit_pools
  SET used_credits = used_credits + p_amount,
      updated_at = now()
  WHERE team_id = p_team_id;

  -- Log to credit_logs
  INSERT INTO credit_logs (user_id, amount, reason, metadata)
  VALUES (p_user_id, -p_amount, p_reason,
          jsonb_build_object('source', 'workspace_pool', 'team_id', p_team_id));

  RETURN jsonb_build_object('ok', true, 'remaining', v_available - p_amount);
END;
$$;

-- ── add_workspace_credits RPC ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION add_workspace_credits(
  p_team_id uuid,
  p_amount  int
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO workspace_credit_pools (team_id, total_credits)
  VALUES (p_team_id, p_amount)
  ON CONFLICT (team_id) DO UPDATE
    SET total_credits = workspace_credit_pools.total_credits + p_amount,
        updated_at = now();
END;
$$;

-- ── Indexes ──────────────────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_workspace_pools_team ON workspace_credit_pools(team_id);
CREATE INDEX IF NOT EXISTS idx_member_caps_team_user ON workspace_member_caps(team_id, user_id);
CREATE INDEX IF NOT EXISTS idx_projects_visibility ON projects(visibility);
