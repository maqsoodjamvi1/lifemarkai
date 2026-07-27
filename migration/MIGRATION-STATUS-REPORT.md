# Next.js → TanStack Start: Status Report

**Measured fresh 2026-07-26** (not carried over from earlier audits — every number below was re-derived this session).

---

## Headline

**Surface migration is complete. Verification is not.**
The Start app owns its entire graph and no longer reads the Next repo. What remains is
almost entirely **running it** — plus one deliberate architectural exception.

| Dimension | Status |
|---|---|
| API routes | **206 native** vs 203 in Next (3 extras: `debug-log`, splat catch-alls) |
| Pages | **43** vs 39 in Next |
| Total route files | 250 |
| Routes delegating to a worker | **2** (`/api/ai/chat`, `/api/ai/agent`) |
| Real `next/*` / `server-only` imports in `src` | **0** |
| Imports escaping into the main repo | **0** |
| `next` in the Start app's dependencies | **absent** |
| Next compat aliases in `vite.config.ts` | **0** |
| `repoRoot` reads in config/scripts | **0** |

---

## What is genuinely DONE

- **Routing** — 100% parity, pages and API, verified by the *real* TanStack generator
  (`RUN COMPLETE`, 249 route imports = 248 routes + `__root`).
- **Business logic** — every route except `ai/chat` and `ai/agent` executes in-process.
  No route runs a Next handler.
- **Editor** — fully internalised at `src/components/editor` (238 files), zero `next/*`.
- **Libraries** — ~40 subsystems ported into `src/lib`, including the full `lib/ai` closure
  and `lib/ai/http/{chat,agent,fix}`.
- **Standalone** — env, module resolution, and file serving all read only this app.
  The AI-worker bundle builds from `src` (verified: agent 517K, chat 727K, fix 172K).

---

## What REMAINS

### 1. Runtime verification — the whole of it 🔴
**Not one HTTP request has ever been served by this app.** Everything above is static
analysis: import resolution, esbuild transforms, route-generator output, path audits.

`npm run dev` has never started. `npm run build` has never run. This is the only
item standing between here and deleting Next.

**Before you run it:** `.\cleanup-migration-stubs.ps1` — it removes a 0-byte route file
that **hard-crashes the route generator**, plus stale AI bundles. Non-optional.

### 2. `/api/ai/chat` + `/api/ai/agent` — deliberate 🟡
These two still proxy to a side-car AI worker (`proxyAiToWorker`). **This is by design**,
not incompleteness: the worker gives SSE streaming its own process and heap. It bundles
from `src/lib/ai/http/*` and has **no dependency on `app/`**, so it does not block deleting Next.

Convert them only if you want a single-process runtime.

### 3. Phase 3 — deletion, audited but not executed 🟡
Blast radius verified small:
- `app/` is git-tracked (258 files, HEAD `4360ab0`) → recoverable
- only 2 non-`app` files import it, both **type-only**, both already fixed in `src`
- no electron/capacitor tie to Next build output

Gated on item 1.

### 4. Housekeeping 🟢
- ~13 emptied stub files need real `rm` (the cleanup script does this)
- root `package.json` still has dual scripts (`dev:next` / `dev:start`)
- `tsc --noEmit` will under-report: the transformer emitted `@ts-nocheck` on ~200 files

---

## The thing worth internalising: 5 regressions, 0 from the import graph

Each was found by *looking*, never by a test. None would have been caught by dependency analysis.

| # | Coupling | Symptom | Found in |
|---|---|---|---|
| 1 | Transitive import | `billing.ts` → retired worker client → module-load failure → `GET /api/billing/credits` broken | Phase 1 |
| 2 | **Spawn-by-path** | sandbox worker spawned a script I'd emptied → 5 Modal preview routes broken | Phase 2 |
| 3 | **Directory scan** | route generator injects `Route` into every file in `src/routes`; a 0-byte file made it **throw** → no route tree → app won't start | Phase 3 audit |
| 4 | **Build cache + env flag** | `.tmp/ai-http` bundles pre-date Phase 2; `start-production.mjs` sets `SKIP_REBUILD=1` → **production ships stale AI bundles** (dev unaffected) | post-Phase 3 |
| 5 | **Copy-order** | `serve-preview.ts` imports `next/server`; it was copied into `src` *after* I deleted that alias → both preview routes fail to build | this report |

**Import analysis caught none of them.** The questions that did: *what spawns this? what
scans this directory? what does the tool do with degenerate input? what's cached, and who
skips rebuilding it? was this file copied in after the rule that governs it changed?*

Regression #5 was found while writing this report. **Assume a sixth exists.**

---

## Honest completion estimate

| Layer | % |
|---|---|
| Routing + structure | 100% |
| Logic ported natively | ~99% (2 SSE routes intentionally on the worker) |
| Decoupled from Next repo | 100% |
| **Proven to work** | **0%** |

Structurally the migration is done. Empirically, nothing is known.
The next hour on your machine is worth more than everything before it.
