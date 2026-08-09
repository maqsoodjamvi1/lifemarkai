-- Persist the preview/generation runtime boundary instead of inferring it in
-- every client. Static projects use srcdoc; framework projects use a sandbox.
alter table public.projects
  add column if not exists runtime text;

update public.projects
set runtime = case when framework in ('static', 'html') then 'static' else 'framework' end
where runtime is null
   or runtime not in ('static', 'framework');

alter table public.projects
  alter column runtime set default 'framework',
  alter column runtime set not null;

alter table public.projects drop constraint if exists projects_runtime_check;
alter table public.projects
  add constraint projects_runtime_check check (runtime in ('static', 'framework'));

create or replace function public.sync_project_runtime()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.runtime := case when new.framework in ('static', 'html') then 'static' else 'framework' end;
  return new;
end;
$$;

drop trigger if exists projects_sync_runtime on public.projects;
create trigger projects_sync_runtime
before insert or update of framework on public.projects
for each row execute function public.sync_project_runtime();
