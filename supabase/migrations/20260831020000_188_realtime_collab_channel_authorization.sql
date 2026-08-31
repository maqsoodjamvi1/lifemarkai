-- Migration 188: authorize the live-editor collaboration Realtime channel.
--
-- src/lib/collaboration/supabase-yjs-provider.ts opens
-- `supabase.channel(\`collab:${projectId}\`, ...)` for every open editor tab
-- (src/hooks/use-yjs-editor.ts) to sync live Yjs document edits and cursor
-- presence between collaborators. It was created with the default (public)
-- channel config — no `{ config: { private: true } }` — which means Realtime
-- performed NO authorization check at all: RLS on realtime.messages only
-- applies to channels explicitly opened as private. Anyone holding this
-- project's Supabase anon key (which is not a secret — it ships in the
-- client bundle) could construct `collab:<any-project-id>` for a project
-- they have no access to, subscribe, and both WATCH another project's live
-- source code as it's typed and INJECT their own Yjs updates into that
-- document (Yjs applies remote updates unconditionally, with no
-- server-side validation of who sent them — see applyUpdate() in the
-- provider). Fixing this needs two coordinated changes: this migration
-- (the actual authorization boundary), and a matching provider change to
-- open the channel as private.
--
-- RLS is enabled on realtime.messages by default; no ALTER TABLE needed.
-- realtime.topic() returns the channel topic a client is attempting to
-- join, which for this feature is always `collab:<project-id>`.
--
-- Access mirrors src/lib/project/access.ts's getProjectAccess exactly:
--   - SELECT (receive broadcasts / see who else is present): anyone who can
--     read the project — owner, an accepted collaborator of any role, or
--     anyone when the project is public — same as canReadProjectFiles.
--   - INSERT on the broadcast extension (actually push a Yjs document edit
--     into the room): owner or an accepted editor collaborator only — same
--     as canWriteProjectFiles. A viewer or public visitor can watch but not
--     mutate the live document.
--   - INSERT on the presence extension (announce your own cursor/name):
--     same as SELECT — presence is "who's looking," not a document
--     mutation, so anyone who can view the project can be seen viewing it.

CREATE OR REPLACE FUNCTION public.collab_channel_project_id(topic text)
RETURNS uuid
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  IF topic IS NULL OR left(topic, 7) != 'collab:' THEN
    RETURN NULL;
  END IF;
  RETURN substring(topic FROM 8)::uuid;
EXCEPTION WHEN OTHERS THEN
  -- Malformed/non-uuid suffix: not a valid collab channel, not an error.
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.can_read_collab_channel_project()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = public.collab_channel_project_id(realtime.topic())
      AND (
        p.user_id = auth.uid()
        OR p.is_public = true
        OR EXISTS (
          SELECT 1 FROM collaborators c
          WHERE c.project_id = p.id AND c.user_id = auth.uid() AND c.accepted_at IS NOT NULL
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION public.can_write_collab_channel_project()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM projects p
    WHERE p.id = public.collab_channel_project_id(realtime.topic())
      AND (
        p.user_id = auth.uid()
        OR EXISTS (
          -- 'owner' here is a collaborators-row role level distinct from the
          -- project's own user_id owner (see getProjectAccess in
          -- src/lib/project/access.ts, which grants the same "owner" access
          -- level for either) — canWriteProjectFiles there is true for
          -- "owner" or "editor" access, so both roles are included here too.
          SELECT 1 FROM collaborators c
          WHERE c.project_id = p.id AND c.user_id = auth.uid()
            AND c.role IN ('owner', 'editor') AND c.accepted_at IS NOT NULL
        )
      )
  );
$$;

DROP POLICY IF EXISTS "collab_channel_select_broadcast" ON "realtime"."messages";
CREATE POLICY "collab_channel_select_broadcast" ON "realtime"."messages"
  FOR SELECT TO authenticated
  USING (
    realtime.messages.extension = 'broadcast'
    AND left(realtime.topic(), 7) = 'collab:'
    AND public.can_read_collab_channel_project()
  );

DROP POLICY IF EXISTS "collab_channel_insert_broadcast" ON "realtime"."messages";
CREATE POLICY "collab_channel_insert_broadcast" ON "realtime"."messages"
  FOR INSERT TO authenticated
  WITH CHECK (
    realtime.messages.extension = 'broadcast'
    AND left(realtime.topic(), 7) = 'collab:'
    AND public.can_write_collab_channel_project()
  );

DROP POLICY IF EXISTS "collab_channel_select_presence" ON "realtime"."messages";
CREATE POLICY "collab_channel_select_presence" ON "realtime"."messages"
  FOR SELECT TO authenticated
  USING (
    realtime.messages.extension = 'presence'
    AND left(realtime.topic(), 7) = 'collab:'
    AND public.can_read_collab_channel_project()
  );

DROP POLICY IF EXISTS "collab_channel_insert_presence" ON "realtime"."messages";
CREATE POLICY "collab_channel_insert_presence" ON "realtime"."messages"
  FOR INSERT TO authenticated
  WITH CHECK (
    realtime.messages.extension = 'presence'
    AND left(realtime.topic(), 7) = 'collab:'
    AND public.can_read_collab_channel_project()
  );
