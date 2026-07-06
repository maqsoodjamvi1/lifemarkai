# LifemarkAI Public API & MCP Server

Build on LifemarkAI programmatically. One key system (`lmk_…`) now powers the REST
API, the AI endpoints, and the MCP server — issue a scoped key once and use it everywhere.

## Authentication

Create a key in the dashboard under **Settings → API keys** (`POST /api/keys`). The
plaintext `lmk_…` value is shown **once** and stored only as a SHA-256 hash. Send it as a
bearer token:

```
Authorization: Bearer lmk_xxxxxxxxxxxxxxxxxxxx
```

### Scopes

Keys carry scopes; a request without the required scope gets `403`. Available scopes:

| Scope | Grants |
|-------|--------|
| `projects:read` | List/read projects and files |
| `projects:write` | Create projects, write files |
| `ai:chat`, `ai:plan`, `ai:build` | Drive the AI (chat/plan/build) |
| `deploy` | Trigger deployments |

Legacy keys created before scopes existed (empty scope list) are treated as full-access.

## REST API (`/api/v1`)

All responses are JSON with permissive CORS. All access is scoped to the key owner.

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| `GET` | `/api/v1/projects` | `projects:read` | List your projects (`?limit=1..100`) |
| `POST` | `/api/v1/projects` | `projects:write` | Create a project `{ name, description?, framework? }` |
| `GET` | `/api/v1/projects/:id` | `projects:read` | Project metadata + file count |
| `GET` | `/api/v1/projects/:id/files` | `projects:read` | List files (path, language, size) |
| `GET` | `/api/v1/projects/:id/files?path=…` | `projects:read` | One file with full content |

### Examples

```bash
# List projects
curl -H "Authorization: Bearer $LMK_KEY" \
  https://lifemarkai.app/api/v1/projects

# Create a project
curl -X POST -H "Authorization: Bearer $LMK_KEY" -H "Content-Type: application/json" \
  -d '{"name":"My App","framework":"nextjs"}' \
  https://lifemarkai.app/api/v1/projects

# Read one file
curl -H "Authorization: Bearer $LMK_KEY" \
  "https://lifemarkai.app/api/v1/projects/PROJECT_ID/files?path=src/App.tsx"
```

`framework` is one of `nextjs` (default), `react`, `vue`, `svelte`, `vanilla`.

## MCP Server (`/api/mcp`)

JSON-RPC 2.0 over Streamable HTTP. Connect from Claude Desktop, Cursor, or any MCP client
using the **same `lmk_…` key** (the legacy per-user MCP token still works as a fallback):

```
claude mcp add lifemarkai --transport http https://lifemarkai.app/api/mcp?token=lmk_…
```

```jsonc
// .cursor/mcp.json
{ "lifemarkai": { "url": "https://lifemarkai.app/api/mcp?token=lmk_…" } }
```

### Tools & required scopes

| Tool | Scope |
|------|-------|
| `list_projects`, `get_project_files`, `get_project_info`, `get_deploy_status`, `list_templates` | `projects:read` |
| `update_project_file`, `create_project` | `projects:write` |
| `send_chat_message` | `ai:build` |
| `deploy_project` | `deploy` |

A scoped key without a tool's scope is rejected with JSON-RPC error `-32002`. `GET /api/mcp`
returns server info and the live tool list.

## Errors

| Status | Meaning |
|--------|---------|
| `401` | Missing/invalid/revoked key |
| `403` | Key lacks the required scope |
| `404` | Resource not found or not owned by the key |

Revoke a key any time (`DELETE /api/keys?id=…`) — it stops working immediately across REST,
AI, and MCP.
