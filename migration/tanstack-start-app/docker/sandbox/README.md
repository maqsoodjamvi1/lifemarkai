# Preview sandbox image

An optional runtime image for the Docker preview provider. It exists for one
reason: to take `npm install` off the critical path of a cold preview boot.

Every generated app starts from the same Lovable-shaped scaffold, which
resolves to roughly 340 packages — **301MB across 28,199 files**, measured. In a
bare `node:22-alpine` container with an empty cache, installing those takes
40-90 seconds, and the user spends all of it looking at a spinner. This image
installs them once at build time and keeps npm's cache, so a boot only has to
reconcile whatever the individual app added.

## It also decides your disk bill

Image layers are shared read-only across every container on the host; a
container's own storage holds only what it *changes*. Because the dependencies
are installed at `/home/node/app` — the exact directory the sandbox runs from —
every preview reads one shared 301MB copy, and each container costs only its
source files plus whatever that project added on top.

That is what makes it affordable to keep idle sandboxes around instead of
deleting them, which is in turn what removes the reinstall when someone reopens
a project. Without this image each container installs its own private copy, so
idle sandboxes cost ~300MB each and the host GC has to fall back to its
`MAX_STOPPED` cap to keep the disk bounded.

It is worth being precise about why the dependencies are not staged elsewhere
and copied in at boot: on overlayfs, hardlinking or copying a file out of a
lower layer forces a copy-up into the container's writable layer. A staged copy
would therefore cost the full 301MB per sandbox — the exact thing this image
exists to avoid. Earlier revisions did that; it was worse than doing nothing.

Nothing here is required. On any other image boots still work, at the old speed
and the old per-container disk cost.

## Build and publish

Regenerate the dependency list first; it is derived from the same source files
the app generator uses, so this is what keeps the image from drifting:

```bash
node scripts/gen-sandbox-base-package.mjs
docker build -t <registry>/lifemark-sandbox:node22 -f docker/sandbox/Dockerfile docker/sandbox
docker push <registry>/lifemark-sandbox:node22
```

Then point the app at it and redeploy:

```
SANDBOX_IMAGE=<registry>/lifemark-sandbox:node22
```

If the sandbox host is the same machine that builds the image, skip the registry
entirely — a locally built tag is enough, since the daemon that runs previews is
the daemon that has it.

## Keeping it current

Rebuild when the scaffold's dependency versions change
(`src/lib/preview/base-app-deps.ts`, `src/lib/templates/lovable-vite-scaffold.ts`).
A stale image is not a correctness problem: npm reconciles whatever differs at
boot. It just quietly gives back some of the speed, which is worth a calendar
reminder rather than a debugging session six months from now.

## What the provider does with it

Nothing. That is the point — the modules are already at the path the sandbox
runs from, so the provider only runs:

```sh
npm install --no-audit --no-fund --prefer-offline …   # reconciles the difference
```

npm leaves matching packages untouched, so they stay in the shared image layer
and never enter the container's writable layer. Only genuine differences —
a version the project pinned, a package it added — get written, and those land
in that container's own layer where they cannot affect the image or any other
sandbox.
