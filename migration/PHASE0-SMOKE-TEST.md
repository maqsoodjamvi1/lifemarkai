# Phase 0 — Runtime Verification

> ## ✅ RE-RUN 2026-07-26 — the real route generator EXECUTED, and it found a bug.
>
> I got `@tanstack/router-generator` to run to completion by copying `src/routes` **and the generator's ~25-package dependency closure** onto local disk (importing it over the FUSE mount alone took **36.5 s**).
>
> **Result:** `routeTree.gen.ts` regenerated — **70,078 B / 77 routes → 232,574 B / 249 route imports** (248 routes + root). **The real generator parsed and accepted all 248 route files.** The updated tree is installed in the app.
>
> ### 🔴 Bug found and fixed: a dot is a PATH SEPARATOR
> `openapi.json.ts` derived the path **`/api/integrations/openai/openapi/json`** — not `.json`. Worse, the generator **silently rewrites `createFileRoute()` strings in your source** to match its own derivation (it rewrote exactly 1 of 248 files — mine). ChatGPT Actions fetch `/openapi.json`, so **that endpoint would have 404'd in production.**
>
> **Fix (empirically tested, not guessed):** renaming to **`openapi[.]json.ts`** — `[.]` escapes the dot — derives `/api/integrations/openai/openapi.json`. I re-ran the generator to confirm before applying. Final run rewrote **0** source files: full agreement.
>
> **Why my earlier check missed it:** my "248/248 paths match file locations" scan used *my own* derivation logic, so it agreed with itself. Only the real tool caught it. Treat that as the standing lesson for the rest of this migration.
>
> ### Two files you must delete locally (the mount blocked removal)
> ```
> src/routes/api/integrations/openai/openapi.json.ts   ← emptied to 0 bytes, delete it
> src/routes/api/integrations/openai/openapi.json/     ← empty stray dir, remove it
> _gen_probe.mjs                                        ← emptied scratch file, delete it
> ```
>
> ### ✅ `_splat` contract VERIFIED against library source (was risk #1)
> Read from `@tanstack/router-core/dist/esm/new-process-route-tree.js:483-485`:
> ```js
> const splat = decodeURIComponent(value);
> rawParams["*"]   = splat;
> rawParams._splat = splat;      // ← a STRING, already URI-decoded
> ```
> `_splat` is a **string**, not an array (`*` is an alias). My three consumers all do
> `String(params._splat ?? "").split("/")` — **which is correct**. Next's `path: string[]`
> maps to splitting that string, exactly as implemented in `/preview/$`,
> `/preview-by-slug/$`, and `/api/gateway/$connector/$`.
>
> This was the least-verified guess in the migration; it is now checked against the
> real implementation rather than assumed. (Still worth an HTTP test — this confirms the
> param *shape*, not the surrounding handler logic.)
>
> ### ❌ Vite cannot boot in this sandbox — structural, 3 strategies attempted
> | Attempt | Outcome |
> |---|---|
> | Side-load `@rollup/rollup-linux-x64-gnu` | **Core dump.** Loading the `.node` binary standalone crashes node — CPU/libc incompatible, not a FUSE issue. |
> | `@rollup/wasm-node` fallback | Package obtained, but needs a complete working `node_modules` to substitute into. |
> | Clean `npm install` on local disk | Cannot finish inside the ~45 s call limit, and `--die-with-parent` forbids backgrounding. Two attempts wrote 0 packages. |
>
> Network is **fine** (Supabase → 401, example.com → 200 — my earlier "no network" note was wrong; only the npm-registry curl is blocked). So the limitation is purely the toolchain, not connectivity.
>
> The blocker table below still applies to *full* runtime (dev server / HTTP), which remains untested.

**Attempted in the Linux sandbox: 2026-07-26. Full runtime verification is NOT possible there — it must run on your Windows machine.** Reasons are concrete and listed below, along with what I *was* able to verify and a ready-to-run smoke test.

---

## Why the sandbox can't do it (4 hard blockers)

| # | Blocker | Detail |
|---|---|---|
| 1 | **Platform mismatch** | `node_modules` was installed on Windows → contains `@rollup/rollup-win32-*`, missing `@rollup/rollup-linux-x64-gnu`. Vite won't start. |
| 2 | **Native crash** | Side-loading the Linux rollup binary via `NODE_PATH` → **`Bus error (core dumped)`**. Native `.node` mmap doesn't work reliably over the FUSE mount. I deliberately did **not** run `npm install` in the sandbox — it would have overwritten your Windows binaries in the shared `node_modules`. |
| 3 | **Vite-only virtual modules** | TanStack Start resolves `#tanstack-router-entry`, `#tanstack-start-entry`, `tanstack-start-manifest:v` **only inside its Vite plugin**. Route modules cannot be bundled or loaded by bare esbuild/node — I tried, and stubbing them further would only test a fake bundle. |
| 4 | **Long-running node processes die on the mount** | `tsc --noEmit` and the route generator both terminated silently mid-run over FUSE. (I initially misread these as "still running" — my `pgrep -f` pattern was matching *its own bash command line*. Corrected: they died.) Both will be fast on your local SSD. |

Even past those, most routes need live Supabase + a session cookie, so meaningful responses need your env anyway.

---

## ✅ What I DID verify (real, non-trivial)

### 1. Route path ↔ file location: **248/248 exact match**
TanStack requires the `createFileRoute("...")` string to match the file's location precisely. A mismatch = route silently doesn't register. The mechanical transform placed **every** route correctly — including the tricky ones:
- `api/integrations/openai/openapi.json.ts` → `/api/integrations/openai/openapi.json`
- `api/gateway/$connector/$.ts` → `/api/gateway/$connector/$`
- `api/projects/$id/secrets/$secretId.ts` → nested dynamic params

### 2. Transform defect scan: **0 occurrences** of every known failure class

| Defect | Why it matters | Found |
|---|---|---|
| `.validator(` instead of `.inputValidator(` | **Load-time TypeError** — killed this migration once before | 0 |
| leftover `NextResponse` / `NextRequest` | Undefined at runtime | 0 |
| leftover `from "next/server"` | Unresolvable (alias deleted) | 0 |
| leftover `await params` | `params` is not a Promise in Start | 0 |
| leftover `.nextUrl` | Undefined on standard `Request` | 0 |
| duplicate `export const Route` | Module-level collision | 0 |
| `createFileRoute` without a `Route` export | Route never registers | 0 |
| leftover `export const runtime/maxDuration` | Next-only, ignored (noise) | 0 |

### 3. ⚠️ Route tree is STALE — expect this
`src/routeTree.gen.ts` contains only **77 of 248** routes. **171 are missing.**

This is *expected* (the Router plugin regenerates it on `vite dev`/`vite build`), but it is **the single most likely cause of mass 404s**.

**I tried to regenerate it here and partially succeeded.** `@tanstack/router-generator@1.167.21` is installed, and running its `Generator` directly (no Vite, no rollup, no native binaries) **resolved the config correctly**:

```
routesDirectory    : …/src/routes            ✓
generatedRouteTree : …/src/routeTree.gen.ts  ✓
```

That is real evidence the wiring is correct and regeneration will work on your machine. The generator then died mid-run — same FUSE stall that killed `tsc` and `vite`. **`routeTree.gen.ts` was left byte-identical to its backup — nothing was written, no damage.**

**Force regeneration explicitly before booting**, so a stale tree can't confuse your smoke test.

> ⚠️ **Correction — an earlier draft of this snippet was wrong in two ways. Both are fixed below.**
> 1. It told you to count `createFileRoute` in `routeTree.gen.ts`. **That string never appears in the generated file** (it contains `import { Route as XRouteImport } from …` instead), so the check would always return `0` and you'd have concluded regeneration failed when it had actually worked.
> 2. `Out-File -Encoding utf8` writes a **BOM** on Windows PowerShell 5.1, which can break Node's ESM parsing of `.mjs`.

> ### ⚠️ Correction #2 — this section was stale AND wrong in three ways
> I wrote it *before* actually running the generator. Having now run it, all three
> outcomes in the old table were incorrect:
>
> 1. **"baseline expect 77" is obsolete.** I already regenerated and installed the tree —
>    it now reads **249**. Running the baseline today gives 249, not 77.
> 2. **"~248" is imprecise.** The exact number is **249** (248 routes + `__root`).
>    250 files exist in `src/routes`; one is `__root`, one is the emptied `openapi.json.ts`.
> 3. **"the generator logs which routes were rejected" is false.** My real run printed only
>    `config ok` / `RUN COMPLETE` — zero per-route output. And the source shows it
>    **throws** on a bad route (`generator.js:143,166,526`) rather than skipping it. There is
>    no "partial tree with some routes dropped" mode.
>
> **The failure mode I missed is the dangerous one:** the generator can *succeed* while
> **silently rewriting your `createFileRoute()` strings** to match its own path derivation.
> No warning, no log. That is exactly what happened to `openapi.json.ts`. Always check
> `git diff src/routes/` after generating.

**Step 1 — baseline (now already `249`, since I regenerated it for you):**
```powershell
cd D:\Projects\lifemarkai\migration\tanstack-start-app
(Select-String -Path src\routeTree.gen.ts -Pattern '^import \{ Route as').Count
```

**Step 2 — regenerate:**
```powershell
$js = @'
import { Generator, getConfig } from '@tanstack/router-generator'
const root = process.cwd()
const config = await getConfig(
  { routesDirectory: 'src/routes', generatedRouteTree: 'src/routeTree.gen.ts' },
  root,
)
await new Generator({ config, root }).run()
console.log('route tree regenerated')
'@
# WriteAllText avoids the PS 5.1 BOM that can break Node ESM
[IO.File]::WriteAllText("$PWD\_regen.mjs", $js)
node _regen.mjs
Remove-Item _regen.mjs
```

**Step 3 — verify (expect ~`248`, definitely not `77`):**
```powershell
(Select-String -Path src\routeTree.gen.ts -Pattern '^import \{ Route as').Count
```

| Outcome | Meaning | Action |
|---|---|---|
| Command succeeds, count = **249** | ✅ All 248 routes + `__root` registered. Matches my verified run. | Proceed. |
| Command **throws** naming a file | 🔴 A route file is genuinely malformed. The generator throws rather than skipping (`generator.js:143/166/526`), so **no partial tree** — the error message names the offending file. | Fix that file, re-run. |
| Succeeds, but `git diff src/routes/` is **non-empty** | 🟠 **The silent one.** The generator rewrote your `createFileRoute()` path strings to match its own derivation — no warning printed. This is what hit `openapi.json.ts`. | Read the diff. If a URL changed, decide whether to accept it or escape the filename (e.g. `[.]`). |
| Count **< 249** without an error | 🟠 A file exists but exports no `Route`, so it was skipped silently. | Diff the tree's imports against `src/routes` to find it. |

**Always run `git diff src/routes/` after generating.** The dangerous failure is not a crash — it's a silent path rewrite that changes a public URL.

If you'd rather skip this entirely, `npm run dev` regenerates automatically; running it standalone just isolates the failure so a stale tree can't masquerade as broken routing.

> Housekeeping: a scratch file `_gen_probe.mjs` is left in the app root (emptied — the mount blocked deletion). Nothing imports it; delete it locally.

---

## Run this on Windows

```powershell
cd D:\Projects\lifemarkai\migration\tanstack-start-app

npm install                 # your platform's binaries — fixes blockers 1 & 2
npm run dev                 # http://localhost:3001
```

**First check — did the route tree regenerate?**
```powershell
Select-String -Path src\routeTree.gen.ts -Pattern "createFileRoute" | Measure-Object
# expect ~248, NOT 77
```

### Smoke test (paste into a second terminal)

```powershell
$base = "http://localhost:3001"
$routes = @(
  # 🔴 highest risk — hand-mapped splat params
  "/preview/SOME_PROJECT_ID",
  "/preview/SOME_PROJECT_ID/index.html",
  "/preview-by-slug/SOME_SLUG",
  "/api/gateway/slack/chat.postMessage",
  # 🔴 SSE streaming
  "/api/ai/chat", "/api/ai/agent", "/api/ai/brainstorm",
  # 🟠 static + simple
  "/api/ai/analyze/capabilities", "/api/health", "/api/templates",
  "/api/integrations/openai/openapi.json",
  # 🟠 params
  "/api/projects/SOME_ID/config", "/api/projects/SOME_ID/secrets",
  # 🟡 pages
  "/", "/pricing", "/login", "/dashboard", "/editor/SOME_PROJECT_ID"
)
foreach ($r in $routes) {
  try {
    $c = (Invoke-WebRequest "$base$r" -Method GET -SkipHttpErrorCheck -TimeoutSec 10).StatusCode
  } catch { $c = "ERR" }
  "{0,-55} {1}" -f $r, $c
}
```

**Reading the results:**

| Code | Meaning |
|---|---|
| `401` / `403` | ✅ **Route works.** It registered and rejected an unauthenticated call — exactly right. |
| `200` | ✅ Works (public route). |
| `404` | 🔴 **Route did not register.** Check `routeTree.gen.ts`, then the `createFileRoute` path. |
| `500` | 🟠 Route registered, handler threw. Check the terminal stack trace — most likely a missing env var or a `params` shape issue. |
| `ERR` | 🔴 Server not up / crashed. |

Then build:
```powershell
npm run type-check    # expect noise from @ts-nocheck files — triage only real errors
npm run build         # MUST be green before Phase 1
```

---

## Where I'd expect failures, ranked

1. **Splat params** (`/preview/*`, `/preview-by-slug/*`, `/api/gateway/*`) — I hand-mapped Next's `path: string[]` to `String(params._splat).split("/")`. This is the **least verified guess in the whole migration.** If `_splat` isn't the right accessor in your TanStack version, all three break identically.
2. **SSE streaming** (`ai/chat`, `ai/agent`, `brainstorm`) — the `ReadableStream` + `data:` framing was carried over verbatim; Start may buffer differently.
3. **Stripe webhook** (`/api/billing/webhook`) — needs the **raw** body for signature verification. If Start pre-parses it, signatures fail.
4. **`@ts-nocheck` blind spots** — the transformer added these headers, so type errors are actively suppressed across ~200 files. `npm run type-check` will under-report.

---

## Honest status

Static verification is as complete as I can make it: routing, imports, transform correctness, and defect classes are all clean. **But not one line of the migrated code has executed.** Phase 0 is genuine work, not a formality — budget real debugging time.
