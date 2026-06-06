-- Migration 015: Project Comments
-- Threaded comments on projects for async collaboration

create table if not exists project_comments (
  id          uuid primary key default gen_random_uuid(),
  project_id  uuid not null references projects(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  parent_id   uuid references project_comments(id) on delete cascade,
  content     text not null check (char_length(content) between 1 and 4000),
  resolved    boolean not null default false,
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Index for fast per-project listing (newest first)
create index if not exists project_comments_project_id_idx
  on project_comments(project_id, created_at desc);

-- Index for threading
create index if not exists project_comments_parent_id_idx
  on project_comments(parent_id);

-- RLS
alter table project_comments enable row level security;

-- Project owner / collaborators can read all comments
create policy "project_comments_select" on project_comments
  for select using (
    exists (
      select 1 from projects p
      where p.id = project_id
        and (
          p.user_id = auth.uid()
          or p.is_public = true
          or exists (
            select 1 from collaborators c
            where c.project_id = p.id and c.user_id = auth.uid()
          )
        )
    )
  );

-- Authenticated users who can read the project can also insert
create policy "project_comments_insert" on project_comments
  for insert with check (
    auth.uid() = user_id
    and exists (
      select 1 from projects p
      where p.id = project_id
        and (
          p.user_id = auth.uid()
          or p.is_public = true
          or exists (
            select 1 from collaborators c
            where c.project_id = p.id and c.user_id = auth.uid()
          )
        )
    )
  );

-- Users can update their own comments; project owner can resolve any
create policy "project_comments_update" on project_comments
  for update using (
    auth.uid() = user_id
    or exists (
      select 1 from projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

-- Users can delete their own comments; project owner can delete any
create policy "project_comments_delete" on project_comments
  for delete using (
    auth.uid() = user_id
    or exists (
      select 1 from projects p
      where p.id = project_id and p.user_id = auth.uid()
    )
  );

-- Auto-update updated_at
create or replace function update_project_comments_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger project_comments_updated_at
  before update on project_comments
  for each row execute function update_project_comments_updated_at();
