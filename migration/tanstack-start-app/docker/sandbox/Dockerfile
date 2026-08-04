# Preview sandbox runtime with the generated-app dependency set pre-installed.
#
# This image solves two problems at once, and the second one is the reason the
# dependencies are installed at the FINAL path rather than staged somewhere.
#
# SPEED. A cold boot is dominated by `npm install`: the Lovable-shaped scaffold
# every generated app starts from resolves to ~340 packages — measured at 301MB
# across 28,199 files — and in a fresh container with an empty cache that is
# 40-90 seconds of the user watching a spinner. Installing it once here turns
# each boot's install into a delta reconcile.
#
# DISK. Image layers are shared, read-only, across every container on the host;
# a container's own storage holds only what it CHANGES. So installing into
# /home/node/app — the exact directory the sandbox runs from — means every
# preview shares one 301MB copy, and each container costs only its source files
# plus whatever dependencies that project added beyond the base. That is what
# makes it affordable to keep idle sandboxes around instead of deleting them
# (see the host GC), which is in turn what removes the reinstall on reopen.
#
# Staging the modules elsewhere and copying them in at boot would undo exactly
# that: on overlayfs, hardlinking or copying a file out of a lower layer forces
# a copy-up into the container's writable layer, so every sandbox would pay the
# full 301MB again — the arrangement this image exists to avoid.
#
# Nothing here is required. On any other image boots still work, just at the old
# speed and the old per-container disk cost.
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
# back some of the speed, and grows each container's delta.

FROM node:22-alpine

# curl for the readiness probe's fallback branch; busybox already provides the
# wget and nc the probe prefers.
RUN apk add --no-cache curl

# The sandbox's working directory, created here so it is owned by `node` before
# anything runs as that user. The provider deliberately does not set WorkingDir
# on the container (Docker would recreate it root-owned, and CAP_CHOWN is
# dropped so nothing could fix that) — it already exists in this image instead.
RUN mkdir -p /home/node/app && chown -R node:node /home/node/app
WORKDIR /home/node/app
COPY --chown=node:node package.json ./

# Install AS `node`, with lifecycle scripts left ON.
#
# Both details matter. Running as node means the tree is owned by the user the
# sandbox runs as, so a project's own `npm install` can reconcile it in place
# rather than being denied and rebuilding from scratch. And --ignore-scripts
# would be a trap: esbuild's postinstall is what puts its platform binary in
# place, so skipping it produces an image whose vite cannot start — a failure
# that only shows up at preview time.
USER node
RUN npm install --no-audit --no-fund --loglevel=error

# The npm cache is deliberately NOT cleaned.
#
# Cleaning it is the reflex for slimming an image, and it would defeat the
# purpose of this one. Generated apps ship no lockfile, so every boot's install
# re-resolves the tree against the registry; `--prefer-offline` turns that into
# local reads, but only if the metadata and tarballs are still here. npm's cache
# for the node user lands in /home/node/.npm, exactly where the provider points
# npm_config_cache — so what this build downloaded is what every sandbox reads,
# from one shared layer.

WORKDIR /home/node
