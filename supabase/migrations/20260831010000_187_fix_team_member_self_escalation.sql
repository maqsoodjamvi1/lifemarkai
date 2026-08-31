-- Migration 187: close a privilege-escalation hole in team_members.
--
-- 005_teams_and_credit_packs.sql added:
--   CREATE POLICY "team_members_self_accept" ON team_members FOR UPDATE
--     USING (user_id = auth.uid());
-- with no WITH CHECK clause. Postgres RLS defaults an omitted WITH CHECK to
-- the same expression as USING, and that expression only constrains WHICH
-- ROW can be touched (any row where you are the member) — not which COLUMNS
-- may change. Combined with team_members_owner_admin and team_members_select
-- being separate, permissive (OR'd) policies, the practical effect is: any
-- team member, regardless of role, can UPDATE their own team_members row to
-- set role = 'owner' (or 'admin') and credit_allowance to anything, e.g.
--
--   supabase.from('team_members').update({ role: 'owner', credit_allowance: null }).eq('id', myMembershipId)
--
-- The policy's name and the PATCH handler that exercises it
-- (src/routes/api/teams/$id/members.ts) both suggest the intent was "let an
-- invited member accept their own invite" (i.e. only ever touch
-- accepted_at) — the policy just never enforced that scope. Nothing in the
-- app route enforced it either: the PATCH handler applies any of
-- {role, credit_allowance} the caller sends, with no permission check
-- beyond "you are signed in", relying entirely on RLS to say no. And since
-- the Supabase anon key + user session used by src/lib/supabase/client.ts
-- (the browser client) is not a secret, a member doesn't even need the API
-- route — the same update is one `supabase.from(...)` call away in devtools.
--
-- Fix: a BEFORE UPDATE trigger, so the restriction lives at the same layer
-- as the RLS policy that created the gap (not just in application code,
-- which a direct Supabase call bypasses entirely). An owner/admin of the
-- team is unaffected — they already have team_members_owner_admin covering
-- them. Everyone else touching their own row may only ever move
-- accepted_at; role, credit_allowance, team_id and user_id must be
-- unchanged, or the update is rejected.

CREATE OR REPLACE FUNCTION enforce_team_member_self_update()
RETURNS TRIGGER AS $$
DECLARE
  caller_is_owner_or_admin BOOLEAN;
BEGIN
  -- Service-role / admin-client writes (webhooks, server-side jobs) run
  -- with no auth.uid() in scope — auth.uid() is NULL, not the acting user's
  -- id, so this trigger only ever constrains requests made as a real
  -- authenticated user via the RLS-scoped client.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM teams WHERE id = OLD.team_id AND owner_id = auth.uid()
    UNION
    SELECT 1 FROM team_members
      WHERE team_id = OLD.team_id AND user_id = auth.uid()
        AND role IN ('owner', 'admin') AND accepted_at IS NOT NULL
  ) INTO caller_is_owner_or_admin;

  IF caller_is_owner_or_admin THEN
    RETURN NEW;
  END IF;

  -- Not an owner/admin: this update can only be reaching the row through
  -- team_members_self_accept, i.e. auth.uid() = OLD.user_id. Restrict it to
  -- the one field that policy was meant to allow.
  IF NEW.role IS DISTINCT FROM OLD.role
     OR NEW.credit_allowance IS DISTINCT FROM OLD.credit_allowance
     OR NEW.team_id IS DISTINCT FROM OLD.team_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'Only a team owner or admin can change role or credit_allowance for a member'
      USING ERRCODE = '42501'; -- insufficient_privilege
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS team_member_self_update_guard ON team_members;
CREATE TRIGGER team_member_self_update_guard
  BEFORE UPDATE ON team_members
  FOR EACH ROW
  EXECUTE FUNCTION enforce_team_member_self_update();
