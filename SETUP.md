# LifeMarkAI setup

## Requirements

- Node.js 22
- npm
- A Supabase project
- At least one configured AI provider

## Local installation

```bash
npm ci --legacy-peer-deps
cp .env.local.example .env.local
npm run dev
```

The development server runs at `http://localhost:3001`.

## Supabase

1. Create a Supabase project.
2. Apply every numbered file in `supabase/migrations/` in order.
3. Configure the required authentication providers.
4. Add the application callback URL ending in `/auth/callback`.
5. Set the Supabase URL, anonymous key, and server-side service key in
   `.env.local`.

Both `VITE_*` and legacy `NEXT_PUBLIC_*` public variable names are accepted
during the transition. New deployments should prefer `VITE_*` names.

## Quality checks

```bash
npm run type-check
npm test
npm run lint
npm run build
```

The root `Dockerfile` builds the TanStack application and supervises its AI
worker. Follow `docs/DEPLOY_COOLIFY.md` for production deployment.
