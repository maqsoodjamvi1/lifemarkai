-- Migration 090: workspace SSO/SCIM settings + SCIM-provisioned users (enterprise beachhead)

create table if not exists public.workspace_identity_settings (
  owner_id uuid primary key references public.profiles(id) on delete cascade,
  sso_config jsonb,
  scim_config jsonb not null default '{}'::jsonb,
  scim_api_key_hash text,
  scim_api_key_prefix text,
  enforce_sso boolean not null default false,
  sso_session_duration text not null default '24h',
  jit_enabled boolean not null default true,
  jit_default_role text not null default 'editor',
  verified_domains text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.workspace_identity_settings enable row level security;

drop policy if exists "workspace_identity_owner" on public.workspace_identity_settings;
create policy "workspace_identity_owner" on public.workspace_identity_settings
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create table if not exists public.workspace_scim_users (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  external_id text not null,
  email text not null,
  display_name text,
  active boolean not null default true,
  groups text[] not null default '{}',
  role text not null default 'editor' check (role in ('viewer', 'editor', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, external_id),
  unique (owner_id, email)
);

create index if not exists idx_workspace_scim_users_owner on public.workspace_scim_users(owner_id);

alter table public.workspace_scim_users enable row level security;

drop policy if exists "workspace_scim_users_owner" on public.workspace_scim_users;
create policy "workspace_scim_users_owner" on public.workspace_scim_users
  for all using (owner_id = auth.uid())
  with check (owner_id = auth.uid());
