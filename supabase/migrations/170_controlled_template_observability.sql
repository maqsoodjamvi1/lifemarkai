-- Durable template contract and generation reliability telemetry.
create table if not exists public.controlled_template_versions (
  template_key text not null,
  version text not null,
  framework text not null,
  modules jsonb not null default '[]'::jsonb,
  cache_key text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (template_key,version)
);
alter table public.controlled_template_versions enable row level security;
drop policy if exists "template versions readable" on public.controlled_template_versions;
create policy "template versions readable" on public.controlled_template_versions for select using (true);

insert into public.controlled_template_versions(template_key,version,framework,modules,cache_key)
values
 ('static-browser','2026.08.1','static','[]','static-browser:2026.08.1'),
 ('vite-app','2026.08.1','react','["dashboard"]','vite-app:2026.08.1'),
 ('tanstack-crm','2026.08.1','tanstack-start','["auth","roles","audit","contacts","pipeline","dashboard"]','tanstack-crm:2026.08.1'),
 ('tanstack-erp','2026.08.1','tanstack-start','["auth","roles","audit","inventory","orders","invoicing","dashboard"]','tanstack-erp:2026.08.1')
on conflict (template_key,version) do update set framework=excluded.framework,modules=excluded.modules,cache_key=excluded.cache_key,active=true;

alter table public.generation_runs add column if not exists template_key text;
alter table public.generation_runs add column if not exists template_version text;
alter table public.generation_runs add column if not exists verification_ms integer;
alter table public.generation_runs add column if not exists repair_rounds integer not null default 0;
alter table public.generation_runs add column if not exists failure_stage text;

create or replace function public.record_generation_verification(
  target_project_id uuid,
  target_template_key text,
  target_template_version text,
  target_repair_rounds integer,
  verification_passed boolean,
  target_failure_stage text default null
) returns void
language plpgsql security definer set search_path=public as $$
begin
  if not public.can_edit_project(target_project_id) then raise exception 'project access denied'; end if;
  update public.generation_runs set
    template_key=target_template_key,
    template_version=target_template_version,
    repair_rounds=greatest(coalesce(target_repair_rounds,0),0),
    failure_stage=case when verification_passed then null else coalesce(target_failure_stage,'verification') end
  where id=(
    select id from public.generation_runs
    where project_id=target_project_id and user_id=auth.uid()
    order by created_at desc limit 1
  );
end;
$$;
revoke all on function public.record_generation_verification(uuid,text,text,integer,boolean,text) from public;
grant execute on function public.record_generation_verification(uuid,text,text,integer,boolean,text) to authenticated;
