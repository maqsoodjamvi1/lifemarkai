# Preview sandbox image

An optional runtime image for the Docker preview provider. It exists for one
reason: to take `npm install` off the critical path of a cold preview boot.

Every generated app starts from the same Lovable-shaped scaffold, which resolves
to roughly 340 packages. In a bare `node:22-alpine` container with an empty
cache, installing those takes 40-90 seconds, and the user spends all of it
looking at a spinner. This image installs them once at build time and keeps
npm's cache, so a boot only has to reconcile whatever the individual app added.

Nothing here is required. The provider feature-detects
`/opt/lm-base/node_modules` (`BASE_MODULES` in `src/lib/sandbox/docker.ts`) and
falls back to a plain install on any other image — same behaviour, old speed.

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

At boot, before installing:

```sh
cp -al /opt/lm-base/node_modules node_modules   # hardlinks: instant, ~no disk
npm install --prefer-offline …                  # reconciles the difference
```

Hardlinks rather than copies because npm replaces packages (unlink + write)
rather than editing them in place, so the shared inodes survive. Writes inside a
container land in its own layer, so one sandbox can never affect the image or
another sandbox.
