-- 160_project_builds.sql
--
-- Storage for a PUBLISHED app's production build output.
--
-- Why this table has to exist at all: publishing with provider 'lifemarkai' was
-- a simulation. It slept 2500ms, wrote `{app_slug}.apps.lifemarkai.com` into
-- projects.deployed_url, and built nothing. Visitors following those URLs got
-- either a dead host or a 503 telling them to configure Modal. `project_files`
-- holds SOURCE (src/App.tsx, package.json); a browser cannot run that. What was
-- missing was somewhere to put the compiled `dist/` so it can be served.
--
-- One row per file per build. Builds are immutable and identified by build_id;
-- a project's live build is the newest row set, which makes publishing atomic
-- (insert the new build, then flip) and rollback a matter of choosing an older
-- build_id rather than rebuilding.

create table if not exists public.project_builds (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references public.projects(id) on delete cascade,
  build_id     uuid not null,
  path         text not null,
  -- Text assets are stored verbatim; binaries (png/ico/woff2/…) are base64.
  -- Storing everything as utf-8 text silently corrupts binaries — the file
  -- round-trips through a string, invalid byte sequences become U+FFFD, and the
  -- asset ships broken with no error anywhere. `encoding` is what prevents that.
  content      text not null,
  encoding     text not null default 'utf8' check (encoding in ('utf8', 'base64')),
  content_type text not null default 'application/octet-stream',
  byte_size    integer not null default 0,
  created_at   timestamptz not null default now(),

  unique (build_id, path)
);

create index if not exists project_builds_project_build_idx
  on public.project_builds (project_id, build_id);

-- The serving path's hot query: "give me file X of project P's live build".
create index if not exists project_builds_lookup_idx
  on public.project_builds (project_id, path);

comment on table public.project_builds is
  'Compiled output (dist/) of a published app. Served by hostname; not source code.';

-- ── Which build is live ──────────────────────────────────────────────────────
-- Kept on projects so serving is a single indexed lookup and does not need a
-- "max(created_at)" scan per asset request.
alter table public.projects
  add column if not exists live_build_id uuid,
  add column if not exists live_build_at timestamptz;

comment on column public.projects.live_build_id is
  'project_builds.build_id currently served at the app''s public hostname.';

-- ── RLS ──────────────────────────────────────────────────────────────────────
alter table public.project_builds enable row level security;

-- Owners and collaborators may read their own builds (deploy history, rollback).
-- `TO authenticated` is not decoration. Without it the policy is granted to the
-- `public` role, which includes `anon`. It would still return no rows (auth.uid()
-- is null for an anonymous request, so the EXISTS fails), but the grant would say
-- something the author did not mean, and the next person to widen the USING
-- clause would silently widen it to the whole internet. Say what is intended.
drop policy if exists project_builds_owner_read on public.project_builds;
create policy project_builds_owner_read on public.project_builds
  for select
  to authenticated
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_builds.project_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.collaborators c
            where c.project_id = p.id and c.user_id = auth.uid()
          )
        )
    )
  );

-- Deliberately NO anon select policy. Public visitors never query this table
-- directly; the server reads it with the service role AFTER deciding the app is
-- publicly visible. Granting anon read here would expose every build of every
-- project whose visibility is later narrowed, and RLS on a table serving static
-- assets is the wrong place to make an access-control decision that already has
-- one correct home.
--
-- Writes are service-role only (no insert/update/delete policy exists), because
-- a build is produced by the server, never by a client.
