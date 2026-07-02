-- Migration 075: Self-Healing scheduled scans (Editor Intelligence P2)
-- Persistent health findings per project: build, runtime, dependency, security,
-- performance, and accessibility issues detected by lib/ai/self-healing.ts.
-- Fixes are approval-gated: proposed_fix holds {files:[{path,content}]} until the
-- owner applies it (never auto-applied on the Live environment — migration 046).

create table if not exists public.health_findings (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('build', 'runtime', 'dependency', 'security', 'performance', 'accessibility')),
  severity text not null check (severity in ('info', 'warning', 'error', 'critical')),
  title text not null,
  detail text,
  file_path text,
  status text not null default 'open' check (status in ('open', 'fix_proposed', 'fixed', 'dismissed')),
  proposed_fix jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.health_findings enable row level security;

-- Owner-only: findings (and their proposed fixes) are private to the project owner.
drop policy if exists "health_findings_owner_all" on public.health_findings;
create policy "health_findings_owner_all" on public.health_findings
  for all using (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = project_id
        and p.user_id = auth.uid()
    )
  );

create index if not exists health_findings_project_status_idx
  on public.health_findings(project_id, status);

-- Reuse the shared updated_at trigger function from migration 068.
drop trigger if exists health_findings_updated_at on public.health_findings;
create trigger health_findings_updated_at
  before update on public.health_findings
  for each row execute function public.update_project_ai_agents_updated_at();
