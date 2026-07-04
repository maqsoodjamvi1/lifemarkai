-- Migration 076: Custom MCP chat connectors (Lovable parity)
-- Users register their own remote MCP servers (Streamable-HTTP transport).
-- The Agent loads enabled servers per run, lists their tools, and can call them
-- as namespaced "mcp_*" tools (lib/ai/mcp-client.ts + app/api/mcp/servers).
-- last_tools stores tool NAMES + DESCRIPTIONS only — never call results.

create table if not exists public.user_mcp_servers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  name text not null,
  url text not null,
  -- Full header value, e.g. "Bearer xyz". Nullable for no-auth servers.
  auth_header text,
  enabled boolean not null default true,
  last_status text,
  last_tools jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.user_mcp_servers enable row level security;

-- Owner-only: connector URLs and auth headers are private to their owner.
drop policy if exists "user_mcp_servers_owner_all" on public.user_mcp_servers;
create policy "user_mcp_servers_owner_all" on public.user_mcp_servers
  for all using (user_id = auth.uid())
  with check (user_id = auth.uid());

create index if not exists user_mcp_servers_user_enabled_idx
  on public.user_mcp_servers(user_id, enabled);

-- Reuse the shared updated_at trigger function from migration 068.
drop trigger if exists user_mcp_servers_updated_at on public.user_mcp_servers;
create trigger user_mcp_servers_updated_at
  before update on public.user_mcp_servers
  for each row execute function public.update_project_ai_agents_updated_at();
