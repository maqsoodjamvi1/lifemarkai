# Preview Engine Migration Plan — Babel-shim → Real Bundler (WebContainer)

_Goal: close the single biggest gap vs. Lovable — make the live preview run **any**
React/Vite project through a real bundler, so preview == deploy and arbitrary npm
packages "just work."_

## ⚠ STATUS UPDATE — most of this is already built

On review, the WebContainer engine is **already implemented and enabled** in the repo:
- `components/editor/webcontainer-preview.tsx` — full engine: `WebContainer.boot()`
  (with timeout + watchdog), mount file tree, incremental `wc.fs.writeFile` HMR sync,
  console/error surfacing, device modes.
- `lib/preview/resolve-preview-engine.ts` — engine selection (WebContainer vs. the
  Babel-shim fallback).
- `lib/preview/patch-vite-for-webcontainer.ts`, `lib/preview/veb-bridge.ts` — Vite
  patches + the visual-edit/postMessage bridge.
- `components/editor/preview-panel.tsx` — wires both engines; `editor-layout.tsx`
  passes `useWebContainers` (true).
- `next.config.mjs` — COOP/COEP headers on `/editor/:path*` + WebContainer CSP.

So **Phases 0–2 below are effectively done.** The engine activates when
`window.crossOriginIsolated === true` AND the project looks like a Vite app
(`shouldUseWebContainer`) AND no prior boot failure set `lifemark-wc-unavailable`.

**Why the editor has been showing the Babel shim instead:** the real engine falls
back when isolation isn't live (stale dev server without the COOP/COEP headers
applied) or a `WebContainer.boot()` failed once this session (which sets the
`lifemark-wc-unavailable` sessionStorage flag → forces fallback for the rest of the
session).

### To actually run on WebContainers (verification checklist)
1. Clean restart so the `next.config.mjs` headers are applied: `npm run dev`.
2. In the editor's DevTools console: `window.crossOriginIsolated` must be `true`.
   If `false`, a sub-resource is violating COEP `require-corp` — find it in the
   Network tab (blocked by COEP) and add `crossorigin`/CORP or proxy it.
3. Clear a stale failure flag: `sessionStorage.removeItem('lifemark-wc-unavailable')`,
   then reload.
4. Watch the preview panel logs for `WebContainer.boot()` → `npm install` → `vite`.
   If boot times out, that's the thing to debug (memory/network — both have been
   flaky on this machine).

### Known cleanup item — DONE (June 14)
The leftover debug instrumentation in `webcontainer-preview.tsx` (a
`fetch('http://127.0.0.1:7580/ingest/…')` on every sync + boot) has been removed,
along with its `debugConnectSrc` CSP allowance in `next.config.mjs`. The
dev-only `scripts/verify-*.ts` helpers that wrote `debug-148b16.log` remain (not
bundled, harmless) and can be deleted whenever.

### All four phases — COMPLETE (June 14)
- **Phase 0–1 — boot + real project:** WebContainer boots with COOP/COEP headers,
  mounts `project_files`, `npm install` (3× retry/backoff), `vite --host`. **Gap
  closed:** runtime errors inside the cross-origin iframe now surface in the editor.
  `lib/preview/veb-bridge.ts` injects `PREVIEW_RUNTIME_SCRIPT` alongside the visual-
  edit bridge — it forwards `window.onerror`, `unhandledrejection`, and
  `console.error` to the parent using the SAME `{source:'lifemark-preview',
  type:'error'}` contract the srcdoc fallback uses, so the error overlay + "fix this
  error" chat hand-off work on both engines. It also forwards route changes
  (`lifemark-preview-location`) for address-bar sync.
- **Phase 2 — HMR + live deps:** incremental `wc.fs.writeFile` sync drives Vite HMR.
  **Gap closed:** `reinstallIfDepsChanged()` in `webcontainer-preview.tsx` detects a
  `package.json` change while the dev server is already running and runs `npm
  install` in the live container (previously a mid-session dependency add was written
  via HMR but never installed → unresolved import).
- **Phase 3 — fallback:** `resolvePreviewEngine` + `WC_UNAVAILABLE_KEY`. On any
  unrecoverable WC error, `preview-panel.tsx`'s `onError` sets the sessionStorage
  flag and switches `previewEngine` to `"fallback"` (Babel shim) for the session.
- **Phase 4 — deploy parity:** `lib/deploy/build-project.ts#tryViteBuild` runs a real
  `vite build` and is wired into BOTH `lib/queue/deploy-worker.ts` and the inline
  path in `app/api/deploy/route.ts`; deploys the production `dist/` when the build
  succeeds (opt-in `ENABLE_SERVER_VITE_BUILD=true`, null→static fallback).

### Final sign-off still needs a live server (can't be done in the sandbox)
- Confirm `window.crossOriginIsolated === true` in the editor and watch one real
  WebContainer boot → install → vite → `server-ready`.
- Trigger a runtime error in a previewed app and confirm it lands in the editor's
  error overlay (validates the new runtime bridge end-to-end).
- Flip `ENABLE_SERVER_VITE_BUILD=true` and run one real Publish to confirm the
  `dist/` upload path.
- Optional hardening not blocking parity: warm-install snapshot so first boot is
  faster.

The phased plan below is kept for reference.

---

## 1. Why this matters

The live preview is the core of the product loop (prompt → see it work → publish).
Today it's the weakest link, and it's an architectural limitation, not a bug.

### How the preview works today (`components/editor/preview-panel.tsx`)

For each generated file the panel:
1. **Regex-rewrites every `import`** into `window.__Mrequire('pkg')` calls
   (`wrapFile`) — a hand-written string transform, not a real module resolver.
2. **Compiles each file with Babel-in-the-browser** (`@babel/standalone` from a CDN),
   now with explicit `isTSX`/`allExtensions` per file.
3. Resolves packages from a **hand-written shim table** (`__Mrequire`): a CDN UMD
   `<script>` for `lucide-react`/`recharts`, an inert stub object for
   `framer-motion`, a fake `clsx`, a Proxy for `@radix-ui/*`, etc.

### Why that caps the product

- **Every library needs a bespoke shim.** Anything not in the table silently
  returns `{}` and the app crashes. Lovable supports the whole npm registry.
- **Module resolution is string-matching**, not a real graph — fragile on aliases,
  barrels, deep imports, dynamic imports.
- **Preview ≠ deploy.** The preview is interpreted in-browser; "publish" ships a
  static `index.html` with CDN React + Babel-standalone. Neither is a real build,
  so a working preview doesn't guarantee a working app.
- **Compile is on the client every render** — slow, and one parse error historically
  blanked everything (since hardened with per-file isolation, but still a hack).

Lovable runs a **real Vite dev server in a WebContainer** (StackBlitz's in-browser
Node). Real `npm install`, real bundler, real HMR, and the same code deploys.

## 2. Target architecture

Run the generated project in a **WebContainer** (`@webcontainer/api`, already in
`package.json`) executing a standard Vite dev server:

```
Editor (parent)
  └─ <iframe> ← WebContainer
       ├─ writes project files to the in-memory FS
       ├─ runs `npm install` (real registry, cached)
       ├─ runs `vite` dev server → serves the app on an internal URL
       └─ HMR: on file change, write file → Vite hot-reloads
```

The iframe points at the WebContainer's dev-server URL instead of a hand-built
`srcDoc`. Imports resolve normally; any npm package works; the preview is the app.

### Why WebContainer over Sandpack
Both are in `package.json`. WebContainer gives a true Node environment (real `npm
install`, real Vite, edge functions later); Sandpack is lighter but bundler-limited.
For "preview == deploy," WebContainer is the right target. (Sandpack is a reasonable
fallback for browsers where WebContainer's COOP/COEP requirements can't be met.)

## 3. Constraints to solve first

1. **Cross-origin isolation.** WebContainer requires the page to be cross-origin
   isolated (`COOP: same-origin`, `COEP: require-corp`). The editor route must send
   those headers (Next `headers()` in `next.config` or middleware) — and every
   third-party asset the editor loads must be CORP-compatible or proxied. This is
   the highest-risk item; verify it doesn't break Monaco, Supabase, etc.
2. **`npm install` cost.** First boot installs deps (seconds). Mitigate with a
   warm base snapshot (pre-installed react/vite/tailwind), a persistent install
   cache, and only re-installing when `package.json` deps change.
3. **Project shape.** Generated projects must be valid Vite projects (they already
   scaffold `vite.config.ts`, `index.html`, `src/main.tsx`, `package.json` — good).
   The AI system prompt already targets this; keep it.

## 4. Phased implementation

### Phase 0 — Spike (½–1 day)
- New isolated route `/editor/[id]/wc-preview` (or a feature-flagged panel).
- Send COOP/COEP headers on that route only.
- Boot a WebContainer, mount a hardcoded "hello Vite" project, run `npm i && vite`,
  show the dev-server URL in an iframe.
- **Exit criterion:** a trivial Vite app renders. Confirms cross-origin isolation
  works in the target browsers without breaking the rest of the editor.

### Phase 1 — Real project boot (2–3 days)
- Mount the actual `project_files` into the WebContainer FS (path-for-path).
- `npm install` (deps from the generated `package.json`), then `vite --host`.
- Wire the existing console bridge / error overlay to the WebContainer's stdout +
  the iframe's `window.error` so errors still surface in the editor with filenames.
- **Exit criterion:** the current login-page project renders identically (or better)
  to the shim path, with `react-hook-form` + `zod` actually resolved from npm.

### Phase 2 — Live updates / HMR (2 days)
- On AI file write or manual edit, write the changed file to the WC FS; Vite HMR
  picks it up. On `package.json` dep change, debounce-trigger `npm install`.
- Replace the iframe `srcDoc` regeneration with WC dev-server URL + HMR.
- **Exit criterion:** editing a component hot-updates the preview without full reload.

### Phase 3 — Make the shim path the fallback (1 day)
- Feature-flag: `WC` preview is the default; the Babel-shim `buildFallbackHtml`
  becomes the fallback for (a) browsers without cross-origin isolation, (b) WC boot
  failure. Keep it — it's a genuinely useful degradation path.
- **Exit criterion:** default = WebContainer; graceful fallback verified.

### Phase 4 — Deploy parity (3–5 days, separate but enabled by this)
- "Publish" runs `vite build` (in the WebContainer or a server build worker) and
  deploys the **real `dist/`** to Netlify/Vercel — not the static `index.html`+CDN
  shim in today's deploy worker. Now preview == deploy.
- (Backend parity — provisioning a Supabase project per app — is a separate track,
  but a real build is the prerequisite.)

## 5. Files this touches

- `components/editor/preview-panel.tsx` — add a WebContainer engine alongside the
  existing srcdoc engine; gate by flag + isolation support. (Large file; the shim
  code stays as fallback.)
- `next.config.*` / `middleware.ts` — COOP/COEP headers scoped to editor routes.
- New `lib/preview/webcontainer.ts` — boot, mount FS, install, run Vite, expose
  the URL + HMR write API.
- `lib/preview/veb-bridge.ts` — already exists for the WebContainer postMessage
  bridge; reuse/extend for console + visual edits.
- `app/api/deploy/route.ts` + `lib/queue/deploy-worker.ts` — Phase 4: real `vite
  build` output instead of the static CDN `index.html`.

## 6. Risks & mitigations

| Risk | Mitigation |
|---|---|
| Cross-origin isolation breaks other editor assets | Scope headers to the preview route/iframe only; proxy non-CORP assets |
| `npm install` latency hurts first-render | Warm base snapshot + install cache; show a real "installing deps" state |
| WebContainer unsupported in some browsers | Keep the Babel-shim path as automatic fallback (Phase 3) |
| Large existing `preview-panel.tsx` | Add the new engine in a separate module; don't rewrite the shim, demote it |
| Memory (already a sore point on this machine) | One WebContainer per editor tab; tear down on unmount |

## 7. Effort & sequencing

- **Phase 0–3 (preview is real):** ~1–1.5 weeks. This alone closes the biggest gap.
- **Phase 4 (deploy parity):** ~1 week, unlocked by the above.
- Do Phase 0 first as a hard go/no-go on cross-origin isolation — it's the one
  thing that can block the whole approach, and it's cheap to prove.

## 8. Definition of done

A user can prompt an app that imports an arbitrary npm package (say `@tanstack/
react-table` or `react-leaflet` — neither has a shim today), see it render correctly
in the live preview via a real Vite server, edit a file and watch HMR update it, and
hit Publish to deploy the exact same build. At that point the core loop matches
Lovable's, and the remaining gap is backend provisioning, not the engine.
