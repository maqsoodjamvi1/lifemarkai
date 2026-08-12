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

1. Buy a Hostinger **VPS** (KVM 2 or higher recommended — **≥ 4 GB RAM**; the
   Vite build + 203 route bundles are memory-heavy). Choose **Ubuntu 22.04/24.04**.
   Note the server's public **IP**.
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
NEXT_PUBLIC_ENABLE_SANDBOX_PREVIEW=0     # optional live sandbox preview flag
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
# Modal sandbox preview (optional)
MODAL_TOKEN_ID=...
MODAL_TOKEN_SECRET=...
# Optional model pins; leave unset to use approved defaults
OPENROUTER_CODING_MODEL=qwen/qwen3-coder
OPENROUTER_BALANCED_MODEL=deepseek/deepseek-v4-pro
OPENROUTER_FAST_MODEL=deepseek/deepseek-v4-flash
```

See `.env.local.example` for the full list. Anything unset degrades gracefully.

> Tip: set `NODE_OPTIONS=--max-old-space-size=4096` as a build variable if the
> build OOMs on a smaller VPS.

## 5. Deploy

Click **Deploy**. Coolify builds the Dockerfile (root deps → Start deps →
route/AI bundles → vite build → runner) and starts the container on port 3000
behind Traefik with SSL. First build takes several minutes.

Enable **Automatic Deployment** to redeploy on push.

## 6. Database migrations (run once, separately)

Apply all `supabase/migrations/0XX_*.sql` in order via the Supabase Dashboard
SQL editor or `supabase db push`. All migrations are idempotent.

## 7. Cron jobs (Coolify Scheduled Tasks)

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

## 8. Post-deploy checks

- `https://app.yourdomain.com` — landing page loads over HTTPS.
- `/api/health` returns 200.
- Sign up / log in (Supabase auth) — confirms the Supabase URL/keys.
- Create a project and run a build — confirms `OPENROUTER_API_KEY` + credits
  (AI worker on :3010 handles the SSE stream).
- Open the editor — full `EditorLayout` should mount (not the minimal shell).
- If Modal env is set: preview cold boot (sandbox worker on :3012).

## 9. Gotchas specific to this app

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
