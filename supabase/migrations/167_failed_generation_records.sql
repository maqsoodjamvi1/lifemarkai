-- Preserve rejected candidates for diagnostics without activating their files.
create or replace function public.record_failed_generation(
  target_project_id uuid,
  run_source text,
  staged_files jsonb,
  failure_message text
) returns uuid
language plpgsql security definer set search_path = public as $$
declare current_revision bigint; new_run_id uuid;
begin
  if not public.can_edit_project(target_project_id) then raise exception 'project access denied'; end if;
  select generation_revision into current_revision from public.projects where id=target_project_id;
  if not found then raise exception 'project not found'; end if;
  insert into public.generation_runs(project_id,user_id,base_revision,status,source,error)
  values(target_project_id,auth.uid(),current_revision,'failed',coalesce(nullif(run_source,''),'chat'),left(failure_message,4000))
  returning id into new_run_id;
  if jsonb_typeof(staged_files) = 'array' then
    insert into public.generation_files(run_id,path,content,language)
    select new_run_id,x.path,x.content,x.language
    from jsonb_to_recordset(staged_files) as x(path text,content text,language text)
    where x.path is not null and x.path <> '' and x.content is not null
    on conflict (run_id,path) do nothing;
  end if;
  return new_run_id;
end;
$$;

revoke all on function public.record_failed_generation(uuid,text,jsonb,text) from public;
grant execute on function public.record_failed_generation(uuid,text,jsonb,text) to authenticated;
