# syntax=docker/dockerfile:1
# Production image for LifemarkAI (Next.js App Router) — built for Coolify.
# Robust full-deps approach (not `output: standalone`) so Monaco + dynamic
# imports resolve at runtime without tracing surprises.

# ── deps + build ─────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS build
WORKDIR /app

# Bigger heap for the large build (876 files). Override BUILD_HEAP if needed.
ENV NODE_OPTIONS=--max-old-space-size=4096
ENV NEXT_TELEMETRY_DISABLED=1

# Install dependencies first (better layer caching).
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Copy the rest and build.
COPY . .

# NEXT_PUBLIC_* vars are inlined at build time — Coolify injects build args/env.
# (Set them as Build Variables in Coolify, see docs/DEPLOY_COOLIFY.md.)
RUN npm run build

# ── runtime ──────────────────────────────────────────────────────────────────
FROM node:20-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as the built-in non-root user.
USER node

# Copy the built app + deps from the build stage.
COPY --chown=node:node --from=build /app/node_modules ./node_modules
COPY --chown=node:node --from=build /app/.next ./.next
COPY --chown=node:node --from=build /app/public ./public
COPY --chown=node:node --from=build /app/package.json ./package.json
COPY --chown=node:node --from=build /app/next.config.mjs ./next.config.mjs

EXPOSE 3000

# next start binds to $HOSTNAME:$PORT
CMD ["npm", "run", "start", "--", "-p", "3000", "-H", "0.0.0.0"]
