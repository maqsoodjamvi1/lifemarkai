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

# The TanStack Start host and its AI worker now share one root dependency graph.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund --legacy-peer-deps

# Chromium for src/lib/ai/self-verify.ts's real-browser render pass (see
# PLAYWRIGHT_ENABLED below) — without it self-verify silently falls back to
# much weaker static HTML checks and never catches a runtime crash before the
# user sees it. Installed here, as root, so both the browser binary and its
# apt-level shared libraries land in one place; the runner stage only needs
# to re-install the libraries (a COPY can't carry OS packages across stages)
# against the binary copied over from here.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Split deliberately into apt-deps and browser-download, and BOUND the download.
#
# `playwright install --with-deps chromium` did both in one layer: the apt part
# logs every package, then the ~150MB Chromium fetch from Playwright's CDN runs
# with NO output until it completes. When that fetch stalls the build hangs
# forever, silently, with the last log line being an unrelated `npm notice` —
# observed twice on the same commit (33min and 15min of dead air before manual
# cancellation), which reads like a wedged builder rather than a slow download.
# `timeout` turns an indefinite stall into a bounded failure, the retry rides
# out a transient CDN blip on its own, and the final `exit 1` makes a genuine
# outage fail fast and legibly instead of burning a deploy slot. Splitting the
# layers also means a CDN retry no longer re-runs the (slow, working) apt step.
RUN npx playwright install-deps chromium
RUN for attempt in 1 2 3; do \
      echo "playwright: downloading chromium (attempt $attempt/3)"; \
      if timeout 600 npx playwright install chromium; then exit 0; fi; \
      echo "playwright: attempt $attempt failed or timed out after 600s; retrying" >&2; \
      sleep 15; \
    done; \
    echo "ERROR: playwright chromium download failed after 3 bounded attempts" >&2; \
    exit 1

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
RUN node scripts/build-ai-http.mjs \
  && npx vite build \
  && if [ ! -d .output ] && [ -d dist ]; then mv dist .output; fi \
  && test -d .output/server || (echo "BUILD ERROR: no server output in .output/ or dist/" && ls -la && exit 1)

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
# Same browsers path as the build stage, so the binary COPYed below is found
# at runtime by src/lib/ai/self-verify.ts (via PLAYWRIGHT_ENABLED).
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright

# Runtime dependencies, application manifest, and the Chromium binary fetched
# in the build stage. Left owned by root for now — installing Chromium's
# shared-library dependencies below needs apt, which needs root — and
# chowned to node right before switching USER.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /ms-playwright /ms-playwright

# The browser binary crossed stages via COPY above; its OS-level shared
# libraries (libnss3, libatk, libgbm, …) are apt packages and cannot cross a
# COPY, so re-resolve and install just those against the copied browser.
RUN npx playwright install-deps chromium \
  && rm -rf /var/lib/apt/lists/* \
  && chown -R node:node /ms-playwright ./node_modules ./package.json

USER node

# Start server output and isolated AI worker bundle.
COPY --chown=node:node --from=build /app/.output ./.output
COPY --chown=node:node --from=build /app/.tmp ./.tmp
COPY --chown=node:node --from=build /app/scripts ./scripts

EXPOSE 3000

CMD ["node", "scripts/start-production.mjs"]
