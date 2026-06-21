# LifemarkAI — Codebase Guide

A full-stack AI-powered app builder (Lovable.dev clone) built with Next.js 14, Supabase, and multi-model AI.

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 App Router (TypeScript) |
| Database | Supabase (PostgreSQL + RLS + Realtime) |
| Auth | Supabase Auth (Email + GitHub OAuth) |
| AI | Multi-provider per-task tiers (streaming SSE): Codex Opus 4.8 (coding), GPT-5.2 (planning), Gemini 3 Flash (chat) — `MODEL_TIERS` in `lib/ai/editor-intelligence.ts`; Nano Banana 2 → DALL-E 3 for images |
| Styling | Tailwind CSS + shadcn/ui (Radix primitives) |
| Editor | Monaco Editor (dynamic import, SSR-safe) |
| Payments | Stripe (subscriptions + webhooks) |
| Email | Resend |
| State | Zustand + TanStack Query |
| Animations | Framer Motion |

## Key Architecture Decisions

### Credit system (fractional, Lovable-style — migration 063)
- Credits are NUMERIC(12,2). `computeCreditCost()` in `lib/ai/credit-cost.ts` returns 0.5–5 in 0.05 steps.
- **Daily free credits:** 5/day per user, capped 30/mo (free) / 150/mo (paid). Granted lazily by `grant_daily_credits` RPC — called inside `deduct_credits` AND via `claimDailyCredits()` (`lib/credits.ts`) before balance gates in AI routes. Add the claim call to any NEW route that gates on credits.
- **Rollover:** on `invoice.paid` (billing_reason `subscription_cycle`) the webhook calls `apply_plan_renewal` RPC: `new = LEAST(current, plan) + plan`.
- **Webhook rule:** `customer.subscription.updated` must NEVER reset the balance unless the plan actually changed (upgrade adds the difference; downgrade keeps balance).

### Lifemark Cloud (managed backend — migrations 048/061/064/065)
- `lib/cloud/management.ts` wraps the Supabase Management API. With `SUPABASE_MANAGEMENT_TOKEN` + `SUPABASE_ORG_ID` set, `/api/cloud/provision` creates a REAL dedicated Supabase project per app (ref/keys stored on `projects.cloud_*` columns, migration 064); `/api/cloud/status` polls until healthy. Without those env vars, Cloud runs in "local mode" (flags only).
- Instance tiers map to real compute add-ons via `setManagedComputeTier` (tiny = default nano).
- **Billing:** `/api/cloud/bill-usage` (daily cron, vercel.json) records instance cost into `lifemark_cloud_usage` and calls `bill_cloud_usage` RPC — $25/mo free allowance first, then debits `profiles.cloud_balance_cents`; pauses paid-tier projects when the wallet is empty, resumes after top-up.
- Daily backups: `/api/cloud/daily-backups` cron; restore via Cloud panel → `/api/projects/snapshots/restore` (dry-run for schema warnings first).

### Backend auto-wiring (Lovable Cloud parity)
- `lib/cloud/auto-wire.ts` — runs after build/agent file saves (chat + agent routes). When the prompt/output needs a backend (auth/database/storage regex + generated `supabase/migrations/*.sql`): auto-enables Cloud, injects `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` into the app's `.env.local`, scaffolds `src/lib/supabase.ts` + adds `@supabase/supabase-js` to package.json, and applies generated migrations via `runManagedSql` (Management API) when the Database permission is "allow".
- `/api/cloud/status` finishes wiring when a managed backend becomes healthy: pushes creds into `.env.local` and calls `configureManagedAuthRedirects` (site URL + localhost dev URLs).
- The chat system prompt gets a "Connected Backend" block when `cloud_enabled` — AI must use the shared client and write schema changes as migration files.
- Gated by `cloud_tool_permissions.database` ("never" skips entirely; "ask" generates migrations without applying).

### Self-verification loop (Lovable "agent verifies its own output")
- `lib/ai/self-verify.ts` — after build/agent runs: builds the fallback preview HTML server-side, renders it in headless Chromium (`PLAYWRIGHT_ENABLED=true` + playwright installed; static smoke checks otherwise), collects pageerrors/console errors/empty-root, then generates+applies fixes (AUTO_FIX prompt) and re-verifies — max 2 fix rounds, 55s budget. Streams `verify_status`/`wiring_status` events; results land in the final SSE payload (`verification`, `backend_wired`). Never fails a build.
- Chat + agent routes now have `maxDuration = 300`.

### Connector gateway (Lovable-parity)
- `/api/projects/[id]/connector-proxy` + `lib/integrations/connector-registry.ts` (15 connectors). Credentials live in the project's `.env.local` (project_files); the proxy injects auth server-side and only forwards to the connector's own API host. The chat route appends a system-prompt block teaching the AI to route generated-app API calls through it.

### In-app payments (paywall for built apps — migration 025)
- `/api/embed/checkout` lazily creates Stripe product/price from `app_monetization` and opens hosted Checkout; `/api/embed/status` + `public/embed/paywall.js` power the paywall overlay in deployed apps. The Stripe webhook routes subscriptions with `metadata.kind === "app_subscription"` into `app_subscriptions` (NOT profiles).

### Visual edits (two preview engines)
- srcdoc fallback engine: `VisualEditOverlay` (same-origin contentDocument).
- WebContainer engine (cross-origin): dormant postMessage bridge injected into `index.html` by `patchFilesForWebContainer` (`lib/preview/veb-bridge.ts`); parent renders `VebBridgePopover`. Edits persist via the multi-file matcher `lib/editor/apply-visual-edit.ts`, falling back to a precise AI prompt when no unique code match exists.

### Test/Live environments (migration 046)
- `projects.environment` = 'test' | 'live'. Chat (non-chat/plan modes) and Agent routes return **423** with `environment_locked: true` when Live. Enforce this in any new code-writing route.

### Supabase clients — always use the right one
- `createClient()` from `@/lib/supabase/server` — Server Components, Route Handlers, Server Actions
- `createClient()` from `@/lib/supabase/client` — Client Components only
- `createAdminClient()` — Stripe webhooks and server-side admin ops only

### AI provider abstraction
All AI calls go through `lib/ai/generate.ts → generateAI()`. The function accepts a `model` param and auto-routes based on the model prefix. Import via either:
- `@/lib/ai/generate` (primary — gateway-aware)
- `@/lib/ai/provider` (direct — bypasses gateway, use only in admin contexts)

When `LIFEMARK_GATEWAY_URL` + `LIFEMARK_GATEWAY_SECRET` are set, `generateAI()` proxies through the Cloudflare Worker (see **AI Gateway** section). Without those env vars it calls providers directly — safe for local dev and self-hosted.

Pass `ctx: { projectId, userId }` as the second argument to `generateAI()` so the gateway can attribute usage to the correct project's `lifemark_cloud_usage` row.

### AI Gateway (Cloudflare Worker)
Deployed at `https://ai.gateway.lifemarkai.app` — source in `/gateway`.

Responsibilities:
- Auth: verifies `Authorization: Bearer <GATEWAY_SECRET>` on every request
- Routing: forwards to OpenAI / Anthropic / Google / OpenRouter based on model prefix
- Usage logging: writes `ai_cents` to `lifemark_cloud_usage` and calls `debit_ai_balance()` RPC via `ctx.waitUntil` (fire-and-forget, never blocks the response)
- Secret injection: `POST /inject-secret` pushes `LIFEMARK_API_KEY` into a Cloud project's Supabase edge-function secrets at provision time

**Local dev:** leave `LIFEMARK_GATEWAY_URL` unset — calls go direct.
**Deploying:**
```bash
cd gateway
npm install
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put SUPABASE_URL
wrangler secret put SUPABASE_SERVICE_ROLE_KEY
wrangler secret put GATEWAY_SECRET
npm run deploy
```

**Cost model:** `TOKEN_COST_MAP` in `gateway/src/index.ts` — update as pricing changes. The Worker bills `ai_cents = ceil((prompt_tokens × input_rate + completion_tokens × output_rate) / 1M × 100)`.

**Migration 053** (`053_debit_ai_balance_fn.sql`) adds the `debit_ai_balance(user_id, cents)` SECURITY DEFINER function used by the Worker.

### Toast — dual export pattern
`hooks/use-toast.ts` exports both:
- `toast(props)` — standalone, import directly in server-safe contexts
- `useToast()` — hook for components that need the queue

### Rate limiting
In-memory rate limiter in `lib/rate-limit.ts`. Uses `RATE_LIMITS.ai` preset for AI endpoints.

## Directory Structure

```
app/
  (auth)/           # Login + signup pages
  (dashboard)/      # Dashboard layout + all dashboard pages
  (marketing)/      # Public landing, pricing, templates
  api/
    ai/             # chat, agent, plan, image, transcribe
    billing/        # Stripe checkout, portal, webhook
    deploy/         # Deployment trigger + status
    github/         # OAuth connect, sync, commits
    notifications/  # Email notification triggers
    projects/       # CRUD + files + export + invite

components/
  dashboard/        # All dashboard page components
  editor/           # Monaco editor layout + all panels
  marketing/        # Landing page sections
  onboarding/       # New-user onboarding modal
  ui/               # shadcn/ui primitives

gateway/              # Cloudflare Worker — AI gateway proxy + usage logging

lib/
  ai/               # provider.ts, generate.ts (gateway-aware), agent.ts, gateway-client.ts
  email/            # resend.ts — all email templates
  github/           # Octokit client
  stripe/           # Stripe client + plan definitions
  supabase/         # server.ts + client.ts

store/
  app-store.ts      # Zustand store (persisted)

types/
  database.ts       # Full DB type definitions + convenience aliases
```

## Database Tables

| Table | Purpose |
|-------|---------|
| `profiles` | Extends auth.users — plan, credits, GitHub token |
| `projects` | User projects with framework, status, deploy URL |
| `project_files` | Files within each project (path, content, language) |
| `messages` | AI chat history per project |
| `collaborators` | Project sharing with roles (owner/editor/viewer) |
| `deployments` | Deployment records with status + URL |
| `templates` | Public template marketplace |
| `credit_logs` | Audit trail of credit debits |

## Editor Panels (Left Side)

| Tab | Component | Purpose |
|-----|-----------|---------|
| 💬 Chat | `chat-panel.tsx` | AI chat with streaming + diff view |
| 🗺️ Plan | `plan-panel.tsx` | Structured plan before building |
| 🤖 Agent | `agent-panel.tsx` | ReAct autonomous agent loop |
| 🐙 Git | `github-panel.tsx` | GitHub sync + commits |
| 👥 Live | `collaboration-panel.tsx` | Realtime presence |
| 🎨 Image | `image-gen-panel.tsx` | DALL-E 3 generation |
| 🗄 DB | `supabase-wizard.tsx` | Supabase integration |
| 🔑 Env | `env-panel.tsx` | Environment variables |

## AI Modes

| Mode | Credits | Description |
|------|---------|-------------|
| Chat | 1 | Conversational edits |
| Plan | 1 | Architecture planning |
| Build | 2 | Full file generation |
| Agent | 2 | Autonomous ReAct loop |

## Common Commands

```bash
npm run dev          # Start development server
npm run build        # Production build
npm run type-check   # TypeScript check (tsc --noEmit)
npm run lint         # ESLint
```

## Environment Variables

See `.env.local.example` for all required vars. Minimum to run locally:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `OPENAI_API_KEY`
- `NEXT_PUBLIC_APP_URL=http://localhost:3000`

## Migrations

Run in order via Supabase dashboard SQL editor or `supabase db push`:
1. `supabase/migrations/001_initial_schema.sql`
2. `supabase/migrations/002_add_metadata_and_enhancements.sql`

## Imported Claude Cowork project instructions
