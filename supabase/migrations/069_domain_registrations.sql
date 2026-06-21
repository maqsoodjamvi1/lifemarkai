-- Migration 069: in-product domain purchase + target-aware verification
-- Backs the Lovable-parity domain flow (docs/titan/09-domains-hosting.md):
-- search -> pay (Stripe) -> register (registrar) -> wire DNS -> verify -> live.
-- Owner-scoped RLS mirroring the project_ai_* tables in migration 068.

-- Ensure the verification flag the verify route writes exists.
alter table public.projects add column if not exists custom_domain_verified boolean not null default false;
-- Per-domain ownership token (TXT _lifemark-verify.<domain>).
alter table public.projects add column if not exists custom_domain_token text;

create table if not exists public.domain_registrations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  domain text not null,
  registrar text not null default 'cloudflare' check (registrar in ('cloudflare', 'ionos')),
  status text not null default 'searching' check (status in
    ('searching', 'pending_payment', 'registered', 'dns_pending', 'live', 'failed', 'expired')),
  price_cents integer not null default 0,
  years integer not null default 1,
  auto_renew boolean not null default true,
  stripe_ref text,                       -- checkout session / payment intent id
  registration_ref text,                 -- registrar-side order id
  verify_token text,                     -- TXT ownership token
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (domain)
);

alter table public.domain_registrations enable row level security;

drop policy if exists "domain_registrations_read" on public.domain_registrations;
create policy "domain_registrations_read" on public.domain_registrations
  for select using (
    user_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = project_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.collaborators c
            where c.project_id = p.id
              and c.user_id = auth.uid()
              and c.accepted_at is not null
          )
        )
    )
  );

drop policy if exists "domain_registrations_write" on public.domain_registrations;
create policy "domain_registrations_write" on public.domain_registrations
  for all using (
    user_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = project_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.collaborators c
            where c.project_id = p.id
              and c.user_id = auth.uid()
              and c.role in ('owner', 'editor')
              and c.accepted_at is not null
          )
        )
    )
  )
  with check (
    user_id = auth.uid()
    or exists (
      select 1 from public.projects p
      where p.id = project_id
        and (
          p.user_id = auth.uid()
          or exists (
            select 1 from public.collaborators c
            where c.project_id = p.id
              and c.user_id = auth.uid()
              and c.role in ('owner', 'editor')
              and c.accepted_at is not null
          )
        )
    )
  );

create index if not exists domain_registrations_project_idx
  on public.domain_registrations(project_id, status);
create index if not exists domain_registrations_user_idx
  on public.domain_registrations(user_id, created_at desc);

-- Note: the Stripe webhook (kind = 'domain_purchase') runs registration +
-- DNS wiring server-side via createAdminClient() (service role bypasses RLS),
-- exactly like the existing app_subscription / cloud-usage paths.

create or replace function public.update_domain_registrations_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists domain_registrations_updated_at on public.domain_registrations;
create trigger domain_registrations_updated_at
  before update on public.domain_registrations
  for each row execute function public.update_domain_registrations_updated_at();
