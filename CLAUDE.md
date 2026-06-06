# LifemarkAI — Codebase Guide

A full-stack AI-powered app builder (Lovable.dev clone) built with Next.js 14, Supabase, and multi-model AI.

## Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 14 App Router (TypeScript) |
| Database | Supabase (PostgreSQL + RLS + Realtime) |
| Auth | Supabase Auth (Email + GitHub OAuth) |
| AI | OpenAI GPT-4o + Anthropic Claude (streaming SSE) |
| Styling | Tailwind CSS + shadcn/ui (Radix primitives) |
| Editor | Monaco Editor (dynamic import, SSR-safe) |
| Payments | Stripe (subscriptions + webhooks) |
| Email | Resend |
| State | Zustand + TanStack Query |
| Animations | Framer Motion |

## Key Architecture Decisions

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
