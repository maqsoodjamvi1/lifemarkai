-- Migration 068: PROJECT TITAN AI company-mode foundation
-- Persistent role agents, scoped memory, and inter-agent discussions per project.

create table if not exists public.project_ai_agents (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  role text not null,
  name text not null,
  title text not null,
  responsibilities text[] not null default '{}',
  memory jsonb not null default '{}'::jsonb,
  status text not null default 'idle' check (status in ('idle', 'thinking', 'blocked', 'reviewing', 'done')),
  last_active_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (project_id, role)
);

create table if not exists public.project_ai_agent_messages (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  agent_id uuid references public.project_ai_agents(id) on delete set null,
  phase text not null default 'discussion',
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.project_ai_agent_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  summary text not null,
  decided_by uuid references public.project_ai_agents(id) on delete set null,
  status text not null default 'proposed' check (status in ('proposed', 'accepted', 'rejected', 'superseded')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.project_ai_agents enable row level security;
alter table public.project_ai_agent_messages enable row level security;
alter table public.project_ai_agent_decisions enable row level security;

drop policy if exists "project_ai_agents_read" on public.project_ai_agents;
create policy "project_ai_agents_read" on public.project_ai_agents
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

drop policy if exists "project_ai_agents_write" on public.project_ai_agents;
create policy "project_ai_agents_write" on public.project_ai_agents
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

drop policy if exists "project_ai_agent_messages_read" on public.project_ai_agent_messages;
create policy "project_ai_agent_messages_read" on public.project_ai_agent_messages
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

drop policy if exists "project_ai_agent_messages_write" on public.project_ai_agent_messages;
create policy "project_ai_agent_messages_write" on public.project_ai_agent_messages
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

drop policy if exists "project_ai_agent_decisions_read" on public.project_ai_agent_decisions;
create policy "project_ai_agent_decisions_read" on public.project_ai_agent_decisions
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

drop policy if exists "project_ai_agent_decisions_write" on public.project_ai_agent_decisions;
create policy "project_ai_agent_decisions_write" on public.project_ai_agent_decisions
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

create index if not exists project_ai_agents_project_idx
  on public.project_ai_agents(project_id, role);
create index if not exists project_ai_agent_messages_project_idx
  on public.project_ai_agent_messages(project_id, created_at desc);
create index if not exists project_ai_agent_decisions_project_idx
  on public.project_ai_agent_decisions(project_id, created_at desc);

create or replace function public.update_project_ai_agents_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists project_ai_agents_updated_at on public.project_ai_agents;
create trigger project_ai_agents_updated_at
  before update on public.project_ai_agents
  for each row execute function public.update_project_ai_agents_updated_at();
