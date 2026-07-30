-- Migration 157 — CVE suppressions, code-download restriction, publish audience.
--
-- Three of the remaining Lovable gaps need storage. Grouped into one migration
-- because they are all small and all owner-scoped settings.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Dependency CVE suppressions (gap #16).
--
-- Per (project, package, advisory) rather than per package. Muting a whole package
-- because one advisory does not apply is how the next real advisory gets missed —
-- so the advisory id is part of the key, not a note on the row.
-- ─────────────────────────────────────────────────────────────────────────────
create table if not exists dependency_cve_suppressions (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references projects(id) on delete cascade,
  package_name  text not null,
  advisory_id   text not null,
  -- Required, deliberately. A suppression with no stated reason is
  -- indistinguishable from someone silencing an alert they did not understand.
  reason        text not null check (length(trim(reason)) >= 10),
  suppressed_by uuid not null references auth.users(id) on delete cascade,
  created_at    timestamptz not null default now(),
  unique (project_id, package_name, advisory_id)
);

create index if not exists dependency_cve_suppressions_project_idx
  on dependency_cve_suppressions (project_id);

alter table dependency_cve_suppressions enable row level security;

drop policy if exists "owners manage their cve suppressions" on dependency_cve_suppressions;
create policy "owners manage their cve suppressions"
  on dependency_cve_suppressions
  for all
  using (
    exists (
      select 1 from projects p
      where p.id = dependency_cve_suppressions.project_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from projects p
      where p.id = dependency_cve_suppressions.project_id
        and p.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────────────────────────
-- 1b. Revocation provenance for API keys (gap #8).
--
-- Validity is already gated on api_keys.is_active (migration 008), and that stays
-- the field that revokes. These two columns record WHEN and WHY, which matters when
-- a key was revoked automatically and the owner needs to understand what happened.
-- Adding a timestamp alone would have been worse than nothing: it looks like a
-- revocation without being one.
-- ─────────────────────────────────────────────────────────────────────────────
alter table api_keys
  add column if not exists revoked_at timestamptz,
  add column if not exists revoked_reason text;

comment on column api_keys.revoked_at is
  'Set alongside is_active = false. Informational only — is_active is what gates validity.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Restrict who can download project code (gap #10).
--
-- Default TRUE: this is a restriction being made available, not a capability being
-- taken away from existing users. Flipping the default would silently break
-- everyone's export button on deploy.
-- ─────────────────────────────────────────────────────────────────────────────
alter table profiles
  add column if not exists allow_code_download boolean not null default true;

comment on column profiles.allow_code_download is
  'When false, only the workspace owner may export or download project code. Checked by the export/download routes.';

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Publish audience control (gap #7).
--
-- Replaces three coarse tiers (public / workspace / private) with an explicit
-- allowlist. `audience` keeps the coarse mode for backwards compatibility; the
-- table holds the named grants when audience = 'custom'.
-- ─────────────────────────────────────────────────────────────────────────────
alter table projects
  add column if not exists publish_audience text not null default 'public'
    check (publish_audience in ('public', 'workspace', 'private', 'custom'));

comment on column projects.publish_audience is
  'Who may view the published app. ''custom'' defers to project_publish_grants.';

create table if not exists project_publish_grants (
  id           uuid primary key default gen_random_uuid(),
  project_id   uuid not null references projects(id) on delete cascade,
  -- Exactly one of these is set; the check below enforces it.
  group_id     uuid references member_groups(id) on delete cascade,
  user_id      uuid references auth.users(id) on delete cascade,
  email        text,
  -- True when the grantee is outside the workspace. Surfaced as an "EXT" label so
  -- an external viewer is never mistaken for a colleague.
  is_external  boolean not null default false,
  created_by   uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  constraint one_grantee_only check (
    (case when group_id is not null then 1 else 0 end) +
    (case when user_id  is not null then 1 else 0 end) +
    (case when email    is not null then 1 else 0 end) = 1
  )
);

create index if not exists project_publish_grants_project_idx
  on project_publish_grants (project_id);
create unique index if not exists project_publish_grants_unique_email_idx
  on project_publish_grants (project_id, lower(email)) where email is not null;

alter table project_publish_grants enable row level security;

drop policy if exists "owners manage publish grants" on project_publish_grants;
create policy "owners manage publish grants"
  on project_publish_grants
  for all
  using (
    exists (
      select 1 from projects p
      where p.id = project_publish_grants.project_id
        and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from projects p
      where p.id = project_publish_grants.project_id
        and p.user_id = auth.uid()
    )
  );
