-- Transactional AI generations: stage, validate, atomically commit, and roll back.
alter table public.projects
  add column if not exists generation_revision bigint not null default 0;

create table if not exists public.generation_runs (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  base_revision bigint not null,
  committed_revision bigint,
  status text not null default 'staging' check (status in ('staging','committed','conflict','failed','rolled_back')),
  source text not null default 'chat',
  error text,
  created_at timestamptz not null default now(),
  committed_at timestamptz
);

create table if not exists public.generation_files (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.generation_runs(id) on delete cascade,
  path text not null,
  content text not null,
  language text,
  created_at timestamptz not null default now(),
  unique (run_id, path)
);

create table if not exists public.project_revisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  revision bigint not null,
  run_id uuid references public.generation_runs(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  files jsonb not null,
  created_at timestamptz not null default now(),
  unique (project_id, revision)
);

create index if not exists generation_runs_project_created_idx on public.generation_runs(project_id, created_at desc);
create index if not exists project_revisions_project_revision_idx on public.project_revisions(project_id, revision desc);

alter table public.generation_runs enable row level security;
alter table public.generation_files enable row level security;
alter table public.project_revisions enable row level security;

create or replace function public.can_edit_project(target_project_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.projects p
    where p.id = target_project_id
      and (p.user_id = auth.uid() or exists (
        select 1 from public.collaborators c
        where c.project_id = p.id and c.user_id = auth.uid()
          and coalesce(c.role, 'viewer') in ('owner','editor')
      ))
  );
$$;

drop policy if exists generation_runs_read on public.generation_runs;
create policy generation_runs_read on public.generation_runs for select to authenticated
  using (public.can_edit_project(project_id));
drop policy if exists generation_files_read on public.generation_files;
create policy generation_files_read on public.generation_files for select to authenticated
  using (exists (select 1 from public.generation_runs r where r.id = run_id and public.can_edit_project(r.project_id)));
drop policy if exists project_revisions_read on public.project_revisions;
create policy project_revisions_read on public.project_revisions for select to authenticated
  using (public.can_edit_project(project_id));

create or replace function public.begin_generation(target_project_id uuid, run_source text default 'chat')
returns table(run_id uuid, base_revision bigint)
language plpgsql security definer set search_path = public as $$
declare current_revision bigint; new_run uuid;
begin
  if not public.can_edit_project(target_project_id) then raise exception 'project access denied'; end if;
  select generation_revision into current_revision from public.projects where id = target_project_id;
  if not found then raise exception 'project not found'; end if;
  insert into public.generation_runs(project_id,user_id,base_revision,source)
  values(target_project_id,auth.uid(),current_revision,coalesce(nullif(run_source,''),'chat')) returning id into new_run;
  return query select new_run,current_revision;
end;
$$;

create or replace function public.commit_generation(
  target_run_id uuid,
  expected_revision bigint,
  staged_files jsonb
) returns bigint
language plpgsql security definer set search_path = public as $$
declare run_row public.generation_runs%rowtype; current_revision bigint; next_revision bigint;
begin
  select * into run_row from public.generation_runs where id = target_run_id for update;
  if not found or run_row.user_id <> auth.uid() or not public.can_edit_project(run_row.project_id) then
    raise exception 'generation access denied';
  end if;
  if run_row.status <> 'staging' then raise exception 'generation is not staging'; end if;
  if jsonb_typeof(staged_files) <> 'array' or jsonb_array_length(staged_files) = 0 then
    raise exception 'generation has no files';
  end if;
  select generation_revision into current_revision from public.projects where id = run_row.project_id for update;
  if current_revision <> expected_revision or run_row.base_revision <> expected_revision then
    update public.generation_runs set status='conflict', error='project revision changed' where id=target_run_id;
    raise exception 'generation conflict: expected revision %, current revision %', expected_revision,current_revision using errcode='40001';
  end if;

  insert into public.generation_files(run_id,path,content,language)
  select target_run_id, x.path, x.content, x.language
  from jsonb_to_recordset(staged_files) as x(path text,content text,language text)
  where x.path is not null and x.path <> '' and x.content is not null
  on conflict (run_id,path) do update set content=excluded.content,language=excluded.language;

  insert into public.project_files(project_id,path,content,language)
  select run_row.project_id,path,content,language from public.generation_files where run_id=target_run_id
  on conflict (project_id,path) do update set content=excluded.content,language=excluded.language,updated_at=now();

  next_revision := current_revision + 1;
  update public.projects set generation_revision=next_revision,updated_at=now() where id=run_row.project_id;
  insert into public.project_revisions(project_id,revision,run_id,created_by,files)
  select run_row.project_id,next_revision,target_run_id,auth.uid(),
    coalesce(jsonb_agg(jsonb_build_object('path',f.path,'content',f.content,'language',f.language) order by f.path),'[]'::jsonb)
  from public.project_files f where f.project_id=run_row.project_id;
  update public.generation_runs set status='committed',committed_revision=next_revision,committed_at=now() where id=target_run_id;
  return next_revision;
exception when others then
  if sqlstate <> '40001' then update public.generation_runs set status='failed',error=sqlerrm where id=target_run_id; end if;
  raise;
end;
$$;

create or replace function public.rollback_generation_revision(target_project_id uuid,target_revision bigint,expected_revision bigint)
returns bigint language plpgsql security definer set search_path = public as $$
declare snapshot jsonb; current_revision bigint; next_revision bigint;
begin
  if not public.can_edit_project(target_project_id) then raise exception 'project access denied'; end if;
  select generation_revision into current_revision from public.projects where id=target_project_id for update;
  if current_revision <> expected_revision then raise exception 'generation conflict' using errcode='40001'; end if;
  select files into snapshot from public.project_revisions where project_id=target_project_id and revision=target_revision;
  if snapshot is null then raise exception 'revision not found'; end if;
  delete from public.project_files where project_id=target_project_id;
  insert into public.project_files(project_id,path,content,language)
  select target_project_id,x.path,x.content,x.language from jsonb_to_recordset(snapshot) as x(path text,content text,language text);
  next_revision := current_revision + 1;
  update public.projects set generation_revision=next_revision,updated_at=now() where id=target_project_id;
  insert into public.project_revisions(project_id,revision,created_by,files)
  values(target_project_id,next_revision,auth.uid(),snapshot);
  return next_revision;
end;
$$;

revoke all on function public.begin_generation(uuid,text) from public;
revoke all on function public.commit_generation(uuid,bigint,jsonb) from public;
revoke all on function public.rollback_generation_revision(uuid,bigint,bigint) from public;
grant execute on function public.begin_generation(uuid,text) to authenticated;
grant execute on function public.commit_generation(uuid,bigint,jsonb) to authenticated;
grant execute on function public.rollback_generation_revision(uuid,bigint,bigint) to authenticated;
