-- Prompt snippet library: save, reuse, and share common AI prompts

create table if not exists prompt_snippets (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  title       text not null check (char_length(title) between 1 and 100),
  content     text not null check (char_length(content) between 1 and 4000),
  tags        text[] not null default '{}',
  is_public   boolean not null default false,
  use_count   integer not null default 0,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- Auto-update updated_at
create trigger prompt_snippets_updated_at
  before update on prompt_snippets
  for each row execute function update_updated_at();

-- RLS
alter table prompt_snippets enable row level security;

-- Users can see their own snippets + all public snippets
create policy "prompt_snippets_select"
  on prompt_snippets for select
  using (user_id = auth.uid() or is_public = true);

create policy "prompt_snippets_insert"
  on prompt_snippets for insert
  with check (user_id = auth.uid());

create policy "prompt_snippets_update"
  on prompt_snippets for update
  using (user_id = auth.uid());

create policy "prompt_snippets_delete"
  on prompt_snippets for delete
  using (user_id = auth.uid());

-- Indexes
create index if not exists idx_prompt_snippets_user on prompt_snippets(user_id);
create index if not exists idx_prompt_snippets_public on prompt_snippets(is_public, use_count desc) where is_public = true;

-- Atomic use_count increment (avoids read-modify-write race conditions)
create or replace function increment_snippet_use_count(snippet_id uuid)
returns void language sql security definer as $$
  update prompt_snippets
  set use_count = use_count + 1
  where id = snippet_id;
$$;
