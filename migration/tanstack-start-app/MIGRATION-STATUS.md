# TanStack Start migration — status (updated Jul 25 2026)

Isolated workspace under `migration/tanstack-start-app`.
**Start-only runtime:** TanStack Start serves UI + APIs. A Next.js process is **not** required.

## Architecture (API worker cutover)

| Concern | Strategy |
|---------|----------|
| Pages / loaders | TanStack file routes + `createServerFn` + Supabase cookie adapter |
| Legacy `app/api/**` + preview | **Isolated API worker** (`scripts/api-http-worker.mjs` on `:3011`) — esbuild-prebundles all routes; Vite never imports them |
| Sandbox heavy paths | Dedicated sandbox worker (`sandbox-worker-client.ts` → same script on `:3012`) |
| Native Start routes | Explicit `src/routes/api/**` (projects, files, messages, skills, credits GET, health, etc.) — own the path |
| AI chat/agent | Start-cookie auth → AI worker (`scripts/ai-http-worker.mjs` + `lib/ai/http/*`) |
| OAuth callback | Native `/auth/callback` on Start origin |
| Editor | `EditorLayoutBridge` lazy-loads main-repo editor; **no silent EditorShell fallback** — explicit retryable error UI; `?shell=` / `forceShell` for intentional shell |
| Production | `scripts/start-production.mjs` supervisor + root `Dockerfile` (Node 22) — see `docs/DEPLOY_COOLIFY.md` |

**Deleted:** `run-next-route.ts`, `proxy-to-next.ts` (no Next origin).

### API manifest

- `scripts/build-api-manifest.mjs` — esbuild-prebundles **206** routes (203 `app/api` + 2 preview + 1 preview-by-slug) → `.tmp/api-routes/*.mjs` + `manifest.json` + committed `src/lib/generated/api-route-coverage.json`
- `scripts/verify-api-coverage.mjs` — asserts disk/manifest/coverage parity + bundles exist
- Worker matches path → lazy-imports bundle under AsyncLocalStorage cookie context (`__lifemark_request_als_store__`)

## Single-process boot (dev)

```bash
cd migration/tanstack-start-app
cp .env.local.example .env.local   # once
npm install --legacy-peer-deps     # once
npm run dev                        # → http://localhost:3001
# API worker auto-spawns on first unmatched /api proxy (or: npm run dev:api-worker)
```

From repo root: `npm run dev` → Start on **3001**. Emergency Next: `npm run dev:next` only.

`VITE_NEXT_ORIGIN` is deprecated / unused.

## Verified (this cutover check — Jul 25 2026)

| Gate | Result |
|------|--------|
| `node scripts/build-api-manifest.mjs` | **PASS** — 206 routes bundled |
| `node scripts/verify-api-coverage.mjs` | **PASS** — full coverage, no drift |
| `npm run type-check` | **PASS** (incl. post–`api-adapter` simplification; no imports of removed helpers) |
| API worker `/health` | **PASS** — `ok:true`, routes:206 |
| Worker `GET /api/health` | **PASS** — real handler JSON (`status/db/uptime`), not manifest 404 |
| Worker `POST /api/ai/enhance` | **PASS** — `401 {"error":"Unauthorized"}` from real handler |
| Worker `GET /api/projects/<uuid>` | **PASS** — `404 {"error":"Not found"}` (handler behavior for unauth GET; params matched) |
| Sandbox worker `:3012` `/health` | **PASS** — `ok:true`, routes:206 |
| Sandbox `GET …/sandbox-preview` | **PASS** — `401 {"error":"Unauthorized"}` (real handler, not manifest 404) |
| Sandbox `PATCH …/sandbox-preview/sync` | **PASS** — `401 {"error":"Unauthorized"}` (real handler) |
| Cold dual-worker lock (`3011`+`3012`, deleted `.tmp/api-routes`) | **PASS** — one builds, peer waits via `Atomics.wait` lock; both `ok:true` / 206 routes |
| Dev `GET /api/health` | **PASS** — 200 (native Start) |
| Dev `GET /api/skills` | **PASS** — 401 (native) |
| Dev `POST /api/ai/enhance` | **PASS** — 401 via worker proxy (not adapter 404) |
| Dev `POST /api/billing/checkout` + `/portal` | **PASS** — 401 real handlers (was 503 until `Expect` header stripped) |
| Dev `POST …/sandbox-preview` via Start → `:3012` | **PASS** — 401 Unauthorized (no Next `:3000`) |
| Dev `GET /api/v1/projects` / `/api/mcp` | **PASS** — real v1 key error / MCP discovery JSON |
| Cron without secret (`health-scan`, `daily-backups`) | **PASS** — 403 Forbidden |
| Authenticated editor on `:3001` | **PASS** — full shared `EditorLayout` (chat + preview chrome; not `EditorShell`) |
| Dev `GET /`, `/login` | **PASS** — 200 HTML |
| `npx vite build` | **PASS** — client 31s + SSR 7.5s, exit 0 (chunk-size warnings only) |
| Vite SSR OOM / import errors during smoke | **None observed** |

### Memory (approx RSS after smoke)

| Process | RSS |
|---------|-----|
| Vite (`vite.js` :3001) | ~293 MB |
| API worker (`api-http-worker.mjs` :3011) | ~83–86 MB |
| AI worker (already running) | ~53 MB |

### Fixes applied during verification

| File | Fix |
|------|-----|
| `app/api/scim/v2/Users/route.ts` | Parenthesize `??` / `\|\|` so esbuild can parse |
| `src/lib/next-shims/headers.ts` | `await cookies()` infinite thenable unwrap → OOM; resolve plain store |
| `scripts/api-http-worker.mjs` | Invalidate bundles when `src/lib/next-shims` changes; **lock: replace CPU spin with `Atomics.wait`, stale-lock steal (120s), `EEXIST`-only retry; log labels use `WORKER_NAME`** |
| `src/lib/worker-proxy.ts` | Strip hop-by-hop + `Expect` headers (PowerShell/`Invoke-WebRequest` sends `Expect: 100-continue` → undici `fetch failed`) |
| `.env.local` | Commented deprecated `VITE_NEXT_ORIGIN` |
| `tsconfig.json` | Dual `@/*` paths + pin `react`/`react-dom` types (avoid dual `@types/react`) |
| Small type fixes | next-shims, supabase `setAll`, Link/`navigate` typed routes, SSO fields, projects serializable return |

## Structural-only / blocked on this machine

| Item | Notes |
|------|--------|
| Docker Desktop install | **Blocked** — Docker not installed; WSL not installed; non-admin session; installer download stalled at ~83/592 MB (~55 KB/s). Needs **manual** WSL + Docker Desktop install + reboot (steps below). |
| Docker image build / container smoke | Blocked until Docker works |
| Stripe webhook live delivery | Handler reachable; no signed Stripe event soaked |
| Cron with `CRON_SECRET` | No `CRON_SECRET` in env — unauthorized 403 verified; authorized run not exercised |
| Modal preview URL ready | Editor preview stayed on "Connecting…"; Modal tokens present; full tunnel paint not confirmed |

### Manual Docker install (required before container verify)

1. **Admin PowerShell:** `wsl --install` then **reboot**.
2. Install [Docker Desktop](https://desktop.docker.com/win/main/amd64/Docker%20Desktop%20Installer.exe) (or `winget install -e --id Docker.DockerDesktop --source winget`).
3. Start Docker Desktop; wait until `docker info` succeeds.
4. From repo root (pass build-args from your env; do not commit secrets):
   ```powershell
   docker build -t lifemarkai-start:cutover `
     --build-arg VITE_SUPABASE_URL=$env:VITE_SUPABASE_URL `
     --build-arg VITE_SUPABASE_ANON_KEY=$env:VITE_SUPABASE_ANON_KEY `
     --build-arg VITE_APP_URL=http://localhost:3000 .
   docker run --rm -p 3000:3000 --env-file .env.local lifemarkai-start:cutover
   ```
5. Smoke: `curl http://localhost:3000/api/health` and inside the container hit `127.0.0.1:3010/3011/3012/health`.

Delete incomplete `d:\Projects\lifemarkai\.tmp-docker\DockerDesktopInstaller.exe` before re-downloading.

## Native Start API inventory (subset)

| Area | Paths |
|------|--------|
| Projects CRUD | `/api/projects`, `/api/projects/$id` |
| Files / env / chat | `…/files`, `…/env`, `…/messages`, `…/chat-state` |
| Credits / skills / deploy status | `GET /api/billing/credits`, `/api/skills`, `GET /api/deploy/status` |
| Health | `/api/health` (native; also in worker manifest for direct worker probes) |

Unmatched `/api/*`, `/preview/*`, `/preview-by-slug/*` → API worker via `proxyApiToWorker` / `dispatchAppApi`.

## Still deferred

- Drop unused `next` / retire `dev:next` after launch soak
- Optional native rewrites for hot paths still proxied to the worker
- Authenticated AI SSE soak (login → editor → chat build)
- Coolify sole-app packaging soak

See [`docs/tanstack-start-migration.md`](../../docs/tanstack-start-migration.md) and [`STEP-1-2-ARCHITECTURE.md`](./STEP-1-2-ARCHITECTURE.md).
