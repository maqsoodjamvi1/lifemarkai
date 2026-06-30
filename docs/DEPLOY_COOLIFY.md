# Deploy LifemarkAI on Coolify (Hostinger VPS)

Step-by-step to run the Next.js app on a Hostinger VPS via Coolify, using the
`Dockerfile` in the repo root.

> The app is a Next.js front/back; **Supabase, OpenRouter, Stripe, etc. are
> external services** reached by env vars — Coolify only runs the Next.js
> container. Apply DB migrations to your Supabase project separately (see §6).

## 1. Hostinger VPS prep

1. Buy a Hostinger **VPS** (KVM 2 or higher recommended — **≥ 4 GB RAM**; the
   `next build` is memory-heavy). Choose **Ubuntu 22.04/24.04** (a plain OS image,
   not a panel image). Note the server's public **IP**.
2. SSH in as root: `ssh root@YOUR_VPS_IP`.
3. Update: `apt update && apt -y upgrade`.
4. Point your domain at the VPS: in your DNS, create an **A record**
   `app.yourdomain.com → YOUR_VPS_IP` (and optionally `@`/`www`). DNS first so SSL
   can issue later.

## 2. Install Coolify

On the VPS, run the official installer:

```bash
curl -fsSL https://cdn.coollabs.io/coolify/install.sh | bash
```

When it finishes, open `http://YOUR_VPS_IP:8000`, create the admin account, and
complete onboarding (it registers the VPS itself as the deployment server).
Then in Coolify → **Settings → set your instance domain** and let it grab SSL.

## 3. Create the application

1. **Projects → + New → Application**.
2. **Source:** connect your Git provider (GitHub recommended → install the Coolify
   GitHub App and pick the LifemarkAI repo) — or "Public/Private Repository" with
   a deploy key. Choose the branch (e.g. `main`).
3. **Build Pack:** select **Dockerfile** (Coolify auto-detects the root `Dockerfile`).
4. **Port:** set the exposed port to **3000**.
5. **Domain:** set `https://app.yourdomain.com` (Coolify provisions Let's Encrypt
   SSL automatically once DNS resolves).

## 4. Environment variables (the important part)

Add these in the app's **Environment Variables** tab. Two kinds:

### Build-time (must be marked "Build Variable" — they're inlined at build)
Any `NEXT_PUBLIC_*` var is baked into the bundle during `npm run build`, so it
**must** be present as a build variable, not just runtime:

```
NEXT_PUBLIC_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
NEXT_PUBLIC_APP_URL=https://app.yourdomain.com
# Optional feature flag (client-read): live sandbox preview
NEXT_PUBLIC_ENABLE_SANDBOX_PREVIEW=0
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
# Optional model pins; leave unset to use OpenRouter routers
OPENROUTER_CODING_MODEL=openrouter/pareto-code
OPENROUTER_BALANCED_MODEL=openrouter/fusion
OPENROUTER_FAST_MODEL=deepseek/deepseek-v4-flash
BUILD_MAX_TOKENS=64000                   # optional, single-pass app builds
```

See `.env.local.example` for the full list. Anything unset degrades gracefully.

> Tip: set `NODE_OPTIONS=--max-old-space-size=4096` as a build variable if the
> build OOMs on a smaller VPS.

## 5. Deploy

Click **Deploy**. Coolify clones the repo, builds the Dockerfile (deps → build →
runner), and starts the container on port 3000 behind its Traefik proxy with SSL.
Watch the **build logs**; first build takes several minutes.

To auto-deploy on push: enable the **webhook / "Automatic Deployment"** toggle so
each push to the branch redeploys.

## 6. Database migrations (run once, separately)

Coolify doesn't run your Supabase migrations. Apply them to your Supabase project
in order — `001 … 072` (or at minimum the new ones if the base is already live):

- Supabase Dashboard → SQL Editor → paste each `supabase/migrations/0XX_*.sql` in
  order, **including 068 → 072**; or
- `supabase db push` from your machine if you use the Supabase CLI linked to the
  project.

All migrations are idempotent (`IF NOT EXISTS`), so re-running is safe.

## 7. Post-deploy checks

- Visit `https://app.yourdomain.com` — landing page loads over HTTPS.
- Sign up / log in (Supabase auth) — confirm the Supabase URL/keys are correct.
- Create a project and run a build — confirms `OPENROUTER_API_KEY` + credits work
  (your OpenRouter balance must be funded).
- Editor route loads (it sets COOP/COEP headers for WebContainers — already in
  `next.config.mjs`).

## 8. Gotchas specific to this app

- **Build memory:** the build is large; use ≥4 GB RAM or set the heap env above.
- **`NEXT_PUBLIC_*` are build-time:** if Supabase auth/URL looks wrong in the
  browser, you set them as runtime-only — re-add as **Build Variables** and redeploy.
- **AI Gateway (optional):** if you run the Cloudflare Worker gateway, set
  `LIFEMARK_GATEWAY_URL` + `LIFEMARK_GATEWAY_SECRET`; otherwise leave unset and the
  app calls providers directly via `OPENROUTER_API_KEY`.
- **Sandbox/E2B + domain-purchase** features stay off until their env is set
  (see `INTEGRATION_CHANGES.md`).
- **Persistent storage:** the app is stateless (state lives in Supabase), so no
  volumes are required for the Next.js container.

## 9. Optional — smaller image via standalone output

For a leaner image later, add `output: "standalone"` to `next.config.mjs` and
switch the runner to copy `.next/standalone` + `.next/static` + `public` and run
`node server.js`. Validate locally first — verify Monaco and dynamic imports still
resolve. The shipped Dockerfile uses the robust full-deps path by default.
