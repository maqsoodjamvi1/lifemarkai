# Preview Compiler Redesign — Replace the Regex Transpiler with esbuild‑wasm

**Status:** Proposed (design only — not yet implemented)
**Owner:** Editor / Preview
**Related:** `lib/preview/build-fallback-html.ts`, `lib/preview/resolve-preview-engine.ts`,
`lib/preview/veb-bridge.ts`, `lib/preview/use-sandbox-preview.ts`

---

## 1. Problem

The default preview engine (`build-fallback-html.ts`, ~1,200 lines) turns a project's
source files into a runnable preview by **rewriting module syntax with regular
expressions** and compiling each file with Babel‑in‑the‑browser, then wiring files
together through a hand‑rolled `window.__M` require/define registry and per‑file
`eval` IIFEs.

This works for the common case but is structurally fragile. Every import/export
shape needs its own regex, and any shape we miss — or any interaction between
shapes — becomes a hard `SyntaxError` that blanks the entire preview. Bugs already
hit in production this session:

- **JSX silently disabled** — Babel `preset-typescript` with `ignoreExtensions:true`
  parsed `<div>` as a comparison ("Unexpected token"). Broke ~every component.
- **Duplicate module declaration** — `const __mod_x = …` emitted twice when a file
  imported the same module path twice → `Identifier '__mod_x' has already been declared`.
- Latent: two imports of the same symbol name; asset imports resolving to `undefined`.

These are *symptoms of the approach*, not isolated defects. A regex transpiler is
inherently whack‑a‑mole: real bundlers exist precisely because module graphs,
TS/JSX syntax, and resolution are too complex for pattern matching.

## 2. Goal

Replace the regex rewriting + per‑file Babel + custom registry with a **real
bundler that does proper module resolution, TS/TSX transform, and tree‑shaking**,
producing a single executable bundle for the preview iframe. Eliminate the entire
class of "preview won't compile" bugs.

Non‑goals: changing the WebContainer engine or the E2B sandbox engine (those stay
as higher‑fidelity options); changing the visual‑edit bridge.

## 3. Options

| Option | Where it runs | Pros | Cons |
|---|---|---|---|
| **A. esbuild‑wasm in the browser** | Preview parent (client) | No server cost; fast (10–50ms); true ESM/TSX/JSX resolution; one bundle, no registry | ~2.5MB wasm (cached after first load); virtual FS plugin needed |
| B. esbuild on the server/sandbox | Node route per build | Full esbuild; simplest plugin model | Server CPU per preview; latency + cold start; infra cost |
| C. WebContainer only | Browser (SW) | Real Vite, highest fidelity | Heavy, cross‑origin, slower boot; already the secondary engine |

**Recommendation: Option A (esbuild‑wasm in the browser).** It removes the regex
layer entirely, keeps previews instant and server‑free, and slots in beside the
existing engines via `resolve-preview-engine.ts`.

## 4. Design (Option A)

### 4.1 Virtual file system + resolver
Feed esbuild an in‑memory plugin backed by the project's `project_files`:
- `onResolve`: resolve relative imports (`./`, `../`) against the importer's path,
  trying extensions `.tsx/.ts/.jsx/.js` and `/index.*`. Map bare specifiers
  (`react`, `react-dom`, `clsx`, …) to a small **shims map** served from the CDN
  import‑map we already rely on, or mark them `external` and provide via global.
- `onLoad`: return the file content with the right `loader` (`tsx`/`ts`/`css`/…).

### 4.2 Build call
```ts
const result = await esbuild.build({
  entryPoints: [mainFile],            // src/main.tsx or src/App.tsx
  bundle: true,
  format: "iife",
  jsx: "automatic",                   // or "transform" w/ classic runtime
  loader: { ".css": "text", ".png": "dataurl", ".svg": "dataurl" },
  plugins: [virtualFsPlugin(files), cdnExternalsPlugin()],
  write: false,
  sourcemap: "inline",
});
const code = result.outputFiles[0].text;
```
The single `code` string replaces the entire `wrapFile` loop, the `__M` registry,
the regex rewriting, and the per‑file `eval`. Inject it as one `<script>` in the
preview `srcdoc`.

### 4.3 Assets & CSS
- `.css` → collect and inject into a `<style>` (or keep Tailwind runtime as today).
- Images (`.png/.jpg/.svg`) → `dataurl` loader so `import logo from './logo.png'`
  actually resolves (fixes the current "asset import → undefined" gap).

### 4.4 Externals (React et al.)
Keep the existing CDN/global approach: mark `react`, `react-dom`, `react-dom/client`
external and resolve them to the globals already loaded in the preview, via an
esbuild `globalName`/`external` + a tiny banner that maps them. This preserves the
current zero‑install model.

### 4.5 Error reporting
esbuild returns structured `errors[]` with file, line, column, and message — far
better than today's opaque `eval` failures. Surface the first error in the existing
`showError` panel with the real file/line (feeds the self‑verify + auto‑fix loop
with precise diagnostics, reducing agent fix‑loops).

## 5. Rollout (safe, reversible)

1. **Add the engine behind a flag.** New `engine: "esbuild"` in
   `resolve-preview-engine.ts`, gated by `PREVIEW_ENGINE=esbuild` (env) or a
   per‑project flag. Default stays the current fallback engine.
2. **Shadow‑compare.** For a sample of builds, compile with *both* engines and log
   when esbuild succeeds where the regex engine failed (and vice‑versa). Zero user
   impact.
3. **Flip the default** once esbuild matches/beats the fallback on a corpus of real
   projects (reuse the repro harness: every project's files → expect 0 errors).
4. **Keep the regex engine as the fallback** for one or two releases; remove only
   after the new engine is proven.

Bump `PREVIEW_ENGINE_REV` on each change so editors cache‑bust.

## 6. Risks & mitigations
- **wasm size (~2.5MB):** lazy‑load esbuild‑wasm only when the esbuild engine is
  selected; cached by the browser thereafter.
- **Resolution gaps for exotic bare imports:** the externals/shims map + a clear
  esbuild error (not a blank screen) makes these visible and fixable, instead of
  silent corruption.
- **Behavioral drift vs. current engine:** the shadow‑compare phase catches
  regressions before flipping the default.

## 7. Why this is worth it
Two preview‑compiler bugs were fixed this session by hand; both were inevitable
consequences of regex transpiling. esbuild replaces ~1,200 lines of brittle
pattern‑matching with a battle‑tested bundler, gives precise error messages that
make the agent's self‑fix loop converge instead of spin, and fixes latent gaps
(asset imports, duplicate symbols, namespace edge cases) in one move.

## 8. Estimated effort
- Virtual‑FS + externals plugins: ~0.5 day
- Engine wiring + flag + error panel: ~0.5 day
- Shadow‑compare harness (reuse existing repro): ~0.5 day
- Soak + flip default: ongoing, ~1 release

_~1.5 engineering days to a flagged, shippable engine; the rest is safe rollout._
