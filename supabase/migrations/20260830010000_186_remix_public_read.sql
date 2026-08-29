-- Migration 186: let remixing a public project actually copy its files
-- (and, with this patch, its chat history).
--
-- `projects` already has a "Public remix projects visible to all" SELECT
-- policy (is_public = true AND remix_enabled = true) — that's how the
-- gallery and the Remix button's dry-run can see the source project at all.
-- But src/routes/api/projects/$id/remix.ts reads the source project's files
-- via `.select("*, project_files(*)")`, and PostgREST enforces each embedded
-- table's OWN row-level security independently — embedding never inherits
-- the parent row's visibility. `project_files` had no policy granting
-- read access to anyone but the owner or an accepted collaborator, so for
-- every remix performed by a user who was neither of those (i.e. the
-- entire audience the Remix button exists for), the embedded project_files
-- came back empty under RLS — with no error, since RLS doesn't error, it
-- just filters rows out — and the new project silently got zero files.
--
-- Same gap, same fix, for `messages`: needed so the new "carry over chat
-- history" remix option (this patch) can actually read the source
-- project's conversation instead of silently copying nothing.

CREATE POLICY "files_public_remixable" ON public.project_files
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE is_public = true AND remix_enabled = true
    )
  );

CREATE POLICY "messages_public_remixable" ON public.messages
  FOR SELECT
  USING (
    project_id IN (
      SELECT id FROM public.projects WHERE is_public = true AND remix_enabled = true
    )
  );
