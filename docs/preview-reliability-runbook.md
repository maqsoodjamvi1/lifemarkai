# Preview Reliability Runbook (Phase A)

> Goal: a non-technical user reliably gets a working first build. The preview
> transpiler has been the #1 source of "it won't compile" failures, so we (a)
> lock the fixed bug classes with a regression suite and (b) roll out the esbuild
> engine carefully behind its flag before making it the default.

## 1. Regression suite — run it before every deploy

```bash
npm run verify:previews   # npx tsx scripts/verify-preview-transpiler.ts
```

It renders fixture apps through the fallback engine (`buildFallbackHtml`) and
asserts the bug classes we've already fixed stay fixed:

- **Duplicate imports** from the same module → handles must be `var`, never
  `const` (else `Identifier '__mod_…' has already been declared`).
- **`import.meta.env`** → must be rewritten to the `window.__VITE_ENV` shim (else
  `Cannot use 'import.meta' outside a module`).
- **Relative multi-file imports** → resolved to `__Mrequire(...)`, with no
  leftover ES `import … from` statements (a guaranteed SyntaxError in eval).

Exit code is non-zero on any failure — wire it into CI so a transpiler regression
blocks the build.

**Regression-first rule:** when a new preview bug is found, add a fixture that
reproduces it to `scripts/verify-preview-transpiler.ts` *before* fixing the
transpiler. The fix is "done" when the fixture passes.

> Why fixtures, not templates: the 42 starter templates are design specs
> (sections/tokens/designNotes), not code — they only become code when the AI
> builds them. Fixtures are the correct, deterministic unit for transpiler tests.

## 2. esbuild engine rollout (flagged → shadow → default)

The esbuild-wasm engine (`lib/preview/esbuild-engine.ts`) replaces the regex
transpiler with a real bundler — the durable fix for the whack-a-mole bug class.
It is **off** by default (`NEXT_PUBLIC_PREVIEW_ESBUILD`) and not yet runtime-tested.

Roll it out without risking production:

1. **Staging only.** Set `NEXT_PUBLIC_PREVIEW_ESBUILD=true` in a staging/preview
   Coolify environment (build-time var → needs a no-cache rebuild to bake in).
2. **Shadow-compare.** Open ~10 real built apps that exercise the hard paths
   (Tailwind, relative imports, a Supabase scaffold, framer-motion, a chart lib).
   For each, confirm the esbuild preview renders the same as the fallback. Watch
   for: esm.sh fetch failures, wasm load latency, and entry-point resolution.
3. **Watch the failure modes** unique to esbuild: CDN (esm.sh) outages, bare-dep
   resolution gaps, and first-load wasm cost. Keep the fallback engine as the
   automatic backstop if esbuild returns `{ html: null, errors }`.
4. **Flip the default** in `resolve-preview-engine.ts` only after staging is clean
   for a sustained period. Keep the flag so you can revert instantly.

## 3. Engine selection (today)

`lib/preview/resolve-preview-engine.ts` picks `sandbox > webcontainer > fallback`.
esbuild slots in ahead of the regex fallback once flipped. Until then, the
fallback engine + this regression suite are the reliability floor.

## 4. Exit criteria for Phase A

- `npm run verify:previews` is green and runs in CI.
- esbuild has shadow-compared cleanly on the hard-path apps in staging.
- A fresh, non-technical prompt ("build a CRM", "build a storefront") produces a
  preview with **zero** transpiler errors on the first try.
