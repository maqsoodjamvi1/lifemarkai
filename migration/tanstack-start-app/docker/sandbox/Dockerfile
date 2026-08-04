# Preview sandbox runtime with the generated-app dependency set pre-installed.
#
# A cold preview boot is dominated by `npm install`: the Lovable-shaped scaffold
# every generated app starts from resolves to ~340 packages, and in a fresh
# container with an empty cache that is 40-90 seconds of the user watching a
# spinner. Those packages are nearly identical across apps, so installing them
# once here turns each boot's install into a delta reconcile — a few seconds.
#
# The provider feature-detects /opt/lm-base/node_modules (see BASE_MODULES in
# src/lib/sandbox/docker.ts). Nothing here is required: on an image without it
# boots still work, just at the old speed.
#
# ── Build and publish ────────────────────────────────────────────────────────
#   node scripts/gen-sandbox-base-package.mjs      # refresh package.json first
#   docker build -t <registry>/lifemark-sandbox:node22 -f docker/sandbox/Dockerfile docker/sandbox
#   docker push <registry>/lifemark-sandbox:node22
#
# Then point the app at it and redeploy:
#   SANDBOX_IMAGE=<registry>/lifemark-sandbox:node22
#
# Rebuild whenever the scaffold's dependency versions change. A stale image is
# not a correctness problem — npm reconciles whatever differs — it just gives
# back some of the speed.

FROM node:22-alpine

# curl for the readiness probe's fallback branch; busybox already provides the
# wget and nc the probe prefers.
RUN apk add --no-cache curl

RUN mkdir -p /opt/lm-base && chown node:node /opt/lm-base
WORKDIR /opt/lm-base
COPY --chown=node:node package.json ./

# Install AS `node`, with lifecycle scripts left ON.
#
# Both details matter. Running as node means the tree is already owned by the
# user the sandbox runs as, so the provider's `cp -al` can hardlink it —
# protected_hardlinks blocks linking to files you neither own nor can write.
# And --ignore-scripts would be a trap here: esbuild's postinstall is what puts
# its platform binary in place, so skipping it produces an image whose vite
# cannot start, in a way that only shows up at preview time.
USER node
RUN npm install --no-audit --no-fund --loglevel=error

# The npm cache is deliberately NOT cleaned.
#
# Cleaning it is the reflex for slimming an image, and it would defeat the
# purpose of this one. Generated apps ship no lockfile, so every boot's install
# re-resolves the tree against the registry; `--prefer-offline` turns that into
# local reads, but only if the metadata and tarballs are still here. npm's cache
# for the node user lands in /home/node/.npm, which is exactly where the
# provider points npm_config_cache — so what this build downloaded is what every
# sandbox reads. Trading a few hundred MB of image (pulled once per host) for
# tens of seconds off every cold preview is the whole point.

WORKDIR /home/node
