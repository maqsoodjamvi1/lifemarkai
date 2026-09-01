-- Migration 189: lock down three tables that were created without RLS
--
-- Found in a broader security audit (billing/auth/dashboard/deploy/RLS pass,
-- following an earlier editor/chat/preview correctness audit). Every other
-- application table in this schema either has RLS enabled with policies, or
-- is a deliberately public static lookup guarded some other way -- these
-- three were the only ones that fell through: created, never given
-- `ENABLE ROW LEVEL SECURITY`, and never revisited. Supabase's default
-- grants make every `public` table readable/writable by the `anon` and
-- `authenticated` roles unless RLS says otherwise, so all three were fully
-- open to any signed-in (in two cases even anonymous) request via
-- PostgREST, independent of whatever the application layer intended.
--
-- All statements are idempotent (DROP POLICY IF EXISTS, etc.) so this is
-- safe to run against a database that already has some of this state, and
-- safe to re-run.

-- -- member_group_members --
-- No RLS meant any authenticated user could INSERT a row making themselves
-- (or anyone) a member of any group, which /api/embed/access.ts trusts
-- verbatim to grant access to "custom audience" published apps -- a direct
-- self-service privilege escalation into private apps. The application
-- layer (src/lib/server-fns/member-groups.ts, setGroupMembership) already
-- verifies the caller owns the parent group before inserting/deleting; this
-- makes that the same guarantee at the database layer instead of trusting
-- application code alone.
ALTER TABLE member_group_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "mgm_select" ON member_group_members;
CREATE POLICY "mgm_select" ON member_group_members
  FOR SELECT TO authenticated
  USING (
    member_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM member_groups mg
      WHERE mg.id = member_group_members.group_id AND mg.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "mgm_manage" ON member_group_members;
CREATE POLICY "mgm_manage" ON member_group_members
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM member_groups mg
      WHERE mg.id = member_group_members.group_id AND mg.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "mgm_delete" ON member_group_members;
CREATE POLICY "mgm_delete" ON member_group_members
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM member_groups mg
      WHERE mg.id = member_group_members.group_id AND mg.user_id = auth.uid()
    )
  );

-- -- lifemark_cloud_instances --
-- A static tier/pricing lookup (tiny/mini/small/medium/large -> monthly
-- cost, RAM, CPU), read by /api/cloud/{bill-usage,health,status}.ts to
-- validate upgrades and compute nightly billing. With no RLS, any
-- authenticated user could directly PATCH e.g. `large.monthly_cents` to 0
-- via PostgREST, and the next nightly bill-usage cron run would bill every
-- project on that tier at the tampered price. Read-only for everyone;
-- writes are intentionally left to service_role only (no INSERT/UPDATE/
-- DELETE policy for authenticated/anon = denied by RLS default).
ALTER TABLE lifemark_cloud_instances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "cloud_instances_read" ON lifemark_cloud_instances;
CREATE POLICY "cloud_instances_read" ON lifemark_cloud_instances
  FOR SELECT TO authenticated, anon
  USING (true);

-- -- builtin_skills --
-- Read-only starter-skill templates shown to every user in the skill
-- picker (src/lib/server-fns/skills.ts). With no RLS, any authenticated
-- user could INSERT a new "built-in" skill whose `prompt` field contains
-- adversarial instructions for the AI agent -- a stored prompt-injection
-- vector reaching every user who clicks it in the picker. Read-only for
-- everyone; writes intentionally left to service_role only.
ALTER TABLE builtin_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "builtin_skills_read" ON builtin_skills;
CREATE POLICY "builtin_skills_read" ON builtin_skills
  FOR SELECT TO authenticated, anon
  USING (true);
