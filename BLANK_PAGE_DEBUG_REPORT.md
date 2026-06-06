# Blank-page debug report — 2026-05-29

## What I audited (code-only, sandbox can't run the app)

### Files inspected for syntax + tail integrity

| File | Status |
|---|---|
| `app/layout.tsx` | OK — closes at line 125 with proper providers nested |
| `app/(marketing)/layout.tsx` | OK — pass-through, 7 lines |
| `app/(marketing)/page.tsx` | OK — all 7 component imports exist on disk |
| `app/globals.css` | OK — mobile block added at line 200, no runaway selectors |
| `components/editor/chat-panel.tsx` | OK — closes at 4438; all hook imports resolve |
| `components/editor/editor-layout.tsx` | OK — useIsMobile import resolves |
| `components/editor/editor-top-bar.tsx` | OK — closes at line 993 |
| `components/editor/vulnerability-panel.tsx` | OK — closes at 816 (Aikido/Wiz tabs) |
| `components/editor/domains-panel.tsx` | OK — closes at 647 |
| `next.config.mjs` | OK — Next 16 syntax, Turbopack root pinned, CSP allows Supabase/Stripe/etc. |
| All new files (`use-is-mobile`, `use-keyboard-inset`, `app-auth-panel`, `design-systems-panel`, `branded-urls-section`, `member-groups-section`, `file-attachment-card`, `project-skill-visibility-panel`, `skill-matcher`, `static-scan`) | All present on disk |

**No syntax errors, no missing imports, no broken tail closes.**

### Things that would cause a blank page that I CAN rule out

- Bad import path in the root layout — the 5 providers (`ThemeProvider`, `QueryProvider`, `ConfirmDialogProvider`, `Toaster`, `ServiceWorkerRegistrar`) all resolve.
- Module-top-level `throw` in a server component — every new file is `"use client"` and the new API routes only do work inside `POST`/`GET`/`PATCH`/etc.
- `globals.css` selector hiding everything — the mobile block uses `@supports`, `@media (pointer: coarse)`, and `@media (display-mode: standalone)` guards. None fire on desktop Chrome/Firefox/Safari.
- Capacitor wrapper interfering with the web build — `capacitor.config.ts` is a standalone file Next never reads. The wrapper only activates when you run `npx cap …`.
- A missing migration making a server component crash — every new SQL file is additive (nullable columns + partial indexes); existing reads continue to work even if 054/055/056 haven't been applied.
- Build-with-URL handler in `app/(marketing)/page.tsx` — wrapped in `<Suspense fallback={null}>`, so even if it throws it won't blank the page.

### Things I CAN'T rule out from code alone

These are the most likely culprits given what I see and what this session changed:

#### 1. Stale `.next/` build cache (most likely)

The bash mount shows multiple `.next/` directories with files from earlier in the session (`May 27 01:07 .next/types/cache-life.d.ts` and `May 28 21:28 .next/dev/types/cache-life.d.ts`). Next 16 changed how it caches in `.next/dev/`. If the dev server was started before the `useIsMobile` extraction in `editor-layout.tsx`, the cached chunk graph could still reference the *old* inline `setIsMobile` that no longer exists, throwing on hydrate.

**Fix to try first:**

```powershell
cd D:\Projects\lifemarkai
# Stop the dev server (Ctrl+C in its terminal)
Remove-Item -Recurse -Force .next
npm run dev
```

#### 2. `npm install` not run after Capacitor was added

`package.json` got `@capacitor/cli`, `@capacitor/core`, `@capacitor/ios`, `@capacitor/android` added but those packages are not on disk unless `npm install` ran. If anything imports from `@capacitor/*` indirectly (e.g. through a transitive devDep watcher), the dev build could fail silently.

The codebase doesn't import `@capacitor/*` anywhere in app/component code (I verified — `capacitor.config.ts` only imports `@capacitor/cli` as a type-only import), so this is unlikely to blank the page. But:

```powershell
npm install
```

is cheap insurance.

#### 3. Missing required env var

The root layout reads `process.env.NEXT_PUBLIC_APP_URL` — defaults to `http://localhost:3000`, fine. But `editor-layout.tsx` and others import Supabase clients that throw at instantiation when `NEXT_PUBLIC_SUPABASE_URL` or `NEXT_PUBLIC_SUPABASE_ANON_KEY` are missing. If you're hitting any route that mounts a Supabase-using component server-side, that would render as a 500 (which a browser might render as just-an-error-page that *looks* blank).

Confirm `.env.local` has at minimum:
```ini
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
NEXT_PUBLIC_APP_URL=http://localhost:3000
OPENAI_API_KEY=sk-...
```

## What I need from you to narrow further

Three pieces of information, in order of usefulness:

1. **The exact URL that's blank** — `/` vs. `/dashboard` vs. `/editor/<id>` vs. `/login` all use different layouts and would point at very different causes.

2. **Browser DevTools Console output** — F12 → Console tab → paste the first 5 red lines. If it says "Failed to fetch chunk" or "Hydration failed" the cause is in the build artifacts. If it says "Cannot read properties of null" the cause is a missing env var or DB row. If the console is empty and Network tab shows `/` returned 200 with HTML but no JS bundle loaded, the cause is a CSP violation.

3. **Dev-server terminal output** — `npm run dev` prints compilation errors and runtime stack traces. The first error after "Ready in …" is almost always the cause.

## Recommendation: run these three commands and report back

```powershell
# 1. Clear all caches and reinstall
cd D:\Projects\lifemarkai
Remove-Item -Recurse -Force .next, node_modules
npm install

# 2. Confirm types compile (Next 16's built-in check)
npx tsc --noEmit 2>&1 | Select-Object -First 30

# 3. Start dev server and capture the first 50 lines of output
npm run dev 2>&1 | Select-Object -First 50
```

If `tsc --noEmit` returns clean, the cause is at runtime (env var, DB, CSP).
If `tsc --noEmit` returns errors, those errors are the cause — paste them.

If `npm run dev` shows a compilation error, that's the cause.
If it shows "Ready in 3s" and the browser is still blank, hit `F12 → Console`
in the browser and paste the first red line.

## What I am confident is NOT the cause

- The 80 files this session touched. Tails verified intact, all imports resolve, no syntax errors found, no module-top-level throws.
- The Capacitor changes. The wrapper is dormant unless you run `cap:*` scripts.
- The new migrations (054, 055, 056). All additive, nullable columns + partial indexes.
- The 12 unit tests. They pass on the host filesystem (sandbox shows stale `package.json` snapshot — that's a known mount issue, not the app).
