# LifeMarkAI — AI App Builder

LifeMarkAI is an independent full-stack AI application-building platform built
with TanStack Start, React, TypeScript, Supabase, Monaco Editor, and multi-model
AI. The platform host, API routes, and production build live at the repository
root.

## Quick start

```bash
npm ci --legacy-peer-deps
cp .env.local.example .env.local
npm run dev
```

Open `http://localhost:3001`.

## Verification

```bash
npm run type-check
npm test
npm run lint
npm run build
```

## Repository structure

```text
src/                TanStack routes, components, hooks, libraries, and types
supabase/           PostgreSQL migrations and backend functions
scripts/            build, verification, and runtime worker tooling
docker/             isolated generated-app sandbox image
gateway/            optional Cloudflare AI gateway
electron/           desktop packaging
public/             static assets and embedded-app scripts
```

TanStack Start serves SSR pages and native API routes. A supervised AI worker
isolates chat, agent, and fix SSE workloads. Supabase provides PostgreSQL,
authentication, storage, realtime, and RLS.

Apply the numbered SQL files in `supabase/migrations/` in order. See
`.env.local.example` for configuration and `docs/DEPLOY_COOLIFY.md` for
production deployment.
