# Deploy LifemarkAI on Coolify (Hostinger VPS)

Step-by-step to run the **TanStack Start** app on a Hostinger VPS via Coolify,
using the `Dockerfile` in the repo root.

> The app is a TanStack Start front/back plus an isolated AI SSE worker in one
> container; **Supabase, OpenRouter,
> Stripe, etc. are external services** reached by env vars. Apply DB migrations
> to your Supabase project separately (see §6).

## Runtime layout (one container)

| Port | Process |
|------|---------|
| 3000 | TanStack Start server (`.output/server/index.mjs`) — the only exposed port |
| 3010 | AI SSE worker (chat/agent/fix) |

Both processes are supervised by `scripts/start-production.mjs` (the container
CMD). The worker listens on localhost only.

## 1. Hostinger VPS prep

1. Buy a Hostinger **VPS**. **≥ 4 GB** is enough for Coolify **build** of this app.
   For **live Docker previews on the same box**, plan **16 GB / 4–8 vCPU**.
   Choose **Ubuntu 22.04/24.04**. Note the server's public **IP**.
2. SSH in as root: `ssh root@YOUR_VPS_IP`.
3. Update: `apt update && apt -y upgrade`.
4. Point your domain at the VPS: create an **A record**
   `app.yourdomain.com → YOUR_VPS_IP`. DNS first so SSL can issue later.

## 2. Install Coolify

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

Open `http://YOUR_VPS_IP:8000`, create the admin account, complete onboarding.
Then in Coolify → **Settings → set your instance domain** and let it grab SSL.

## 3. Create the application

1. **Projects → + New → Application**.
2. **Source:** connect your Git provider and pick the LifemarkAI repo + branch.
3. **Build Pack:** select **Dockerfile** (root `Dockerfile`).
4. **Port:** set the exposed port to **3000**.
5. **Domain:** set `https://app.yourdomain.com`.
6. **Health check (optional):** HTTP GET `/api/health` on port 3000.

## 4. Environment variables (the important part)

### Build-time (must be marked "Build Variable" — inlined by `vite build`)

`VITE_*` **and** `NEXT_PUBLIC_*` client vars are baked into the bundle during
the Docker build (the Vite config maps both):

```
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_APP_URL=https://app.yourdomain.com
# The NEXT_PUBLIC_* equivalents may also be set; either prefix works.
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com
# Live Docker preview (Lovable-style origin). Must be 1 in production.
NEXT_PUBLIC_ENABLE_SANDBOX_PREVIEW=1
```

### Runtime (server-only secrets — normal env, NOT build vars)

```
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
OPENROUTER_API_KEY=sk-or-...
# (optional) direct provider keys / image gen
OPENAI_API_KEY=...
GOOGLE_GENERATIVE_AI_API_KEY=...
ANTHROPIC_API_KEY=...
# Stripe (if using billing)
STRIPE_SECRET_KEY=...
STRIPE_WEBHOOK_SECRET=...
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=...   # build var
# Email (if using Resend)
RESEND_API_KEY=...
# Cron auth (see §7)
CRON_SECRET=some-long-random-string
# Do NOT set MODAL_TOKEN_* — Coolify Docker is the preview engine.
SANDBOX_PROVIDER=docker
SANDBOX_PREVIEW_DOMAIN=preview.yourdomain.com
SANDBOX_PROXY_NETWORK=coolify
SANDBOX_CERT_RESOLVER=letsencrypt
SANDBOX_TRAEFIK_ENTRYPOINT=https
SANDBOX_IMAGE=node:22-alpine
DOCKER_SOCKET=/var/run/docker.sock
# Optional model pins; leave unset to use approved defaults
OPENROUTER_CODING_MODEL=qwen/qwen3-coder
OPENROUTER_BALANCED_MODEL=deepseek/deepseek-v4-pro
OPENROUTER_FAST_MODEL=deepseek/deepseek-v4-flash
```

See `.env.local.example` for the full list. Anything unset degrades gracefully.

> Tip: set `NODE_OPTIONS=--max-old-space-size=4096` as a build variable if the
> build OOMs on a smaller VPS.

## 5. Docker live preview on this Coolify host

The editor only iframes a **sandbox origin**. On Coolify that origin is a
container Traefik routes at `https://<project>.preview.yourdomain.com`.

1. **DNS:** A record `*.preview.yourdomain.com` → the same VPS IP as Coolify.
   (HTTP-01 issues one cert per project hostname, not a wildcard cert.)
2. **Mount the Docker socket** on the LifemarkAI application (Coolify →
   Storages / volumes):
   `/var/run/docker.sock` → `/var/run/docker.sock` (read/write).
   The app uses it to create preview containers. Never mount the socket
   *into* those preview containers (the sandbox code does not).
3. **Same Traefik network:** leave `SANDBOX_PROXY_NETWORK` unset to auto-join
   Coolify’s `coolify` network when it exists, or set `SANDBOX_PROXY_NETWORK=coolify`
   explicitly. Preview containers get `traefik.enable=true` labels.
4. **RAM:** keep the sandbox at **1 GB / 1 CPU** (`SANDBOX_MEMORY_MB=1024`,
   `SANDBOX_CPUS=1`) so Coolify, Traefik, and the app still have room on the
   same box. Last night’s 2 GB / 2 CPU default starved the host and turned a
   live preview into a minutes-long pause/cold-boot. Raise only if the VPS
   has spare cores.
5. **Leave Modal tokens unset** so traffic does not go to a paid Modal account.
6. Redeploy. First preview may take a few minutes (`docker pull` of
   `SANDBOX_IMAGE`). After that, reopen is a warm container reuse.

Security: this runs untrusted generated code on the **same Docker daemon** as
Coolify. Stronger isolation is a second VPS; the code in `src/lib/sandbox/docker.ts`
already caps CPU/RAM and drops capabilities.

## 6. Deploy

Click **Deploy**. Coolify builds the Dockerfile (root deps → Start deps →
route/AI bundles → vite build → runner) and starts the container on port 3000
behind Traefik with SSL. First build takes several minutes.

Enable **Automatic Deployment** to redeploy on push.

## 7. Database migrations (run once, separately)

Apply all `supabase/migrations/0XX_*.sql` in order via the Supabase Dashboard
SQL editor or `supabase db push`. All migrations are idempotent.

## 8. Cron jobs (Coolify Scheduled Tasks)

Vercel crons don't run here. In Coolify → your app → **Scheduled Tasks**, add
five tasks (all authenticated with `CRON_SECRET`):

| Schedule | Command |
|----------|---------|
| `0 3 * * *` | `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cloud/daily-backups` |
| `30 3 * * *` | `curl -fsS -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cloud/bill-usage` |
| `0 4 * * *` | `curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/health-scan` |
| `15 4 * * *` | `curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/security/scheduled-scan` |
| `0 5 * * *` | `curl -fsS -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sandbox-cleanup` |

(Daily-backups and bill-usage are POST; the rest are GET.)

## 9. Post-deploy checks

- `https://app.yourdomain.com` — landing page loads over HTTPS.
- `/api/health` returns 200.
- Sign up / log in (Supabase auth) — confirms the Supabase URL/keys.
- Create a project and run a build — confirms `OPENROUTER_API_KEY` + credits
  (AI worker on :3010 handles the SSE stream).
- Open the editor — full `EditorLayout` should mount (not the minimal shell).
- Generate an app — preview iframe URL is `https://<projectId>.preview.yourdomain.com` (Docker on this Coolify host), not a blank srcdoc pane.

## 10. Gotchas specific to this app

- **Build memory:** ≥4 GB RAM or set the heap env above.
- **`VITE_*`/`NEXT_PUBLIC_*` are build-time:** if Supabase auth looks wrong in
  the browser, re-add them as **Build Variables** and redeploy.
- **Workers are in-container:** no extra services needed; if a worker dies the
  supervisor restarts it (check container logs for `[start-production]`).
- **AI Gateway (optional):** set `LIFEMARK_GATEWAY_URL` + `LIFEMARK_GATEWAY_SECRET`
  to route AI through the Cloudflare Worker; otherwise providers are called
  directly.
- **Persistent storage:** state lives in Supabase; no volumes required.
- **Emergency Next runtime:** `npm run dev:next` still exists at the repo root
  for local comparison only — production never runs Next.

## 11. Definition of done (preview reliability)

Do **not** claim parity with Lovable until this soak passes on the Coolify host.

Required host (unchanged): **~16 GB RAM**, `/var/run/docker.sock` mounted, wildcard DNS `*.preview.yourdomain.com`, `SANDBOX_PROVIDER=docker`, `NEXT_PUBLIC_ENABLE_SANDBOX_PREVIEW=1`. Leave Modal tokens unset.

Soak (20 projects, zero Retry):

1. New project → one generate prompt.
2. Wait until the iframe is the sandbox HTTPS origin (`lifecycle ready` in Preview console).
3. Visual-edit one label; confirm it persists.
4. Publish.
5. Let the sandbox go idle (or stop the container) → editor shows **Still building?** / **Resume preview**, not a connection-reset iframe.
6. Resume → warm reconnect (not a full `npm install` loop). At most one cold boot, then a hard fail.

Contract tests (no Docker): `npm run verify:preview-lifecycle`.

Timings land in container logs as `preview.boot_ms` / `preview.settle_ms` / `preview.pause` / `preview.resume_ms` / `preview.reconnect_ok`, and on `GET /api/sandbox/status` → `slo`.
