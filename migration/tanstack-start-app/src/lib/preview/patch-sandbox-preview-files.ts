import {
  patchFilesForWebContainer,
  type WebContainerPatchOpts,
} from "./patch-vite-for-webcontainer";
import { isTanStackStartProject } from "@/lib/templates/tanstack-start-scaffold";

/**
 * Synthesize missing Vite entry files. Incremental builds return only CHANGED
 * files, so a project scaffolded without index.html / src/main.tsx can gain a
 * full src/App.tsx yet never boot (observed: 4-file scaffold — package.json,
 * README, App.tsx, index.css — sandbox died with no runnable entry). Adding
 * the standard entries here makes every App-bearing project bootable without
 * touching what the AI generated.
 */
function ensureViteEntryFiles<T extends { path: string; content?: string | null }>(
  files: T[],
): T[] {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\/+/, "");
  const paths = new Set(files.map((f) => norm(f.path)));

  const appPath = [...paths].find((p) => /^src\/App\.(tsx|jsx)$/i.test(p));
  const isNext = [...paths].some(
    (p) => /^app\/.*(page|layout)\.(tsx|jsx)$/.test(p) || /^next\.config\./.test(p),
  );
  const isVue = [...paths].some((p) => /\.vue$/.test(p));
  // TanStack Start owns its entry (src/routes/__root.tsx + the Vite plugin) —
  // never inject index.html / src/main.tsx into it.
  if (!appPath || isNext || isVue || isTanStackStartProject(files)) return files;

  const hasHtml = [...paths].some((p) => /^(public\/)?index\.html$/.test(p));
  const existingMain = [...paths].find((p) =>
    /^src\/(main|index)\.(tsx|jsx|ts|js)$/.test(p),
  );
  const hasViteConfigEarly = [...paths].some((p) => /^vite\.config\.(t|j)sx?$/.test(p));

  if (hasHtml && existingMain && hasViteConfigEarly) return files;

  const isTs = appPath.toLowerCase().endsWith(".tsx");
  const mainPath = existingMain ?? (isTs ? "src/main.tsx" : "src/main.jsx");
  const extras: Array<{ path: string; content: string }> = [];

  if (!existingMain) {
    const hasCss = paths.has("src/index.css");
    extras.push({
      path: mainPath,
      content:
        `import React from "react";\n` +
        `import ReactDOM from "react-dom/client";\n` +
        `import App from "./App";\n` +
        (hasCss ? `import "./index.css";\n` : "") +
        `\n` +
        `ReactDOM.createRoot(document.getElementById("root")${isTs ? "!" : ""}).render(\n` +
        `  <React.StrictMode>\n` +
        `    <App />\n` +
        `  </React.StrictMode>,\n` +
        `);\n`,
    });
  }

  // Without a vite.config, Vite 5 blocks tunnel hostnames (allowedHosts).
  const hasViteConfig = [...paths].some((p) => /^vite\.config\.(t|j)sx?$/.test(p));
  if (!hasViteConfig) {
    extras.push({
      path: "vite.config.ts",
      content:
        `import { defineConfig } from "vite";\n\n` +
        `export default defineConfig({\n` +
        `  server: { host: true, allowedHosts: true },\n` +
        `  preview: { host: true, allowedHosts: true },\n` +
        `});\n`,
    });
  }

  if (!hasHtml) {
    extras.push({
      path: "index.html",
      content:
        `<!DOCTYPE html>\n<html lang="en">\n  <head>\n    <meta charset="UTF-8" />\n` +
        `    <meta name="viewport" content="width=device-width, initial-scale=1.0" />\n` +
        `    <title>App</title>\n  </head>\n  <body>\n    <div id="root"></div>\n` +
        `    <script type="module" src="/${mainPath}"></script>\n  </body>\n</html>\n`,
    });
  }

  // package.json repair: a scaffold without a dev script or the vite dep can
  // never `npm run dev` (observed: scripts entirely absent). Merge in the
  // minimum needed to boot without touching anything else.
  const patched = files.map((f) => {
    if (norm(f.path) !== "package.json" || f.content == null) return f;
    try {
      const pkg = JSON.parse(f.content) as {
        scripts?: Record<string, string>;
        dependencies?: Record<string, string>;
        devDependencies?: Record<string, string>;
      };
      let changed = false;
      if (!pkg.scripts?.dev) {
        pkg.scripts = { ...(pkg.scripts ?? {}), dev: "vite" };
        changed = true;
      }
      const hasVite = !!(pkg.dependencies?.vite || pkg.devDependencies?.vite);
      if (!hasVite) {
        pkg.devDependencies = {
          ...(pkg.devDependencies ?? {}),
          vite: "^5.4.0",
          "@vitejs/plugin-react": "^4.3.0",
        };
        changed = true;
      }
      return changed ? { ...f, content: JSON.stringify(pkg, null, 2) } : f;
    } catch {
      return f; // malformed package.json — leave to the error surface
    }
  });

  return [...patched, ...(extras as unknown as T[])];
}

/**
 * Guarantee a `.env` with VITE_SUPABASE_* whenever the app imports
 * @supabase/supabase-js. Without it, generated `createClient(url, key)` runs
 * with UNDEFINED env → supabase-js throws "supabaseUrl is required." at import
 * time → the whole module graph fails → React never mounts → "Preview root is
 * empty" (THE crash the user kept hitting after adding auth/database).
 *
 * If the project already ships real creds (its own .env/.env.local, or Cloud
 * auto-wire injected them), we leave them alone. Otherwise we inject a VALID-
 * LOOKING placeholder so `new URL(url)` inside supabase-js succeeds and the app
 * mounts — backend calls then fail gracefully at network time (caught by the
 * app's own error handling) instead of crashing the entire preview.
 */
function ensureSupabaseEnv<T extends { path: string; content?: string | null }>(files: T[]): T[] {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\/+/, "");
  const usesSupabase = files.some(
    (f) => f.content != null && /["']@supabase\/supabase-js["']/.test(f.content),
  );
  if (!usesSupabase) return files;

  const envFiles = files.filter((f) => /(^|\/)\.env(\.\w+)?$/.test(norm(f.path)));
  const hasRealUrl = envFiles.some(
    (f) =>
      f.content != null &&
      /^\s*VITE_SUPABASE_URL\s*=\s*\S+/m.test(f.content) &&
      !/placeholder\.supabase\.co/.test(f.content),
  );
  if (hasRealUrl) return files;

  // Deterministic, valid-format placeholders. A syntactically valid JWT-shaped
  // anon key keeps libraries that decode it happy; the URL just has to parse.
  const placeholder =
    "# Injected for preview so @supabase/supabase-js can initialize without\n" +
    "# real credentials. Backend calls will fail gracefully until Cloud is set up.\n" +
    "VITE_SUPABASE_URL=https://placeholder.supabase.co\n" +
    "VITE_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiJ9.preview\n";

  // Overwrite an existing (creds-less) .env in place; else add a fresh one.
  const existingEnv = files.find((f) => norm(f.path) === ".env");
  if (existingEnv) {
    return files.map((f) =>
      f === existingEnv
        ? ({ ...f, content: `${f.content ?? ""}\n${placeholder}` } as T)
        : f,
    );
  }
  return [...files, { path: ".env", content: placeholder } as unknown as T];
}


/**
 * Point Vite's HMR client at the tunnel instead of at localhost.
 *
 * The sandbox serves the app over HTTPS at `<hash>.preview.lifemarkai.com`, but
 * Vite's injected HMR client derives its websocket URL from `server.port` — so
 * it tries `ws://localhost:5173`, the browser refuses a plaintext websocket from
 * an HTTPS page, and every preview shows:
 *
 *     [vite] failed to connect to websocket
 *
 * The overlay reports that as an app error, which is worse than cosmetic: the
 * editor's error bridge picks it up, the preview is marked "paused", and the
 * self-repair pass starts editing the user's `vite.config.ts` to chase a
 * platform networking detail it cannot fix from inside the project.
 *
 * The fix belongs HERE, not in the scaffold. This module already rewrites files
 * on their way into the sandbox and nowhere else, so the user's own
 * vite.config.ts stays clean for local `npm run dev` and for export, while the
 * sandbox copy gets `protocol: "wss"` + `clientPort: 443`.
 */
function ensureViteTunnelHmr<T extends { path: string; content?: string | null }>(
  files: T[],
): T[] {
  const idx = files.findIndex((f) =>
    /^vite\.config\.(t|j)sx?$/.test(f.path.replace(/\\/g, "/")),
  );
  if (idx < 0) return files;
  const source = files[idx].content ?? "";
  if (!source.trim() || /clientPort/.test(source)) return files;

  const hmr = `hmr: { protocol: "wss", clientPort: 443, overlay: false },`;

  let patched: string | null = null;
  // `server: { … }` present — inject at the top of the object.
  const serverBlock = source.match(/server\s*:\s*\{/);
  if (serverBlock && serverBlock.index !== undefined) {
    const at = serverBlock.index + serverBlock[0].length;
    patched = `${source.slice(0, at)}\n    ${hmr}${source.slice(at)}`;
  } else {
    // No `server` key — add one to the top-level defineConfig object.
    const define = source.match(/defineConfig\s*\(\s*(?:\([^)]*\)\s*=>\s*)?\(?\s*\{/);
    if (define && define.index !== undefined) {
      const at = define.index + define[0].length;
      patched = `${source.slice(0, at)}\n  server: { host: true, allowedHosts: true, ${hmr} },${source.slice(at)}`;
    }
  }
  if (!patched) return files;

  const out = [...files];
  out[idx] = { ...files[idx], content: patched } as T;
  return out;
}

/**
 * Known Tailwind ecosystem plugins the model reaches for, with the pin to
 * install when it does. Anything else bare-imported by a tailwind/postcss
 * config falls back to "latest" — a slightly loose version beats a preview
 * that cannot compile CSS at all.
 */
const TAILWIND_PLUGIN_PINS: Record<string, string> = {
  "@tailwindcss/typography": "^0.5.15",
  "@tailwindcss/forms": "^0.5.9",
  "@tailwindcss/aspect-ratio": "^0.4.2",
  "@tailwindcss/container-queries": "^0.1.1",
  "tailwindcss-animate": "^1.0.7",
  daisyui: "^4.12.14",
};

const CONFIG_NODE_BUILTINS = new Set([
  "path", "fs", "url", "os", "module", "process", "node:path", "node:fs", "node:url",
]);

/**
 * Make every package a tailwind/postcss config loads actually installable.
 *
 * OBSERVED FAILURE (POS build, live): the model wrote
 * `plugins: [require("@tailwindcss/typography")]` into tailwind.config.ts but
 * never added the package to package.json. postcss then dies loading the
 * config, Vite returns 500 for EVERY stylesheet, and the preview renders a
 * blank white page with only a console error — the worst failure shape,
 * because the app code itself is fine.
 *
 * A config file is not application code: its imports are resolved by node at
 * dev-server boot, so the fix is mechanical — collect every bare-module
 * specifier the configs mention and merge the missing ones into
 * devDependencies before the sandbox's npm install runs.
 *
 * NOTE: this runs on the CONTAINER-CREATION upload path. The live push
 * (push-to-sandbox) deliberately does not re-run it — a mid-session config
 * edit that adds a brand-new package needs an npm install anyway, which only
 * happens on preview restart.
 */
function ensureTailwindPluginDeps<T extends { path: string; content?: string | null }>(
  files: T[],
): T[] {
  const norm = (p: string) => p.replace(/\\/g, "/").replace(/^\/+/, "");
  const configs = files.filter(
    (f) => /^(tailwind|postcss)\.config\.(c|m)?(t|j)s$/.test(norm(f.path)) && f.content,
  );
  if (configs.length === 0) return files;

  const rootOf = (spec: string): string =>
    spec.startsWith("@") ? spec.split("/").slice(0, 2).join("/") : spec.split("/")[0];

  const wanted = new Set<string>();
  for (const c of configs) {
    const src = c.content ?? "";
    for (const m of src.matchAll(/require\(\s*["']([^"'./][^"']*)["']\s*\)/g)) {
      wanted.add(rootOf(m[1]));
    }
    for (const m of src.matchAll(/import\s+[\w{}\s,*$]+\s+from\s+["']([^"'./][^"']*)["']/g)) {
      wanted.add(rootOf(m[1]));
    }
  }
  wanted.delete("tailwindcss");
  wanted.delete("autoprefixer");
  wanted.delete("postcss");
  for (const b of CONFIG_NODE_BUILTINS) wanted.delete(b);
  if (wanted.size === 0) return files;

  const pkgIdx = files.findIndex((f) => norm(f.path) === "package.json");
  if (pkgIdx < 0 || files[pkgIdx].content == null) return files;
  try {
    const pkg = JSON.parse(files[pkgIdx].content as string) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
    };
    const have = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const missing = [...wanted].filter((name) => !have[name]);
    if (missing.length === 0) return files;
    pkg.devDependencies = { ...(pkg.devDependencies ?? {}) };
    for (const name of missing) {
      pkg.devDependencies[name] = TAILWIND_PLUGIN_PINS[name] ?? "latest";
    }
    const out = [...files];
    out[pkgIdx] = { ...files[pkgIdx], content: `${JSON.stringify(pkg, null, 2)}\n` } as T;
    return out;
  } catch {
    return files; // malformed package.json is reported elsewhere
  }
}

/** Vite host + VEB bridge + optional guest comments for cloud sandbox previews. */
export function patchSandboxPreviewFiles<T extends { path: string; content?: string | null }>(
  files: T[],
  opts?: WebContainerPatchOpts,
): T[] {
  return patchFilesForWebContainer(
    ensureViteTunnelHmr(ensureSupabaseEnv(ensureTailwindPluginDeps(ensureViteEntryFiles(files)))),
    opts,
  );
}
