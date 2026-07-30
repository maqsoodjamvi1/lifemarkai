# Runbook: Actually Deleting Next.js

**Date:** 2026-07-26
**Precondition:** All three blockers are closed (see `NEXTJS-REMOVAL-AUDIT.md`). Static state: 205/205 API routes native, 0 worker proxies, 0 Next aliases, 0 main-repo escapes.
**Status of everything below:** *not yet executed.* Nothing in the migration has been runtime-tested.

---

## ⚠️ Two things that WILL break if you delete `app/` first

Found by inspecting the build pipeline — neither is obvious:

**1. `prebuild` crashes.** `package.json` has:
```json
"prebuild": "node scripts/build-api-manifest.mjs && node scripts/build-ai-http.mjs"
```
`build-api-manifest.mjs:87` walks `repoRoot/app/api`. Delete `app/` → `npm run build` dies before Vite starts.

**2. Three scripts still read `repoRoot/app`:**
- `scripts/build-api-manifest.mjs` (prebuild)
- `scripts/api-http-worker.mjs` (the worker itself)
- `scripts/verify-api-coverage.mjs` (parity checker)

All three are now **dead weight** — no route proxies to the worker anymore. They must be retired *before* `app/` is deleted, not after.

---

## Phase 0 — Runtime verification (DO NOT SKIP)

Everything so far is static analysis. `@ts-nocheck` headers on the transformed routes actively suppress type errors.

```bash
cd migration/tanstack-start-app
npm install
npm run dev          # http://localhost:3001
```

Test in this order — **highest risk first**:

| Priority | What | Why it's risky |
|---|---|---|
| 🔴 1 | `/preview/:projectId` and `/preview/:projectId/<asset>` | Splat hand-mapped: Next's `path: string[]` → `String(params._splat).split("/")` |
| 🔴 2 | `/preview-by-slug/:slug` | Same splat mapping + visibility logic |
| 🔴 3 | `/api/gateway/:connector/*` | Same splat mapping |
| 🔴 4 | `/api/ai/chat`, `/api/ai/agent` (SSE) | Streaming semantics differ between Next and Start |
| 🟠 5 | `/api/ai/brainstorm` (SSE) | ReadableStream + `data:` framing |
| 🟠 6 | `/editor/:projectId` | Internalized editor tree — first real mount |
| 🟠 7 | `/api/billing/webhook` | Raw body required for Stripe signature check |
| 🟡 8 | Any `POST` with `params` (e.g. `/api/projects/:id/*`) | `await params` → `params` rewrite |
| 🟡 9 | Dashboard pages, auth flows | Loader/`createServerFn` paths |

Then:
```bash
npm run type-check   # expect noise from @ts-nocheck files; triage real errors
npm run build        # must pass BEFORE you touch app/
```

**Do not proceed until `npm run build` is green.**

---

## Phase 1 — Cut the build's dependency on `app/`

Still inside `migration/tanstack-start-app`.

1. **Drop the dead prebuild step.** Edit `package.json`:
   ```json
   "prebuild": "node scripts/build-ai-http.mjs"
   ```
   (Keep `build-ai-http` only if the AI HTTP worker is still used; if `dev:ai-worker` is also dead, remove `prebuild` entirely.)

2. **Delete the retired worker scripts:**
   ```
   scripts/build-api-manifest.mjs
   scripts/api-http-worker.mjs
   scripts/verify-api-coverage.mjs
   ```
   and the matching `package.json` scripts: `build:api-manifest`, `dev:api-worker`, `verify:api-coverage`.

3. **Delete the now-unused client code:**
   ```
   src/lib/api-worker-client.ts
   src/lib/dispatch-or-native.ts
   src/lib/next-shims/            ← only the API worker used these
   src/lib/generated/api-route-coverage.json   (+ its import in src/lib/api-adapter.ts)
   ```
   Check `src/lib/worker-proxy.ts` and `src/lib/api-adapter.ts` — if nothing imports them after this, delete them too.

4. **Re-run `npm run build`.** Green = `app/` is no longer part of the build.

> Keep `src/lib/preview/next-app-preview.ts`. It emits `next/*` shims for **user-generated Next apps in the preview iframe** — product functionality, not framework coupling.

---

## Phase 2 — Decouple from the repo root

`vite.config.ts` still reaches out of the Start app in 4 places:

| Line | What | Action |
|---|---|---|
| 41 | `loadEnvFileIntoProcess(repoRoot/.env.local)` | The Start app has its **own** `.env.local` (5,165 B). Diff the two, merge anything missing, then drop this line. |
| 76 / 117 | `lifemark-dual-at-alias` — resolves `@/` to `repoRoot` for main-repo files | The `fromRepo` branch is now **dead** (0 escapes). Simplify the plugin to `@/ → src/` only. |
| 125 | `loadEnv(mode, repoRoot, "")` | Point at `rootDir`. |
| 169 | `server.fs.allow: [rootDir, repoRoot]` | Reduce to `[rootDir]`. |

Then `const repoRoot = …` (line 10) becomes unused — delete it.

**Re-run `npm run dev` + `npm run build`.** Green = the Start app is fully standalone.

---

## Phase 3 — Delete Next.js

> ### 🛑 I did the Phase 3 **audit** but did NOT execute the deletion. Here's why.
>
> **The gate this runbook defines — `npm run build` green — has never run.** Not once, by anyone.
> And in Phases 1 and 2 I introduced **two real regressions**, both caught only because I went
> looking, not because any test failed:
> - **Phase 1:** `server-fns/billing.ts` kept a transitive import of the retired worker client →
>   module-load failure → `GET /api/billing/credits` broken.
> - **Phase 2:** `worker-proxy.ts` defaults to `scripts/api-http-worker.mjs`, which I emptied in
>   Phase 1 — and the **sandbox** worker spawned that same script. All 5 Modal `sandbox-preview`
>   routes were broken.
>
> Two regressions in two phases of *reversible* edits is strong evidence more exist. Deleting the
> working production app on that basis is a bad trade — so I've done everything reversible and
> left you a one-command trigger.
>
> **Good news from the audit — the deletion itself is clean and recoverable:**
>
> | Check | Result |
> |---|---|
> | `app/` tracked in git | ✅ 258 files, HEAD `4360ab0` → `git rm` is **recoverable** |
> | Non-`app/` code importing `app/` | Only **2** files, and both are **type-only** imports (`activity-feed.tsx`, `global-search.tsx` → `import type` from `app/api/{activity,search}/route`) |
> | Those files in the Start app | ✅ Already fixed — the `src/` copies have no `app/` import |
> | electron / capacitor tied to Next output | ✅ None found |
> | Root scripts referencing next | Only `dev:next`, `build:next`, `start:next` |
>
> So the blast radius is small. The risk isn't *dependencies* — it's that **nothing has ever run.**

### Run this only after `npm run build` is green

```bash
# 0. safety net (app/ is tracked, so this is recoverable regardless)
git tag pre-nextjs-deletion
git commit -am "chore: phase 1+2 — start app standalone"   # if not already committed

# 1. delete the Next app
git rm -r app/
git rm next.config.mjs        # NOTE: .mjs — there is no middleware.ts in this repo
npm uninstall next

# 2. the 2 type-only imports die with app/ — those components belong to the old
#    Next app and are superseded by migration/tanstack-start-app/src/components/
```

Then promote the root scripts (currently dual):
- delete `dev:next`, `build:next`, `start:next`
- `dev:start` → `dev`, `build:start` → `build`, `start:start` → `start`
- re-point `lint`, `type-check`, `test`, `verify:*` at the Start app

Only now, at repo root:

```bash
git rm -r app/
git rm next.config.mjs           # note: .mjs, not .ts — there is no middleware.ts
npm uninstall next
```

Then clean `package.json` scripts. The root currently has **dual** scripts:
- Delete: `dev:next`, `build:next`, `start:next`
- Promote: `dev:start` → `dev`, `build:start` → `build`, `start:start` → `start`
- Re-point: `lint`, `type-check`, `test`, and the `verify:*` family (several assume the Next app)
- Check the `electron:*` and `cap:*` scripts — they may reference the Next build output

Also review at root: `components/`, `lib/`, `hooks/`, `types/` — the Start app no longer imports them (0 escapes). They're now either dead or shared-by-copy. **Don't bulk-delete**; the API worker is gone but other tooling may still read them.

---

## Phase 4 — Post-deletion verification

```bash
npm install                      # lockfile without next
npm run build
npm run start
```

Re-test the Phase 0 matrix. Then grep for stragglers:

```bash
grep -rn "next/" --include=*.ts --include=*.tsx src/ | grep -v next-app-preview
grep -rn "\"next\"" package.json
```

---

## Rollback

Do each phase as its **own commit** (or branch `chore/delete-nextjs`). Phase 3 is the only irreversible one — tag before it:

```bash
git tag pre-nextjs-deletion
```

---

## Honest risk summary

| Phase | Risk | Why |
|---|---|---|
| 0 | **High** | First time any of this executes. Expect real failures — that's the point. |
| 1 | Low | Deleting provably-unreferenced code. |
| 2 | Medium | Env merge is easy to get wrong; a missing var fails at runtime, not build. |
| 3 | Medium | Irreversible; root scripts are tangled across Next/Start/electron/capacitor. |
| 4 | Low | Verification only. |

**The single biggest unknown is Phase 0.** Every claim of "done" in the audit is static: import resolution, esbuild transform, route/method cross-check. None of it proves the code *runs*. Budget real debugging time there — particularly for SSE streaming and the three hand-mapped splat routes.
