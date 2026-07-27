-- App-user connectors (Lovable "app user connectors", Jul 2026)
-- Each END-USER of a built app connects their OWN third-party account (Google,
-- Slack, Salesforce, …) via OAuth. The app then calls that provider AS the
-- end-user through the connector proxy, using the token stored here.
--
-- Security model: tokens are read ONLY server-side (connector-proxy / edge)
-- via the service role. RLS denies all direct client access — no policy that
-- exposes tokens to `anon`/`authenticated`. Tokens should additionally be
-- encrypted at rest at the app layer before insert where a KMS is available.

create table if not exists public.app_user_connections (
  id            uuid primary key default gen_random_uuid(),
  project_id    uuid not null references public.projects(id) on delete cascade,
  -- Opaque identifier for the end-user WITHIN the built app (their app-session
  -- user id or email). Not a LifemarkAI account.
  app_user_id   text not null,
  provider      text not null,               -- e.g. "google", "slack", "salesforce"
  access_token  text not null,
  refresh_token text,
  expires_at    timestamptz,
  scopes        text[],
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (project_id, app_user_id, provider)
);

create index if not exists idx_app_user_conn_lookup
  on public.app_user_connections (project_id, app_user_id, provider);

alter table public.app_user_connections enable row level security;
-- Intentionally NO permissive policy: only the service role (which bypasses
-- RLS) may read/write these token rows. Client roles get nothing.
revoke all on public.app_user_connections from anon, authenticated;

-- Transient OAuth state (CSRF) for the connect handshake — short-lived.
create table if not exists public.app_user_oauth_state (
  state       text primary key,
  project_id  uuid not null references public.projects(id) on delete cascade,
  app_user_id text not null,
  provider    text not null,
  redirect_to text,
  created_at  timestamptz not null default now()
);
alter table public.app_user_oauth_state enable row level security;
revoke all on public.app_user_oauth_state from anon, authenticated;
