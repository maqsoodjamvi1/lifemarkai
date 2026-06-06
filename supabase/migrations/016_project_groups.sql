-- Project Groups: named folders to organise projects on the dashboard

create table if not exists project_groups (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  name        text not null,
  color       text not null default '#6366f1',  -- hex color for group label
  position    integer not null default 0,        -- sort order
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Add group_id to projects (nullable — ungrouped projects stay in default view)
alter table projects add column if not exists group_id uuid references project_groups(id) on delete set null;

-- Index for fast per-user group lookup
create index if not exists idx_project_groups_user_id on project_groups(user_id);
create index if not exists idx_projects_group_id on projects(group_id);

-- RLS
alter table project_groups enable row level security;

create policy "Users can view their own groups"
  on project_groups for select
  using (auth.uid() = user_id);

create policy "Users can create their own groups"
  on project_groups for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own groups"
  on project_groups for update
  using (auth.uid() = user_id);

create policy "Users can delete their own groups"
  on project_groups for delete
  using (auth.uid() = user_id);

-- Auto-update updated_at
create or replace function update_project_groups_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger project_groups_updated_at
  before update on project_groups
  for each row execute function update_project_groups_updated_at();
