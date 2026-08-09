-- Project-owned feature flags were previously (and incorrectly) written into
-- the platform-wide feature_flags table. Give editor projects their own table.
create table if not exists public.project_feature_flags (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  key text not null,
  description text,
  is_enabled boolean not null default false,
  rollout_pct integer not null default 100 check (rollout_pct between 0 and 100),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, key)
);

create index if not exists project_feature_flags_project_id_idx
  on public.project_feature_flags(project_id);

alter table public.project_feature_flags enable row level security;

create policy "Project members can read project feature flags"
  on public.project_feature_flags for select
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and (p.user_id = auth.uid() or p.is_public)
    )
    or exists (
      select 1 from public.collaborators c
      where c.project_id = project_id and c.user_id = auth.uid()
    )
  );

create policy "Project editors can manage project feature flags"
  on public.project_feature_flags for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
    or exists (
      select 1 from public.collaborators c
      where c.project_id = project_id
        and c.user_id = auth.uid()
        and c.role in ('owner', 'editor')
    )
  )
  with check (
    (
      exists (
        select 1 from public.projects p
        where p.id = project_id and p.user_id = auth.uid()
      )
      or exists (
        select 1 from public.collaborators c
        where c.project_id = project_id
          and c.user_id = auth.uid()
          and c.role in ('owner', 'editor')
      )
    )
  );

-- API handlers already support per-key scopes. Persist them instead of
-- silently treating every key as fully privileged.
alter table public.api_keys
  add column if not exists scopes text[] not null default array['read', 'write']::text[];
