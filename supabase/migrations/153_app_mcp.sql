-- App-as-MCP ("agent integrations", Lovable parity, Jul 2026)
-- Expose a PUBLISHED app's actions as MCP tools that external AI assistants
-- (ChatGPT / Claude / Cursor) can call. Served by app/api/apps/[id]/mcp.
--
-- Each row configures one project's MCP surface. `actions` is a list of
-- owner-declared tools, each proxied to the deployed app:
--   { "name": "create_lead", "description": "...", "method": "POST",
--     "path": "/api/leads", "input_schema": { ...JSON Schema... } }

create table if not exists public.app_mcp (
  project_id  uuid primary key references public.projects(id) on delete cascade,
  enabled     boolean not null default false,
  -- Bearer token the external agent presents; rotate by updating this.
  token       text not null default encode(gen_random_bytes(24), 'hex'),
  actions     jsonb not null default '[]'::jsonb,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

alter table public.app_mcp enable row level security;

-- Project owner manages their own app's MCP config. The MCP endpoint itself
-- reads via the service role (admin client), which bypasses RLS.
drop policy if exists "app_mcp owner manage" on public.app_mcp;
create policy "app_mcp owner manage" on public.app_mcp
  for all
  using (
    exists (
      select 1 from public.projects p
      where p.id = app_mcp.project_id and p.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.projects p
      where p.id = app_mcp.project_id and p.user_id = auth.uid()
    )
  );

create index if not exists idx_app_mcp_enabled on public.app_mcp (project_id) where enabled;
