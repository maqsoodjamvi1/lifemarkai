-- Migration 087: make collaborator access and invite acceptance enforceable.

-- RLS helper owned by the migration role. It bypasses recursive project /
-- collaborator policies while still binding every answer to auth.uid().
CREATE OR REPLACE FUNCTION public.is_project_owner(p_project_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.projects
     WHERE id = p_project_id
       AND user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_project_owner(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_project_owner(UUID) TO authenticated, service_role;

-- The original schema enabled RLS on collaborators without defining a policy,
-- so the collaborator subqueries in projects/files policies always saw zero
-- rows. Users may read their own grants; project owners may manage their list.
DROP POLICY IF EXISTS "collaborators_self_or_owner_select" ON public.collaborators;
CREATE POLICY "collaborators_self_or_owner_select"
  ON public.collaborators
  FOR SELECT
  TO authenticated
  USING (
    user_id = auth.uid()
    OR public.is_project_owner(project_id)
  );

-- Accepted editors can modify project files. Viewers can read through the
-- existing files_collaborator policy but cannot write.
DROP POLICY IF EXISTS "files_editor_insert" ON public.project_files;
CREATE POLICY "files_editor_insert"
  ON public.project_files
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1
        FROM public.collaborators c
       WHERE c.project_id = project_files.project_id
         AND c.user_id = auth.uid()
         AND c.accepted_at IS NOT NULL
         AND c.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "files_editor_update" ON public.project_files;
CREATE POLICY "files_editor_update"
  ON public.project_files
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.collaborators c
       WHERE c.project_id = project_files.project_id
         AND c.user_id = auth.uid()
         AND c.accepted_at IS NOT NULL
         AND c.role IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.collaborators c
       WHERE c.project_id = project_files.project_id
         AND c.user_id = auth.uid()
         AND c.accepted_at IS NOT NULL
         AND c.role IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "files_editor_delete" ON public.project_files;
CREATE POLICY "files_editor_delete"
  ON public.project_files
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.collaborators c
       WHERE c.project_id = project_files.project_id
         AND c.user_id = auth.uid()
         AND c.accepted_at IS NOT NULL
         AND c.role IN ('owner', 'editor')
    )
  );

-- Collaborators need the project conversation in the editor. Only editors can
-- add or mutate messages; viewers remain read-only.
DROP POLICY IF EXISTS "messages_collaborator_select" ON public.messages;
CREATE POLICY "messages_collaborator_select"
  ON public.messages
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.collaborators c
       WHERE c.project_id = messages.project_id
         AND c.user_id = auth.uid()
         AND c.accepted_at IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "messages_editor_insert" ON public.messages;
CREATE POLICY "messages_editor_insert"
  ON public.messages
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.collaborators c
       WHERE c.project_id = messages.project_id
         AND c.user_id = auth.uid()
         AND c.accepted_at IS NOT NULL
         AND c.role IN ('owner', 'editor')
    )
  );

-- Project invite roles now match collaborators.role exactly.
UPDATE public.project_invite_tokens SET role = 'editor' WHERE role = 'admin';
ALTER TABLE public.project_invite_tokens
  DROP CONSTRAINT IF EXISTS project_invite_tokens_role_check;
ALTER TABLE public.project_invite_tokens
  ADD CONSTRAINT project_invite_tokens_role_check
  CHECK (role IN ('viewer', 'editor'));

-- Token creation is owner-only. The legacy policy checked created_by but did
-- not verify ownership of project_id, allowing capability grants for another
-- user's public project through direct PostgREST calls.
DROP POLICY IF EXISTS "invite_tokens_owner" ON public.project_invite_tokens;
DROP POLICY IF EXISTS "invite_tokens_project_owner" ON public.project_invite_tokens;
CREATE POLICY "invite_tokens_project_owner"
  ON public.project_invite_tokens
  FOR ALL
  TO authenticated
  USING (
    created_by = auth.uid()
    AND public.is_project_owner(project_id)
  )
  WITH CHECK (
    created_by = auth.uid()
    AND public.is_project_owner(project_id)
  );

-- Accepting a token, enforcing max_uses, creating the collaborator grant, and
-- incrementing usage happen in one transaction under a row lock.
CREATE OR REPLACE FUNCTION public.accept_project_invite_token(p_token TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_invite public.project_invite_tokens%ROWTYPE;
  v_owner_id UUID;
  v_role TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;
  IF p_token IS NULL OR length(p_token) < 16 OR length(p_token) > 256 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Invalid invite link');
  END IF;

  SELECT * INTO v_invite
    FROM public.project_invite_tokens
   WHERE token = p_token
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'This invite link is invalid or revoked');
  END IF;
  IF v_invite.expires_at <= NOW() THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'This invite link has expired');
  END IF;
  IF v_invite.max_uses IS NOT NULL AND v_invite.used_count >= v_invite.max_uses THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'This invite link has reached its maximum uses');
  END IF;

  SELECT user_id INTO v_owner_id
    FROM public.projects
   WHERE id = v_invite.project_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'The project no longer exists');
  END IF;
  IF v_owner_id = v_user_id THEN
    RETURN jsonb_build_object('ok', TRUE, 'project_id', v_invite.project_id, 'owner', TRUE);
  END IF;

  v_role := CASE WHEN v_invite.role = 'editor' THEN 'editor' ELSE 'viewer' END;
  INSERT INTO public.collaborators AS existing (
    project_id, user_id, role, invited_by, accepted_at
  )
  VALUES (
    v_invite.project_id, v_user_id, v_role, v_invite.created_by, NOW()
  )
  ON CONFLICT (project_id, user_id) DO UPDATE
    SET role = CASE
          WHEN existing.role = 'owner' THEN existing.role
          ELSE EXCLUDED.role
        END,
        invited_by = EXCLUDED.invited_by,
        accepted_at = COALESCE(existing.accepted_at, NOW());

  UPDATE public.project_invite_tokens
     SET used_count = used_count + 1
   WHERE id = v_invite.id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'project_id', v_invite.project_id,
    'role', v_role
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_project_invite_token(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_project_invite_token(TEXT) TO authenticated, service_role;

-- Pending team invitations for people who have not signed up cannot use the
-- inviter as a placeholder user_id. Make that reference nullable and migrate
-- the legacy placeholder rows.
ALTER TABLE public.team_members ALTER COLUMN user_id DROP NOT NULL;
UPDATE public.team_members
   SET user_id = NULL
 WHERE accepted_at IS NULL
   AND invited_email IS NOT NULL
   AND user_id = invited_by;

CREATE OR REPLACE FUNCTION public.accept_team_invite(
  p_team_id UUID,
  p_member_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id UUID := auth.uid();
  v_email TEXT;
  v_member public.team_members%ROWTYPE;
  v_team_name TEXT;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'authentication required' USING ERRCODE = '42501';
  END IF;

  SELECT email INTO v_email FROM public.profiles WHERE id = v_user_id;
  SELECT * INTO v_member
    FROM public.team_members
   WHERE id = p_member_id
     AND team_id = p_team_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'This invitation is invalid');
  END IF;
  IF v_member.accepted_at IS NOT NULL THEN
    IF v_member.user_id = v_user_id THEN
      SELECT name INTO v_team_name FROM public.teams WHERE id = p_team_id;
      RETURN jsonb_build_object('ok', TRUE, 'team_name', v_team_name, 'already_accepted', TRUE);
    END IF;
    RETURN jsonb_build_object('ok', FALSE, 'error', 'This invitation has already been used');
  END IF;
  IF v_member.user_id IS DISTINCT FROM v_user_id
     AND (
       v_member.user_id IS NOT NULL
       OR v_member.invited_email IS NULL
       OR lower(v_member.invited_email) IS DISTINCT FROM lower(v_email)
     ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'This invitation was sent to another account');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.team_members
     WHERE team_id = p_team_id
       AND user_id = v_user_id
       AND accepted_at IS NOT NULL
       AND id <> p_member_id
  ) THEN
    DELETE FROM public.team_members WHERE id = p_member_id;
    SELECT name INTO v_team_name FROM public.teams WHERE id = p_team_id;
    RETURN jsonb_build_object('ok', TRUE, 'team_name', v_team_name, 'already_member', TRUE);
  END IF;

  -- A pre-signup (NULL user_id) invite and a later registered-user invite can
  -- coexist. Remove any other still-pending row before assigning this one so
  -- the existing UNIQUE(team_id, user_id) constraint cannot abort acceptance.
  DELETE FROM public.team_members
   WHERE team_id = p_team_id
     AND user_id = v_user_id
     AND accepted_at IS NULL
     AND id <> p_member_id;

  UPDATE public.team_members
     SET user_id = v_user_id,
         accepted_at = NOW()
   WHERE id = p_member_id;

  SELECT name INTO v_team_name FROM public.teams WHERE id = p_team_id;
  RETURN jsonb_build_object('ok', TRUE, 'team_name', v_team_name);
END;
$$;

REVOKE ALL ON FUNCTION public.accept_team_invite(UUID, UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.accept_team_invite(UUID, UUID) TO authenticated, service_role;
