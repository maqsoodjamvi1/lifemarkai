-- Atomically activate a complete staged filesystem (used by autonomous agent runs).
create or replace function public.commit_generation_snapshot(
  target_run_id uuid,
  expected_revision bigint,
  staged_files jsonb
) returns bigint
language plpgsql security definer set search_path = public as $$
declare run_row public.generation_runs%rowtype; current_revision bigint; next_revision bigint;
begin
  select * into run_row from public.generation_runs where id=target_run_id for update;
  if not found or run_row.user_id <> auth.uid() or not public.can_edit_project(run_row.project_id) then
    raise exception 'generation access denied';
  end if;
  if run_row.status <> 'staging' then raise exception 'generation is not staging'; end if;
  if jsonb_typeof(staged_files) <> 'array' or jsonb_array_length(staged_files) = 0 then
    raise exception 'generation has no files';
  end if;
  select generation_revision into current_revision from public.projects where id=run_row.project_id for update;
  if current_revision <> expected_revision or run_row.base_revision <> expected_revision then
    update public.generation_runs set status='conflict',error='project revision changed' where id=target_run_id;
    raise exception 'generation conflict: expected revision %, current revision %',expected_revision,current_revision using errcode='40001';
  end if;

  insert into public.generation_files(run_id,path,content,language)
  select target_run_id,x.path,x.content,x.language
  from jsonb_to_recordset(staged_files) as x(path text,content text,language text)
  where x.path is not null and x.path <> '' and x.content is not null
  on conflict (run_id,path) do update set content=excluded.content,language=excluded.language;

  delete from public.project_files where project_id=run_row.project_id;
  insert into public.project_files(project_id,path,content,language)
  select run_row.project_id,path,content,language from public.generation_files where run_id=target_run_id;

  next_revision := current_revision + 1;
  update public.projects set generation_revision=next_revision,updated_at=now() where id=run_row.project_id;
  insert into public.project_revisions(project_id,revision,run_id,created_by,files)
  values(run_row.project_id,next_revision,target_run_id,auth.uid(),staged_files);
  update public.generation_runs set status='committed',committed_revision=next_revision,committed_at=now() where id=target_run_id;
  return next_revision;
exception when others then
  if sqlstate <> '40001' then update public.generation_runs set status='failed',error=sqlerrm where id=target_run_id; end if;
  raise;
end;
$$;

revoke all on function public.commit_generation_snapshot(uuid,bigint,jsonb) from public;
grant execute on function public.commit_generation_snapshot(uuid,bigint,jsonb) to authenticated;
