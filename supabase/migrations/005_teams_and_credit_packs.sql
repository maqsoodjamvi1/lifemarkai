-- ============================================================
-- Migration 005: Teams, Credit Packs, Credit Transfers
-- ============================================================

-- ── Teams ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS teams (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  slug          TEXT UNIQUE NOT NULL,
  owner_id      UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  plan          TEXT NOT NULL DEFAULT 'team' CHECK (plan IN ('team', 'enterprise')),
  credits       INTEGER NOT NULL DEFAULT 0,          -- shared pool
  max_members   INTEGER NOT NULL DEFAULT 10,
  avatar_url    TEXT,
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

CREATE TRIGGER update_teams_updated_at
  BEFORE UPDATE ON teams
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ── Team Members ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS team_members (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id          UUID NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id          UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role             TEXT NOT NULL DEFAULT 'member'
                   CHECK (role IN ('owner', 'admin', 'member', 'viewer')),
  credit_allowance INTEGER DEFAULT NULL,   -- NULL = unlimited from pool
  credits_used     INTEGER NOT NULL DEFAULT 0,
  invited_by       UUID REFERENCES profiles(id) ON DELETE SET NULL,
  invited_email    TEXT,
  accepted_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (team_id, user_id)
);

-- ── Credit Packs (one-time purchases) ────────────────────────
CREATE TABLE IF NOT EXISTS credit_packs (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 UUID REFERENCES profiles(id) ON DELETE CASCADE,
  team_id                 UUID REFERENCES teams(id)   ON DELETE CASCADE,
  amount                  INTEGER NOT NULL,            -- credits added
  price_cents             INTEGER NOT NULL,            -- USD cents paid
  stripe_payment_intent_id TEXT UNIQUE,
  stripe_session_id       TEXT UNIQUE,
  status                  TEXT NOT NULL DEFAULT 'pending'
                          CHECK (status IN ('pending', 'paid', 'failed', 'refunded')),
  pack_key                TEXT NOT NULL,               -- '50','200','500','1000','5000'
  created_at              TIMESTAMPTZ DEFAULT NOW()
);

-- ── Credit Transfers ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS credit_transfers (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id  UUID REFERENCES profiles(id) ON DELETE SET NULL,
  from_team_id  UUID REFERENCES teams(id)   ON DELETE SET NULL,
  to_user_id    UUID REFERENCES profiles(id) ON DELETE SET NULL,
  to_team_id    UUID REFERENCES teams(id)   ON DELETE SET NULL,
  amount        INTEGER NOT NULL CHECK (amount > 0),
  note          TEXT,
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ── Profile extra columns ────────────────────────────────────
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS current_team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

-- ── projects: team visibility ─────────────────────────────────
ALTER TABLE projects ADD COLUMN IF NOT EXISTS team_id UUID REFERENCES teams(id) ON DELETE SET NULL;

-- ── RLS ──────────────────────────────────────────────────────
ALTER TABLE teams         ENABLE ROW LEVEL SECURITY;
ALTER TABLE team_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_packs  ENABLE ROW LEVEL SECURITY;
ALTER TABLE credit_transfers ENABLE ROW LEVEL SECURITY;

-- teams: owner + members can see their team
CREATE POLICY "teams_member_select" ON teams FOR SELECT
  USING (
    owner_id = auth.uid() OR
    id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid() AND accepted_at IS NOT NULL)
  );

CREATE POLICY "teams_owner_all" ON teams FOR ALL
  USING (owner_id = auth.uid());

-- team_members: visible to team members
CREATE POLICY "team_members_select" ON team_members FOR SELECT
  USING (
    user_id = auth.uid() OR
    team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid() AND accepted_at IS NOT NULL)
  );

CREATE POLICY "team_members_owner_admin" ON team_members FOR ALL
  USING (
    team_id IN (
      SELECT id FROM teams WHERE owner_id = auth.uid()
      UNION
      SELECT team_id FROM team_members WHERE user_id = auth.uid() AND role IN ('owner','admin') AND accepted_at IS NOT NULL
    )
  );

CREATE POLICY "team_members_self_accept" ON team_members FOR UPDATE
  USING (user_id = auth.uid());

-- credit_packs: own records only
CREATE POLICY "credit_packs_select" ON credit_packs FOR SELECT
  USING (user_id = auth.uid() OR team_id IN (
    SELECT team_id FROM team_members WHERE user_id = auth.uid() AND accepted_at IS NOT NULL
  ));

-- credit_transfers: own transfers
CREATE POLICY "credit_transfers_select" ON credit_transfers FOR SELECT
  USING (
    from_user_id = auth.uid() OR to_user_id = auth.uid() OR
    from_team_id IN (SELECT team_id FROM team_members WHERE user_id = auth.uid() AND accepted_at IS NOT NULL) OR
    to_team_id   IN (SELECT team_id FROM team_members WHERE user_id = auth.uid() AND accepted_at IS NOT NULL)
  );

-- ── Indexes ──────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_team_members_team_id  ON team_members(team_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user_id  ON team_members(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_packs_user_id  ON credit_packs(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_packs_team_id  ON credit_packs(team_id);
CREATE INDEX IF NOT EXISTS idx_projects_team_id      ON projects(team_id);

-- ── Helper: create team with owner as first member ───────────
CREATE OR REPLACE FUNCTION create_team(
  p_name TEXT,
  p_slug TEXT,
  p_owner_id UUID
) RETURNS UUID LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_team_id UUID;
BEGIN
  INSERT INTO teams (name, slug, owner_id)
  VALUES (p_name, p_slug, p_owner_id)
  RETURNING id INTO v_team_id;

  INSERT INTO team_members (team_id, user_id, role, accepted_at)
  VALUES (v_team_id, p_owner_id, 'owner', NOW());

  RETURN v_team_id;
END;
$$;

-- ── Helper: deduct from team pool ────────────────────────────
CREATE OR REPLACE FUNCTION deduct_team_credits(
  p_team_id UUID,
  p_user_id UUID,
  p_amount   INTEGER,
  p_action   TEXT,
  p_project_id UUID DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_pool       INTEGER;
  v_allowance  INTEGER;
  v_used       INTEGER;
BEGIN
  -- Check pool balance
  SELECT credits INTO v_pool FROM teams WHERE id = p_team_id FOR UPDATE;
  IF v_pool IS NULL OR v_pool < p_amount THEN RETURN FALSE; END IF;

  -- Check per-member allowance (NULL = unlimited)
  SELECT credit_allowance, credits_used INTO v_allowance, v_used
  FROM team_members WHERE team_id = p_team_id AND user_id = p_user_id;

  IF v_allowance IS NOT NULL AND (v_used + p_amount) > v_allowance THEN
    RETURN FALSE;
  END IF;

  -- Deduct from pool
  UPDATE teams SET credits = credits - p_amount, updated_at = NOW()
  WHERE id = p_team_id;

  -- Track member usage
  UPDATE team_members SET credits_used = credits_used + p_amount
  WHERE team_id = p_team_id AND user_id = p_user_id;

  -- Log it
  INSERT INTO credit_logs (user_id, amount, action, project_id, description)
  VALUES (p_user_id, -p_amount, p_action, p_project_id, 'Team pool: ' || p_team_id);

  RETURN TRUE;
END;
$$;

-- ── Helper: transfer credits user→team or user→user ──────────
CREATE OR REPLACE FUNCTION transfer_credits(
  p_from_user_id UUID,
  p_to_user_id   UUID DEFAULT NULL,
  p_to_team_id   UUID DEFAULT NULL,
  p_amount       INTEGER DEFAULT 0,
  p_note         TEXT DEFAULT NULL
) RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_bal INTEGER;
BEGIN
  IF p_amount <= 0 THEN RETURN FALSE; END IF;

  -- Lock and check sender balance
  SELECT credits INTO v_bal FROM profiles WHERE id = p_from_user_id FOR UPDATE;
  IF v_bal < p_amount THEN RETURN FALSE; END IF;

  -- Deduct from sender
  UPDATE profiles SET credits = credits - p_amount, updated_at = NOW()
  WHERE id = p_from_user_id;

  -- Credit to user or team
  IF p_to_user_id IS NOT NULL THEN
    UPDATE profiles SET credits = credits + p_amount, updated_at = NOW()
    WHERE id = p_to_user_id;
  ELSIF p_to_team_id IS NOT NULL THEN
    UPDATE teams SET credits = credits + p_amount, updated_at = NOW()
    WHERE id = p_to_team_id;
  ELSE
    RETURN FALSE;
  END IF;

  -- Record transfer
  INSERT INTO credit_transfers (from_user_id, to_user_id, to_team_id, amount, note)
  VALUES (p_from_user_id, p_to_user_id, p_to_team_id, p_amount, p_note);

  -- Log for sender
  INSERT INTO credit_logs (user_id, amount, action, description)
  VALUES (p_from_user_id, -p_amount, 'credit_transfer',
          COALESCE(p_note, 'Transferred to ' || COALESCE(p_to_user_id::text, p_to_team_id::text)));

  RETURN TRUE;
END;
$$;
