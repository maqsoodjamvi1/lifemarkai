-- Migration 059: two RPC fixes found by code↔schema audit
--
-- 1. increment_skill_use — called by /api/skills on every skill application,
--    but was never defined in any migration, so workspace-skill use counts
--    never incremented (the route's JS "fallback" was also broken).
--
-- 2. add_team_credits (006) — its body does `SELECT owner_id FROM team_members`,
--    but team_members has no owner_id column (it's user_id). PL/pgSQL bodies
--    aren't validated until first execution, so this exploded only when a team
--    credit-pack purchase hit the Stripe webhook.

-- ── 1. increment_skill_use ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION increment_skill_use(skill_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE workspace_skills
  SET use_count = use_count + 1,
      updated_at = now()
  WHERE id = skill_id
    AND user_id = auth.uid();  -- only the owner can bump their own skill
$$;

REVOKE ALL ON FUNCTION increment_skill_use(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION increment_skill_use(uuid) TO authenticated, service_role;

-- ── 2. add_team_credits — owner_id → user_id ─────────────────────────────────
CREATE OR REPLACE FUNCTION add_team_credits(
  p_team_id    UUID,
  p_amount     INTEGER,
  p_description TEXT DEFAULT 'Credit pack purchase'
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE teams
  SET credits    = credits + p_amount,
      updated_at = NOW()
  WHERE id = p_team_id;

  -- Log to credit_logs for audit, attributed to the team owner
  INSERT INTO credit_logs (user_id, amount, action, description, created_at)
  SELECT user_id, p_amount, 'team_credit_purchase', p_description, NOW()
  FROM team_members
  WHERE team_id = p_team_id AND role = 'owner'
  LIMIT 1;
END;
$$;
