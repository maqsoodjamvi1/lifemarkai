-- Ensure every generation has a restorable pre-generation revision.
create or replace function public.begin_generation(target_project_id uuid, run_source text default 'chat')
returns table(run_id uuid, base_revision bigint)
language plpgsql security definer set search_path = public as $$
declare current_revision bigint; new_run uuid;
begin
  if not public.can_edit_project(target_project_id) then raise exception 'project access denied'; end if;
  select generation_revision into current_revision from public.projects where id=target_project_id for update;
  if not found then raise exception 'project not found'; end if;
  insert into public.project_revisions(project_id,revision,created_by,files)
  select target_project_id,current_revision,auth.uid(),
    coalesce(jsonb_agg(jsonb_build_object('path',f.path,'content',f.content,'language',f.language) order by f.path),'[]'::jsonb)
  from public.project_files f where f.project_id=target_project_id
  on conflict (project_id,revision) do nothing;
  insert into public.generation_runs(project_id,user_id,base_revision,source)
  values(target_project_id,auth.uid(),current_revision,coalesce(nullif(run_source,''),'chat')) returning id into new_run;
  return query select new_run,current_revision;
end;
$$;

revoke all on function public.begin_generation(uuid,text) from public;
grant execute on function public.begin_generation(uuid,text) to authenticated;
