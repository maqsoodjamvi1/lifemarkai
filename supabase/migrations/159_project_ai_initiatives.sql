-- Migration 159: create the editor-intelligence initiative tables that 068
-- defined in the repo but never actually landed on live.
--
-- Decision log (live information_schema + PostgREST probe, Aug 2026):
--
-- 1. project_ai_initiatives / project_ai_initiative_events
--    NEVER CREATED on live. Migration 068 is marked applied and the three sibling
--    lens tables (project_ai_agents / _messages / _decisions) exist, but these two
--    do not. Likely cause: 068 was recorded as applied from a partial / earlier
--    shape, then the initiative DDL was amended into the same file later — so
--    `db push` never re-ran it. The persistence layer
--    (lib/ai/editor-lenses/persistence.ts) and docs/editor-intelligence/* treat
--    these as the durable run/checkpoint store. Creating them here (idempotent)
--    is the correct fix; they were not renamed or dropped.
--
-- 2. "previews" in agent-browser.ts + routes/api/projects/$id/preview.ts
--    NOT A TABLE. Those call sites are `storage.from("previews")` — the public
--    screenshot bucket created by migration 032. Sweep false positive. This
--    migration re-asserts the bucket insert so a missing bucket cannot silently
--    fall back forever; it does NOT create a public.previews relation.

-- ── Initiative tables (from 068, idempotent) ─────────────────────────────────

create table if not exists public.project_ai_initiatives (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  goal text not null,
  status text not null default 'queued' check (status in ('queued', 'planning', 'debating', 'executing', 'verifying', 'paused', 'done', 'failed')),
  budget_credits numeric(12,2),
  credits_used numeric(12,2) not null default 0,
  checkpoint jsonb not null default '{}'::jsonb,
  result jsonb,
  error text,
  last_event_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_ai_initiative_events (
  id uuid primary key default gen_random_uuid(),
  initiative_id uuid not null references public.project_ai_initiatives(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.project_ai_initiatives enable row level security;
alter table public.project_ai_initiative_events enable row level security;

drop policy if exists "project_ai_initiatives_read" on public.project_ai_initiatives;
create policy "project_ai_initiatives_read" on public.project_ai_initiatives
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (
          p.user_id = auth.uid()
          or p.is_public = true
          or exists (
            select 1 from public.collaborators c
            where c.project_id = p.id
              and c.user_id = auth.uid()
              and c.accepted_at is not null
          )
        )
    )
  );

drop policy if exists "project_ai_initiatives_write" on public.project_ai_initiatives;
create policy "project_ai_initiatives_write" on public.project_ai_initiatives
  for all using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.collaborators c
            where c.project_id = p.id
              and c.user_id = auth.uid()
              and c.role in ('owner', 'editor')
              and c.accepted_at is not null
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.collaborators c
            where c.project_id = p.id
              and c.user_id = auth.uid()
              and c.role in ('owner', 'editor')
              and c.accepted_at is not null
          )
        )
    )
  );

drop policy if exists "project_ai_initiative_events_read" on public.project_ai_initiative_events;
create policy "project_ai_initiative_events_read" on public.project_ai_initiative_events
  for select using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (
          p.user_id = auth.uid()
          or p.is_public = true
          or exists (
            select 1 from public.collaborators c
            where c.project_id = p.id
              and c.user_id = auth.uid()
              and c.accepted_at is not null
          )
        )
    )
  );

drop policy if exists "project_ai_initiative_events_write" on public.project_ai_initiative_events;
create policy "project_ai_initiative_events_write" on public.project_ai_initiative_events
  for all using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.collaborators c
            where c.project_id = p.id
              and c.user_id = auth.uid()
              and c.role in ('owner', 'editor')
              and c.accepted_at is not null
          )
        )
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.collaborators c
            where c.project_id = p.id
              and c.user_id = auth.uid()
              and c.role in ('owner', 'editor')
              and c.accepted_at is not null
          )
        )
    )
  );

create index if not exists project_ai_initiatives_project_idx
  on public.project_ai_initiatives(project_id, created_at desc);
create index if not exists project_ai_initiatives_status_idx
  on public.project_ai_initiatives(project_id, status, updated_at desc);
create index if not exists project_ai_initiative_events_run_idx
  on public.project_ai_initiative_events(initiative_id, created_at asc);

-- Reuse the updated_at helper from 068 when present; otherwise create a local one.
create or replace function public.update_project_ai_agents_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists project_ai_initiatives_updated_at on public.project_ai_initiatives;
create trigger project_ai_initiatives_updated_at
  before update on public.project_ai_initiatives
  for each row execute function public.update_project_ai_agents_updated_at();

-- ── Previews storage bucket (032, idempotent re-assert) ──────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'previews',
  'previews',
  true,
  524288,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO NOTHING;
