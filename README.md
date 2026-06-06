# LifemarkAI — AI App Builder

A full-featured Lovable.dev clone built with Next.js 14, Supabase, Monaco Editor, and multi-model AI.

## Quick Start

```bash
# Install dependencies
npm install

# Run development server
npm run dev
```

Then open [http://localhost:3000](http://localhost:3000).

## Setup Required

### 1. Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run `supabase/migrations/001_initial.sql` in the Supabase SQL Editor
3. Enable Google and GitHub OAuth providers in Auth → Providers
4. Set your redirect URL: `http://localhost:3000/auth/callback`

### 2. Environment Variables

All variables are already in `.env.local`. Fill in the blanks:

```env
# Supabase (already filled)
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# AI (already filled)
OPENAI_API_KEY=...
ANTHROPIC_API_KEY=...   # Add your key

# Stripe — create products at dashboard.stripe.com
STRIPE_PRO_MONTHLY_PRICE_ID=price_...
STRIPE_TEAM_MONTHLY_PRICE_ID=price_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Netlify deploy (optional)
NETLIFY_AUTH_TOKEN=...
```

### 3. Stripe Webhook (local dev)

```bash
stripe listen --forward-to localhost:3000/api/stripe/webhook
```

## Architecture

```
app/
├── (auth)/          # Login, signup, forgot/reset password
├── (dashboard)/     # Protected: dashboard, settings, billing, analytics
├── (marketing)/     # Public: landing, explore, project pages
├── editor/          # AI editor (Monaco + chat + preview)
└── api/             # All API routes

components/
├── ui/              # shadcn/ui primitives
├── dashboard/       # Dashboard-specific components
└── editor/          # Editor panels (chat, code, preview, file tree)

lib/
├── supabase/        # Client + server Supabase clients
└── utils.ts         # Shared utilities
```

## Features

- **AI Code Generation** — GPT-4o, GPT-4o Mini, Claude 3.5 Sonnet, Claude Haiku
- **Monaco Editor** — Multi-tab, syntax highlighting, IntelliSense
- **Live Preview** — Instant Babel + Tailwind CDN preview in iframe
- **File Tree** — Full file manager with rename/delete
- **Project Management** — Create, duplicate, star, search, filter
- **GitHub Import** — Import any public repo as a project
- **Deploy** — One-click Netlify/Vercel deployment
- **Snapshots** — Auto-snapshot before every AI generation
- **Onboarding** — 3-step modal for new users
- **Analytics** — Credit usage, views, deployments
- **Billing** — Stripe subscriptions (Free/Pro/Team)
- **Auth** — Email/password + Google OAuth + GitHub OAuth
- **Yjs CRDT** — Real-time collaborative editing over Supabase Realtime

## Database Schema

Run `supabase/migrations/001_initial.sql` to create:
- `profiles` — extends auth.users, stores plan/credits
- `projects` — user projects with framework, visibility
- `project_files` — individual files per project
- `snapshots` — version history (diffs)
- `deployments` — deploy history with status
- `notifications` — in-app notification feed
- `api_keys` — developer API key management
- `project_views` — analytics view tracking
