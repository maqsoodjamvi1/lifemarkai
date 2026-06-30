/**
 * esbuild-wasm preview engine (v1 — flagged, additive).
 *
 * Replaces the regex transpiler (`build-fallback-html.ts`) with a real bundler:
 * esbuild-wasm runs IN THE BROWSER, resolves the module graph properly, and
 * transforms TS/TSX/JSX — eliminating the "preview won't compile" class of bugs
 * (JSX parse, duplicate declarations, missed import shapes, etc.).
 *
 * Architecture (see docs/preview-compiler-esbuild-plan.md):
 *   - A virtual-FS plugin serves the project's files (relative imports + entry).
 *   - An http plugin pulls bare deps (react, etc.) from esm.sh and bundles them,
 *     so there is no globals/interop guesswork.
 *   - Output is one IIFE bundle injected into a minimal iframe srcdoc.
 *
 * SAFE TO MERGE: nothing imports this yet. Wire it in `resolve-preview-engine.ts`
 * behind `PREVIEW_ENGINE=esbuild` (or a per-project flag) and shadow-compare
 * against the fallback before flipping the default. NOTE: needs a real browser to
 * run — verify in the editor once enabled; it has not been runtime-tested yet.
 */
import type { ProjectFile } from "@/types/database";
import { preparePreviewCss, projectUsesTailwind, projectUsesTailwindV4 } from "@/lib/preview/build-fallback-html";

// Pin a known esbuild-wasm version; the wasm is fetched lazily and cached by the
// browser after first use. Bump together with the package if you vendor it.
const ESBUILD_VERSION = "0.21.5";
const ESBUILD_WASM_URL = `https://unpkg.com/esbuild-wasm@${ESBUILD_VERSION}/esbuild.wasm`;
const CDN = "https://esm.sh";

type Esbuild = typeof import("esbuild-wasm");
let esbuildMod: Esbuild | null = null;
let initPromise: Promise<void> | null = null;

async function ensureEsbuild(): Promise<Esbuild> {
  if (!esbuildMod) {
    // Dynamic import so esbuild-wasm only loads when this engine is selected.
    esbuildMod = (await import(/* webpackIgnore: true */ "esbuild-wasm")) as unknown as Esbuild;
  }
  if (!initPromise) {
    initPromise = esbuildMod.initialize({ wasmURL: ESBUILD_WASM_URL, worker: true });
  }
  await initPromise;
  return esbuildMod;
}

const CODE_EXT = ["", ".tsx", ".ts", ".jsx", ".js", ".mjs", ".cjs", ".json"];
const APP_ENTRY = "__lifemark_entry.tsx";

function loaderFor(path: string): "tsx" | "ts" | "jsx" | "js" | "json" | "css" | "text" {
  if (path.endsWith(".tsx")) return "tsx";
  if (path.endsWith(".ts")) return "ts";
  if (path.endsWith(".jsx")) return "jsx";
  if (path.endsWith(".json")) return "json";
  if (path.endsWith(".css")) return "css";
  if (/\.(js|mjs|cjs)$/.test(path)) return "js";
  return "text";
}

function findProjectPath(candidate: string, byPath: Map<string, string>): string | null {
  const clean = candidate.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/^\/+/, "");
  for (const ext of CODE_EXT) {
    if (byPath.has(clean + ext)) return clean + ext;
  }
  for (const idx of ["/index.tsx", "/index.ts", "/index.jsx", "/index.js"]) {
    if (byPath.has(clean + idx)) return clean + idx;
  }
  return null;
}

/** Normalize a project path and pick the entry (main.tsx → App.tsx fallbacks). */
function pickEntry(byPath: Map<string, string>): string | null {
  for (const c of ["src/main.tsx", "src/main.jsx", "src/index.tsx", "src/index.jsx", "src/App.tsx", "src/App.jsx", "index.tsx", "App.tsx"]) {
    if (byPath.has(c)) return c;
  }
  // first .tsx/.jsx as last resort
  for (const p of byPath.keys()) if (/\.(t|j)sx$/.test(p)) return p;
  return null;
}

function resolveRelative(importer: string, spec: string, byPath: Map<string, string>): string | null {
  if (importer === APP_ENTRY) {
    return findProjectPath(spec, byPath);
  }
  const base = importer.includes("/") ? importer.slice(0, importer.lastIndexOf("/")) : "";
  const parts = (base ? base + "/" + spec : spec).split("/");
  const stack: string[] = [];
  for (const part of parts) {
    if (part === "." || part === "") continue;
    if (part === "..") stack.pop();
    else stack.push(part);
  }
  return findProjectPath(stack.join("/"), byPath);
}

function resolveProjectSpecifier(spec: string, importer: string, byPath: Map<string, string>): string | null {
  if (spec.startsWith("@/")) {
    return findProjectPath(`src/${spec.slice(2)}`, byPath) ?? findProjectPath(spec.slice(2), byPath);
  }
  if (spec.startsWith("~/")) {
    return findProjectPath(`src/${spec.slice(2)}`, byPath) ?? findProjectPath(spec.slice(2), byPath);
  }
  if (spec.startsWith("/")) {
    return findProjectPath(spec.slice(1), byPath);
  }
  if (spec.startsWith("src/") || spec.startsWith("components/") || spec.startsWith("lib/") || spec.startsWith("app/")) {
    return findProjectPath(spec, byPath) ?? findProjectPath(`src/${spec}`, byPath);
  }
  return resolveRelative(importer, spec, byPath);
}

function shouldWrapAppEntry(entry: string): boolean {
  return /(^|\/)App\.(tsx|jsx)$/.test(entry);
}

function buildAppEntry(entry: string): string {
  const importPath = entry.startsWith("/") ? `.${entry}` : `./${entry.replace(/\.(tsx|ts|jsx|js)$/, "")}`;
  return `
import * as React from "react";
import { createRoot } from "react-dom/client";
import * as AppModule from "${importPath}";

const App = AppModule.default || AppModule.App;
const root = document.getElementById("root");
if (!root) throw new Error("Preview root element was not found.");
if (!App) throw new Error("${entry} must export a default App component or named App component.");
createRoot(root).render(React.createElement(App));
`;
}

export interface EsbuildResult {
  /** Full iframe srcdoc HTML, or null when the build failed. */
  html: string | null;
  errors: string[];
}

/**
 * Bundle the project with esbuild-wasm and return iframe srcdoc HTML.
 * Returns structured errors (file:line:col) on failure — far better than the
 * opaque eval failures of the regex engine.
 */
export async function buildEsbuildHtml(files: ProjectFile[]): Promise<EsbuildResult> {
  const byPath = new Map(files.map((f) => [f.path.replace(/\\/g, "/"), f.content ?? ""]));
  const entry = pickEntry(byPath);
  if (!entry) return { html: null, errors: ["No entry file (expected src/main.tsx or src/App.tsx)."] };
  const bundleEntry = shouldWrapAppEntry(entry) ? APP_ENTRY : entry;

  let esbuild: Esbuild;
  try {
    esbuild = await ensureEsbuild();
  } catch (e) {
    return { html: null, errors: [`esbuild-wasm failed to load: ${e instanceof Error ? e.message : String(e)}`] };
  }

  const virtualFs = {
    name: "virtual-fs",
    setup(build: import("esbuild-wasm").PluginBuild) {
      // Entry + relative/project imports.
      build.onResolve({ filter: /^[./]/ }, (args) => {
        if (args.kind === "entry-point") return { path: args.path, namespace: "vfs" };
        const resolved = resolveRelative(args.importer, args.path, byPath);
        if (resolved) return { path: resolved, namespace: "vfs" };
        return { errors: [{ text: `Cannot resolve "${args.path}" from "${args.importer}"` }] };
      });
      build.onLoad({ filter: /.*/, namespace: "vfs" }, (args) => {
        if (args.path === APP_ENTRY) {
          return { contents: buildAppEntry(entry), loader: "tsx" };
        }
        const contents = byPath.get(args.path) ?? "";
        if (args.path.endsWith(".css")) {
          return { contents: "", loader: "js" }; // CSS handled separately, not bundled into JS
        }
        return { contents, loader: loaderFor(args.path) };
      });

      // Bare specifiers (react, etc.) → bundle from esm.sh — BUT the entry path
      // (e.g. "src/main.tsx") and any project path without a leading "./" still
      // belong to the virtual FS, not the CDN. Check those first.
      build.onResolve({ filter: /^[^./]/ }, (args) => {
        if (args.kind === "entry-point" || byPath.has(args.path)) {
          return { path: args.path, namespace: "vfs" };
        }
        const resolved = resolveProjectSpecifier(args.path, args.importer, byPath);
        if (resolved) return { path: resolved, namespace: "vfs" };
        return { path: new URL(`/${args.path}`, CDN).href, namespace: "http" };
      });
      // Transitive http imports (esm.sh internal URLs).
      build.onResolve({ filter: /.*/, namespace: "http" }, (args) => ({
        path: new URL(args.path, args.importer).href,
        namespace: "http",
      }));
      build.onLoad({ filter: /.*/, namespace: "http" }, async (args) => {
        const res = await fetch(args.path);
        if (!res.ok) return { errors: [{ text: `Fetch failed ${res.status}: ${args.path}` }] };
        return { contents: await res.text(), loader: "js" };
      });
    },
  };

  // Inject the project's Vite-style public env (VITE_*) from its .env so the
  // generated app's backend/auth (e.g. Supabase) actually work in the LIVE
  // preview — not only after deploy. VITE_* vars are public by design (anon key,
  // URL), so this exposes nothing secret. Closes the "preview is frontend-only" gap.
  const envText = byPath.get(".env.local") ?? byPath.get(".env") ?? "";
  const viteEnv: Record<string, string> = { MODE: "development", DEV: "true", PROD: "false", BASE_URL: "/" };
  for (const line of envText.split("\n")) {
    const m = line.match(/^\s*(VITE_[A-Z0-9_]+)\s*=\s*(.*)$/);
    if (m) viteEnv[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }

  let code = "";
  try {
    const result = await esbuild.build({
      entryPoints: [bundleEntry],
      bundle: true,
      write: false,
      format: "iife",
      jsx: "automatic",
      target: "es2020",
      platform: "browser",
      // CDN deps (React, etc.) reference these — without defines the bundle throws
      // "process is not defined" / "global is not defined" in the iframe.
      define: {
        "process.env.NODE_ENV": '"development"',
        "process.env": "{}",
        global: "globalThis",
        // Vite env shim: whole-object access + per-key access (Supabase, etc.).
        "import.meta.env": JSON.stringify(viteEnv),
        ...Object.fromEntries(
          Object.entries(viteEnv).map(([k, v]) => [`import.meta.env.${k}`, JSON.stringify(v)]),
        ),
      },
      plugins: [virtualFs],
      logLevel: "silent",
    });
    code = result.outputFiles?.[0]?.text ?? "";
  } catch (e: unknown) {
    const errs =
      (e as { errors?: { text: string; location?: { file: string; line: number; column: number } }[] }).errors;
    const msgs = errs?.length
      ? errs.map((x) => (x.location ? `${x.location.file}:${x.location.line}:${x.location.column} — ${x.text}` : x.text))
      : [e instanceof Error ? e.message : String(e)];
    return { html: null, errors: msgs };
  }

  const rawCss = files.filter((f) => f.path.endsWith(".css")).map((f) => f.content ?? "").join("\n");
  const usesV4 = projectUsesTailwindV4(files);
  const usesTw = projectUsesTailwind(files);
  const css = preparePreviewCss(rawCss, usesV4, usesTw);
  const tailwindCdn = usesTw ? '<script src="https://cdn.tailwindcss.com"></script>' : "";
  const safeCode = code.replace(/<\/script>/gi, "<\\/script>");
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8" />
${tailwindCdn}
<style>${css}</style>
</head><body><div id="root"></div>
<script>
(function(){
  function relay(type,text){try{window.parent.postMessage({source:'lifemark-preview',type:type,text:String(text)},'*');}catch(e){}}
  window.addEventListener('error',function(e){relay('error',(e.error&&e.error.message)||e.message);});
  window.addEventListener('unhandledrejection',function(e){relay('error',(e.reason&&e.reason.message)||e.reason);});
  try { ${safeCode}
    relay('success','render ok');
  } catch(err){ relay('error',(err&&err.message)||err); }
})();
</script>
</body></html>`;

  return { html, errors: [] };
}
