# Next.js → TanStack Start: Removal Readiness Audit

**Date:** 2026-07-26
**Scope:** `migration/tanstack-start-app` vs the Next.js app at repo root
**Method:** static analysis — route/method cross-check, import graph, build scripts, vite config, package manifests. **Not runtime-verified.**

---

## Verdict

**Surface parity is done. Next.js removal is NOT done.**

Every URL the Next app serves now has a TanStack Start route entry. But **52 of 205 API route files are transport shims that execute the original Next `app/api/**/route.ts` files inside a side-car Node worker**, and the editor UI is consumed in-place from the Next repo through `next/*` compatibility shims.

Next.js is no longer the *router*. It is still the *runtime* for ~25% of the API and the *source of truth* for the editor component tree.

Honest completion estimate: **~72% removed**, with the remaining 28% concentrated in two hard blockers.

---

## What IS complete ✅

| Area | Status | Evidence |
|---|---|---|
| **UI pages** | 39 / 39 | Every `app/**/page.tsx` URL has a `src/routes/*.tsx` equivalent (incl. dynamic `:param` and splat routes) |
| **API routes (entries)** | 203 / 203 | Method-by-method cross-check: 0 routes missing, 0 methods missing |
| **API routes (true native)** | 146 / 205 files | Self-contained logic, no Next handler involved |
| **Libraries ported** | ~30 subsystems | stripe, github, gitlab, cloud, email, domains, credits, rate-limit, audit, seo, security, semrush, workspace/identity, templates, preview-token, snapshot-diff, mcp-client, lovable-db, api-key … |
| **`next` package dependency** | Absent | Not in `migration/tanstack-start-app/package.json`, not in its `node_modules` |
| **`next.config.*` / `middleware.ts`** | Absent | Migration app has neither |
| **Real `next/*` imports in `src/`** | Effectively zero | Only 3 hits, all benign (see note below) |

> **Note on the 3 `next/*` hits in `src/`:** `system-prompts.ts` (inside an AI prompt *string* teaching Next codegen), `changelog.tsx` (inside a *comment* documenting the conversion), and `next-dynamic.tsx` (the shim that *implements* the replacement). None are live Next imports.

---

## BLOCKER 1 — ✅ SOLVED (2026-07-26)

**The OOM premise was false, and the blocker is now closed.**

Measured, not assumed:

| Bundle | Peak RSS | Time | Output |
|---|---|---|---|
| `lib/ai/generate.ts` | 78 MB | 23 s | 2.2 MB |
| Entire AI surface (generate + agent + self-verify + self-healing + editor-intelligence + code-parser + model-defaults + build-intent) | **91 MB** | 13 s | 2.7 MB |
| `src/lib/ai/generate.ts` (post-port) | 43 MB | 2.7 s | 801 KB |

The real OOM came from `import.meta.glob` over **all 203 `app/api` routes at once**, not from `lib/ai`. The worker was never required for the AI graph.

**What was done**
1. **Ported the `lib/ai` closure** — only 5 files were actually missing (`analyze-runner`, `embed-text`, `preview-verify`, `self-healing`, `self-verify`); the other 350 closure files were already in `src` from the earlier editor bulk-copy. A second pass added 18 more second-order libs (`cost-controls`, `editor-lenses/{orchestrator,persistence,roles}`, `project-credit-meter`, `redact-ai-request`, `deploy/build-deploy-files`, `editor/message-embeddings`, `import/lovable-adapter`, `integrations/{app-user-connections,connector-exec,connector-registry}`, `queue/client`, `sandbox`).
2. **Mechanically transformed all 49 Next handlers into true native routes** (`next/server`→`createFileRoute`, `NextResponse`→`Response`, `req.nextUrl`→`new URL(req.url)`, `await params`→`params`, stripped `runtime`/`maxDuration`, wrapped handlers in the `Route` export). Logic preserved verbatim.
3. **Gateway splat handled manually** — it used an `export { handler as GET, ... }` re-export, and Next's `path: string[]` had to become TanStack's `params._splat`.

**Result**

| Metric | Before | After |
|---|---|---|
| `proxyApiToWorker` routes | 52 | **0** |
| True native routes | 146 / 205 | **199 / 205** |
| Routes executing Next handlers | 52 | **0** |

**Verification:** 49/49 transform-clean (esbuild), 0 route-level unresolved `@/` imports, all 192 `src/lib` files scanned with only 3 known false positives (`@/lib/ai` + `@/lib/data` live inside AI prompt strings; `api-route-coverage.json` is a `.json` the checker didn't try). **Still not runtime-verified.**

The 6 remaining non-native files are `dispatchAppApi`/`proxyJsonToNext` hybrids — the next small cleanup.

---

## ~~BLOCKER 1 — 52 routes still execute Next.js handlers~~ (historical)

**This was the single thing preventing `npm uninstall next`.**

### How it works today
```
Browser → TanStack route (thin)          src/routes/api/ai/plan.ts
        → proxyApiToWorker(request)      src/lib/api-worker-client.ts
        → HTTP :3011                     scripts/api-http-worker.mjs
        → esbuild bundle of …            app/api/ai/plan/route.ts   ← NEXT.JS SOURCE
```

`scripts/build-api-manifest.mjs` line 87 walks **`repoRoot/app/api`** and prebundles every Next route handler into `.tmp/api-routes/*.mjs`. The worker imports those bundles. Delete `app/` and these 52 routes 500.

### Why it was done this way
Pulling the `lib/ai` dependency graph into Vite's SSR bundler **OOMs**. The worker exists specifically to keep that graph out of Vite. This was a deliberate, correct engineering decision — but it is a *deferral*, not a migration.

### The 52 routes
- **AI cluster (21):** `ai/{plan, brainstorm, complete, refactor, review, sql, docgen, enhance, inline-edit, commit-message, generate-file, generate-tests, generate-email(+test), generate-browser-tests, design-directions, design-guidance, design-previews, analyze/capabilities}`
- **Editor-intelligence (3):** `initiative`, `initiative/$id`, `review`
- **Project AI (10):** `health, image-proxy, summarise, readme, generate-knowledge, ai-proxy, browser-test, preview-verify, messages/search, editor-intelligence`
- **Connector graph (4):** `connector-permissions`, `connector-proxy`, `gateway/$connector/$`, `database`
- **Imports/sandbox (6):** `import-zip`, `import-lovable`, `snapshots/compare`, `cron/sandbox-cleanup`, `tests/run`, `skills/import`
- **Misc (8):** `deploy/build-stats`, `cloud/slow-queries`, `mcp`, `analytics`, `apps/$id/connect/$provider(+callback)`, `account/generate-workspace-knowledge`

### To close it
Port the `lib/ai` tree into `src/lib/ai` and reimplement handlers natively. The blocker is bundler memory, so it needs either:
1. **Lazy dynamic `import()`** inside handlers (keeps the graph out of the SSR entry — this already works for `cloud/permissions` + `cloud/management` in `import-database.ts`), or
2. **`ssr.external` / `optimizeDeps.exclude`** tuning so Vite treats `lib/ai` as external, or
3. Keep the worker permanently as a deliberate **service boundary** (rename it "AI service", stop calling it a Next dependency) — legitimate architecture, but then `app/api` must be *copied* out of the Next tree so `app/` can be deleted.

Option 3 is the cheapest path to actually deleting Next.

---

## BLOCKER 2 — ✅ SOLVED (2026-07-26)

**It was far smaller than the audit assumed.** The editor had *already* been copied into `src/components/editor` (238 files) by the earlier bulk-copy, and that local copy had **zero `next/*` imports** — the codemod had already run on it. Only **one** file still pointed at the Next repo.

**What was done**
1. **Repointed the bridge** — `editor-layout-bridge.tsx` did `await import("@lifemark/editor/editor-layout")`; now imports `@/components/editor/editor-layout`.
2. **Dropped the ambient module** in `vite-env.d.ts` (the local editor is fully typed).
3. **Removed `import "server-only"`** from `src/lib/credits.ts` — the only genuine Next specifier left in `src`. TanStack Start enforces the server boundary via server routes / `createServerFn`.
4. **Deleted all 9 aliases** from `vite.config.ts`: `next/{navigation,dynamic,link,image,server,headers}`, `server-only`, `client-only`, `@lifemark/editor`.

**3 orphan files deliberately NOT copied** — `editor-boot-script`, `editor-connectivity-error`, `webcontainer-preview`. They are unreferenced in the Start app (preview is Modal-only by design), and copying them would have reintroduced `next/*` imports for no benefit.

**Verification:** all 764 `src` files scanned — **0 real imports of any removed alias**. `vite.config.ts` parses; editor-layout, the bridge, and credits.ts all transform-clean; API route spot-check clean.

**`src/lib/next-shims/` is intentionally KEPT** — not for the app, but because `scripts/build-api-manifest.mjs` still uses it for the API worker's own esbuild pass (`app/preview` bundling). Likewise `src/lib/preview/next-app-preview.ts` emits `next/*` shims — those are for **user-generated Next apps in the preview iframe**, i.e. product functionality, not framework coupling.

---

## ~~BLOCKER 2 — Editor tree lives in the Next repo~~ (historical)

`vite.config.ts:182` aliases `@lifemark/editor` → `repoRoot/components/editor`. The Start app **reads the editor source in place** rather than owning it.

10 of those files import `next/*`:
```
code-panel.tsx              diff-viewer-panel.tsx
editor-connectivity-error.tsx   editor-layout.tsx
editor-payment-banner.tsx   editor-top-bar.tsx
lazy-editor-panels.tsx      lovable/upgrade-dialog.tsx
preview-panel.tsx           time-lapse-panel.tsx
```
(using `next/dynamic` ×6, `next/link` ×4, `next/navigation` ×2)

They only work because `vite.config.ts:174-181` aliases 8 Next specifiers to local shims:

| Shim | Replaces |
|---|---|
| `src/lib/next-shims/navigation.ts` | `next/navigation` |
| `src/lib/next-shims/dynamic.tsx` | `next/dynamic` |
| `src/lib/next-shims/link.tsx` | `next/link` |
| `src/lib/next-shims/image.tsx` | `next/image` |
| `src/lib/next-shims/server.ts` | `next/server` |
| `src/lib/next-shims/headers.ts` | `next/headers` |
| `src/lib/next-shims/server-only.ts` | `server-only`, `client-only` |

**These shims are load-bearing.** Removing them breaks the editor.

### To close it
1. Move `components/editor/**` into `migration/tanstack-start-app/src/components/editor` (some already copied — dedupe first; see `scripts/remove-redundant-editor-copies.sh`).
2. Codemod the 10 files: `next/link`→`@tanstack/react-router` `Link` (`href`→`to`), `next/navigation`→`useNavigate`/`useParams`, `next/dynamic`→ the existing `src/lib/next-dynamic.tsx` (already used by 6 components) or plain `React.lazy`.
3. Drop the `@lifemark/editor` alias + the 8 shim aliases.

---

## Remaining smaller items — ✅ ALL SOLVED (2026-07-26)

| Item | Outcome |
|---|---|
| **6 dispatch/hybrid routes** | Converted to true native (`deploy`, `health-scan`, `notifications`, `sandbox-preview/keep-alive`, `sandbox/status`, `security/scheduled-scan`). `dispatchAppApi` was just a `proxyApiToWorker` wrapper. |
| **`app/preview` + `app/preview-by-slug`** | Converted. The Start app already had catch-all `/preview/$` + `/preview-by-slug/$` proxy routes — those are now **native**, merging all 3 Next handlers (token-gated HTML, project-asset serving with MIME map, slug→project visibility resolution). |
| **FUSE ghost files** | Already cleared (0 remain). |
| **`server-only` externalization** | Moot — the import was removed and the alias deleted. |
| **`next-themes`** | Left as-is: framework-agnostic despite the name; swapping is cosmetic, not coupling. |

### 🔴 Also found & fixed: residual main-repo escapes (not in the original audit)

12 files imported via `../../../../../lib/...`, **escaping `src/` into the Next repo** — invisible to an `@/`-only search. Most critically `src/routes/api/ai/fix.ts` pulled the main repo's `lib/credits`, which still contains `import "server-only"` — whose alias I'd just deleted. That was a live build break.

- Rewrote 18 escaping specifiers to `@/` paths across 12 files.
- Ported the missing targets + closures (query-provider, theme-provider, toaster, sandbox/flags, persist-chat-turn, html-sanity, tanstack-start-scaffold, patch-sandbox-preview-files, branded-deploy-url, build-project) — ~19 files.
- **Caught my own overreach:** the codemod wrongly rewrote two *runtime* `path.resolve(here, "../../scripts/…")` calls in `worker-proxy.ts` / `ai-worker-client.ts` into `"@/scripts/…"`. Those are filesystem paths, not imports — reverted.

**Verification:** 779 src files scanned → **0 main-repo escapes**, **0 unresolved `@/`** (bar the 2 known prompt-string false positives). All **249 route files transform-clean**. **0** routes use `proxyApiToWorker` or `dispatchAppApi`.

---

## ~~Remaining smaller items~~ (historical)

| Item | Detail |
|---|---|
| **7 dispatch/hybrid routes** | Use `dispatchAppApi` / `proxyJsonToNext` — same Next-execution issue, smaller blast radius |
| **`app/preview`, `app/preview-by-slug`** | Worker also bundles these (`build-api-manifest.mjs:88-90`) — not yet TanStack routes |
| **`next-themes` dependency** | Works framework-agnostically, but is Next-branded; consider swapping |
| **FUSE ghost files** | `src/` contains ~50 `fuse_hidden*` artifacts from deleted-while-open files. Cosmetic, but they pollute greps. Clean with a fresh checkout |
| **`server-only` externalization** | `ai/fix.ts` fails a bare esbuild resolve; fine under Vite (aliased) but confirms shim dependency |

---

## Ordered plan to actually delete Next.js

1. **Decide the worker's fate** (architectural fork in the road)
   - *Keep it* → copy `app/api/**` to `migration/tanstack-start-app/api-handlers/**`, repoint `build-api-manifest.mjs`, rename to "AI service". **Unblocks deleting `app/` immediately.**
   - *Kill it* → port `lib/ai` into `src/lib/ai`, convert the 52 proxies to native with lazy `import()` inside handlers. Slower, but true single-runtime.
2. **Internalize the editor** — move `components/editor` in, codemod the 10 files, drop `@lifemark/editor`.
3. **Convert `app/preview` + `app/preview-by-slug`** to TanStack routes.
4. **Delete the shim aliases** from `vite.config.ts` one at a time; each deletion that still builds is a proven cut.
5. **Delete `app/`, `next.config.ts`, `middleware.ts`** from repo root; `npm uninstall next`.
6. **Runtime verification** — `npm install && npm run dev`, exercise every route group. *Nothing above has been runtime-tested.*

---

## Scorecard

| Dimension | Before | **After (Jul 26)** |
|---|---|---|
| Routing layer (pages) | 100% | 100% |
| Routing layer (API entries) | 100% | 100% |
| API business logic natively owned | 71% (146/205) | **100% (205/205)** |
| Routes executing Next handlers | 52 | **0** |
| Editor component ownership | ~0% (aliased) | **100% (internal)** |
| Next compat aliases in vite.config | 9 | **0** |
| Real `next/*` imports in `src` | 1 (`server-only`) | **0** |
| Imports escaping into the Next repo | 18 (undetected) | **0** |
| Preview routes native | 0 | **100%** |
| **Overall** | ~72% | **~99% (static)** |

---

## What actually remains before `rm -rf app/ && npm uninstall next`

**Only one thing: runtime verification.**

1. **`npm install && npm run dev`** — exercise every route group. **Nothing in this document has been runtime-tested**; it is all static analysis (import resolution + esbuild transform + route/method cross-check).
2. Once green: delete `app/`, `next.config.ts`, `middleware.ts` at repo root and `npm uninstall next`.
3. Optional cleanup after that: retire `scripts/api-http-worker.mjs` + `build-api-manifest.mjs` + `src/lib/next-shims/` (all now unused by the app — the worker no longer serves any route).

The root repo is still a working Next app; nothing here deletes it. The Start app simply no longer *depends* on it in any way.

### Static-analysis limits (be honest about these)
- Transform-clean ≠ runs. Type errors are suppressed by the `@ts-nocheck` headers the transformer emits.
- The mechanical Next→Start transform preserves logic verbatim, but **SSE streaming, `params` shapes, and header/cookie behaviour under Start are unverified**.
- Splat params were hand-mapped (`path: string[]` → `_splat.split("/")`) in `gateway`, `preview`, `preview-by-slug` — highest-risk spots to test first.
