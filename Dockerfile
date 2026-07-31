# syntax=docker/dockerfile:1
# Production image for LifemarkAI — TanStack Start (.output) + isolated workers.
# Built for Coolify. Node 22 (modal SDK requires >=22.12).
#
# Processes at runtime (supervised by scripts/start-production.mjs):
#   :3000 TanStack Start server (.output/server/index.mjs) — ALL routes, native
#   :3010 AI SSE worker        (chat/agent/fix — .tmp/ai-http bundles, own heap)
#
# The :3011 API worker and :3012 sandbox worker were retired in Phase 2: every
# route is now a native TanStack Start handler and sandbox-preview runs in-process.
# There is no Next.js in this image — the app was removed in commit c363c8f.

# ── deps + build ─────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS build
WORKDIR /app

ENV NODE_OPTIONS=--max-old-space-size=4096

# Root deps first: the AI worker's esbuild bundles use `packages: "external"`,
# so their runtime imports (openai, stripe, @supabase/*, resend…) resolve from
# the ROOT node_modules at runtime. Root package.json is a dependency manifest
# only — there is no root application code left.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Start app deps.
COPY migration/tanstack-start-app/package.json migration/tanstack-start-app/package-lock.json ./migration/tanstack-start-app/
RUN cd migration/tanstack-start-app && npm ci --no-audit --no-fund --legacy-peer-deps

# Copy the repo and build:
#  1. AI HTTP bundles (.tmp/ai-http) for the SSE worker
#  2. Vite production build (.output) — VITE_*/NEXT_PUBLIC_* are inlined here;
#     pass as --build-arg or Coolify Build Variables.
#
# build-api-manifest.mjs / verify-api-coverage.mjs were dropped from this chain:
# both became no-op tombstones when the API worker was retired (all routes native).
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_ANON_KEY
ARG VITE_APP_URL
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_ENABLE_SANDBOX_PREVIEW
ARG NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
ARG NEXT_PUBLIC_APP_DOMAIN
# Sentry. VITE_ vars are INLINED BY VITE AT BUILD TIME, so a DSN supplied only as a
# runtime env var would cover the server and silently leave the browser reporting
# nothing. It has to be a build ARG to reach the client bundle. Safe to bake in: a
# DSN is public by design - it is an ingest endpoint, not a credential, which is why
# it ships inside every client-side Sentry bundle on the web.
# SENTRY_RELEASE is optional and lets Sentry group errors by deploy.
ARG VITE_SENTRY_DSN
ARG SENTRY_RELEASE

ENV VITE_SENTRY_DSN=$VITE_SENTRY_DSN \
    SENTRY_RELEASE=$SENTRY_RELEASE \
    VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_ANON_KEY=$VITE_SUPABASE_ANON_KEY \
    VITE_APP_URL=$VITE_APP_URL \
    NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL \
    NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY \
    NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL \
    NEXT_PUBLIC_ENABLE_SANDBOX_PREVIEW=$NEXT_PUBLIC_ENABLE_SANDBOX_PREVIEW \
    NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY \
    NEXT_PUBLIC_APP_DOMAIN=$NEXT_PUBLIC_APP_DOMAIN

COPY . .
# The output directory changed between TanStack Start versions: vinxi-era builds
# wrote `.output/`, the current `tanstackStart()` plugin writes `dist/`. The COPY
# lines below (and scripts/start-production.mjs) expect `.output`, so normalise
# here rather than in four other places. Without this the build SUCCEEDS and then
# the image fails at `COPY ... .output` with "not found", which reads like a
# build failure but is really a path mismatch.
RUN cd migration/tanstack-start-app \
  && node scripts/build-ai-http.mjs \
  && npx vite build \
  && if [ ! -d .output ] && [ -d dist ]; then mv dist .output; fi \
  && test -d .output/server || (echo "BUILD ERROR: no server output in .output/ or dist/" && ls -la && exit 1)

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000

USER node

# Root node_modules — externals for the esbuild route/AI bundles.
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/package.json ./package.json

# Start app: server output, worker bundles, worker scripts, deps.
COPY --chown=node:node --from=build /app/migration/tanstack-start-app/.output ./migration/tanstack-start-app/.output
COPY --chown=node:node --from=build /app/migration/tanstack-start-app/.tmp ./migration/tanstack-start-app/.tmp
COPY --chown=node:node --from=build /app/migration/tanstack-start-app/scripts ./migration/tanstack-start-app/scripts
COPY --chown=node:node --from=build /app/migration/tanstack-start-app/node_modules ./migration/tanstack-start-app/node_modules
COPY --chown=node:node --from=build /app/migration/tanstack-start-app/package.json ./migration/tanstack-start-app/package.json

EXPOSE 3000

CMD ["node", "migration/tanstack-start-app/scripts/start-production.mjs"]
