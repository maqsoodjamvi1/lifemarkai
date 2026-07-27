import { defineConfig, loadEnv, type Plugin } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const rootDir = fileURLToPath(new URL(".", import.meta.url));
const srcDir = path.join(rootDir, "src");
// PHASE 2: `repoRoot` is gone — this app no longer reads the main LifemarkAI repo
// for env, module resolution, or file serving. It is fully standalone.
//
// NOTE: src/lib/next-shims is intentionally NOT aliased here (Blocker 2). It is
// still consumed by scripts/build-ai-http.mjs for the AI worker's esbuild pass
// (server-only/client-only/next/server/next/headers), which now bundles the LOCAL
// src/lib/ai/http/{fix,chat,agent}.ts for /api/ai/{chat,agent}.
// (The API worker + build-api-manifest.mjs were retired in Phase 1.)

/**
 * Load KEY=VALUE pairs from a .env file into process.env (no overwrite of existing).
 * Ensures SSR can see SUPABASE_SERVICE_ROLE_KEY, Stripe, OpenRouter, etc.
 */
function loadEnvFileIntoProcess(filePath: string) {
  if (!fs.existsSync(filePath)) return;
  const text = fs.readFileSync(filePath, "utf8");
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    if (!key || process.env[key] !== undefined) continue;
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

// PHASE 2: standalone — read ONLY this app's .env.local.
// Verified: both files carry the same 34 keys; the 3 that were repo-only
// (NEXT_PUBLIC_{APP_URL,SUPABASE_URL,SUPABASE_ANON_KEY}) exist here under their
// VITE_* names and are mapped to NEXT_PUBLIC_* below.
loadEnvFileIntoProcess(path.join(rootDir, ".env.local"));

function normalizeWinPath(p: string): string {
  // Vite treats `d:/...` and `D:/...` as different module graphs on Windows,
  // which duplicates React context (ConfirmDialogProvider vs useConfirm).
  if (process.platform === "win32" && /^[A-Za-z]:[\\/]/.test(p)) {
    return p[0].toLowerCase() + p.slice(1);
  }
  return p;
}

function resolveExisting(abs: string): string | null {
  const candidates = [
    abs,
    `${abs}.ts`,
    `${abs}.tsx`,
    `${abs}.js`,
    `${abs}.jsx`,
    path.join(abs, "index.ts"),
    path.join(abs, "index.tsx"),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c) && fs.statSync(c).isFile()) return normalizeWinPath(c);
  }
  return null;
}

/**
 * Resolve `@/` to this app's `src/`.
 *
 * PHASE 2: was `dualAtAlias` — it also resolved `@/` to the main repo root for
 * importers living there, and re-pinned relative `../../components|lib|hooks`
 * escapes to a drive-letter-normalized absolute path. Both branches are now dead:
 * the Start app owns its entire graph (0 imports escape `src/`, verified across
 * 779 files), so there is no second root to disambiguate.
 */
function atAlias(): Plugin {
  return {
    name: "lifemark-at-alias",
    enforce: "pre",
    resolveId(id) {
      if (!id.startsWith("@/")) return null;
      return resolveExisting(path.join(srcDir, id.slice(2)));
    },
  };
}

function mergeEnv(mode: string): Record<string, string> {
  // PHASE 2: this app only — no longer reads the main repo's env.
  return loadEnv(mode, rootDir, "");
}

export default defineConfig(({ mode }) => {
  // Read once here so both the `define` map and the isolation headers below
  // agree — if they ever disagree the flag appears set but the engine can't
  // boot (no SharedArrayBuffer), which is a miserable thing to debug.
  const webContainerEnabled = (() => {
    const e = loadEnv(mode, process.cwd(), "");
    const v =
      e.VITE_PREVIEW_WEBCONTAINER ||
      e.NEXT_PUBLIC_PREVIEW_WEBCONTAINER ||
      process.env.NEXT_PUBLIC_PREVIEW_WEBCONTAINER ||
      "";
    return v === "1" || v === "true";
  })();
  const env = mergeEnv(mode);
  const supabaseUrl =
    env.VITE_SUPABASE_URL ||
    env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.NEXT_PUBLIC_SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL ||
    "";
  const supabaseAnon =
    env.VITE_SUPABASE_ANON_KEY ||
    env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.VITE_SUPABASE_ANON_KEY ||
    "";
  const appUrl =
    env.VITE_APP_URL ||
    env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.VITE_APP_URL ||
    "http://localhost:3001";

  // Ensure process.env has public vars for any code that reads them at runtime.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
    process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
  }
  if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = supabaseAnon;
  }
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    process.env.NEXT_PUBLIC_APP_URL = appUrl;
  }

  return {
    server: {
      host: true,
      allowedHosts: true,
      port: 3001,
      strictPort: true,
      fs: {
        // PHASE 2: the Start app no longer serves files from the main repo.
        allow: [rootDir],
      },
      // Cross-origin isolation — required for WebContainer (SharedArrayBuffer).
      //
      // Applied ONLY when the WebContainer engine is switched on, because
      // isolation is not free: it changes how every cross-origin resource on
      // the page loads. Modal is the default engine and its preview is a
      // cross-origin iframe, so turning this on unconditionally could break the
      // primary path in order to enable a fallback — the wrong trade.
      //
      // COEP is `credentialless` rather than `require-corp` on purpose:
      // require-corp REJECTS any cross-origin resource that doesn't send a
      // CORP header (the Modal tunnel, Supabase, remote images, fonts), which
      // would break far more than it fixes. credentialless loads them without
      // credentials instead. Note it is not supported in every browser — Safari
      // in particular — so treat WebContainer as a Chromium-first fallback.
      ...(webContainerEnabled
        ? {
            headers: {
              "Cross-Origin-Opener-Policy": "same-origin",
              "Cross-Origin-Embedder-Policy": "credentialless",
            },
          }
        : {}),
      // No proxy for /api|/preview|/preview-by-slug — adapter runs handlers in-process.
    },
    resolve: {
      dedupe: ["react", "react-dom", "framer-motion", "next-themes"],
      alias: [
        // ── Next.js compatibility aliases: REMOVED (Blocker 2 closed) ──
        // The editor tree is now internal (src/components/editor) and has zero
        // next/* imports, so next/{navigation,dynamic,link,image,server,headers},
        // server-only/client-only and @lifemark/editor are no longer resolved here.
        //
        // src/lib/next-shims/* still exists ON PURPOSE: scripts/build-ai-http.mjs
        // uses it for the AI worker's esbuild pass (lib/ai/http/{fix,chat,agent}).
        // src/lib/preview/next-app-preview.ts also emits next/* shims — but those are
        // for USER-GENERATED Next apps rendered in the preview iframe, not for us.

        // Force a single graph for shared editor packages (Windows dual-drive risk).
        { find: /^framer-motion$/, replacement: path.join(rootDir, "node_modules/framer-motion") },
        { find: /^next-themes$/, replacement: path.join(rootDir, "node_modules/next-themes") },
      ],
    },
    define: {
      // RUNTIME-FIRST, BAKED-FALLBACK — do not revert to plain JSON.stringify.
      //
      // `define:` applies to the SERVER bundle too. When these were plain baked
      // strings, a Docker build without build-args froze `""` into
      // .output/server/server.js; the correct values sat in the container's
      // runtime env, but the code no longer contained any env lookup to read
      // them — SSR crash-looped with "@supabase/ssr: URL and API key required"
      // while Coolify showed the container Running. (Jul 27 outage.)
      //
      // Each key therefore expands to an expression, not a literal:
      //   server  → globalThis.process exists → real runtime env wins
      //   browser → globalThis.process undefined → baked build-time value
      // `globalThis.process?.env?.X` uses optional chaining on purpose: it is
      // NOT the `process.env.X` token sequence, so the define pass cannot
      // recursively rewrite its own replacement.
      ...Object.fromEntries(
        (
          [
            ["NEXT_PUBLIC_SUPABASE_URL", supabaseUrl],
            ["NEXT_PUBLIC_SUPABASE_ANON_KEY", supabaseAnon],
            ["NEXT_PUBLIC_APP_URL", appUrl],
            ["VITE_SUPABASE_URL", supabaseUrl],
            ["VITE_SUPABASE_ANON_KEY", supabaseAnon],
            ["VITE_APP_URL", appUrl],
          ] as const
        ).flatMap(([key, baked]) => {
          const expr = `(globalThis.process?.env?.${key} || ${JSON.stringify(baked)})`;
          return [
            [`process.env.${key}`, expr],
            // src/lib/supabase/{client,server}.ts read import.meta.env.VITE_* —
            // Vite's automatic import.meta.env replacement is build-time-only,
            // so route it through the same runtime-first expression.
            [`import.meta.env.${key}`, expr],
          ];
        }),
      ),
      // Client code reads process.env.NEXT_PUBLIC_PREVIEW_WEBCONTAINER to decide
      // whether the in-browser Vite/WebContainer preview engine is available.
      // Vite does NOT expose process.env to the browser — anything not listed in
      // this define map is simply never substituted, so the flag would read as
      // undefined and the feature would stay off no matter what .env said.
      "process.env.NEXT_PUBLIC_PREVIEW_WEBCONTAINER": JSON.stringify(
        env.VITE_PREVIEW_WEBCONTAINER ||
          env.NEXT_PUBLIC_PREVIEW_WEBCONTAINER ||
          process.env.NEXT_PUBLIC_PREVIEW_WEBCONTAINER ||
          "",
      ),
    },
    optimizeDeps: {
      include: [
        "react",
        "react-dom",
        "react-syntax-highlighter",
        "@tiptap/core",
        "@tiptap/react",
        "@tiptap/starter-kit",
        "@tiptap/pm/model",
        "@tiptap/pm/view",
      ],
      exclude: ["@tiptap/pm"],
    },
    // Externalize node_modules in SSR so importing the AI route graph does not
    // bundle the entire Modal/sandbox graph into the Vite SSR heap.
    ssr: {
      external: true,
    },
    plugins: [atAlias(), tanstackStart(), viteReact()],
  };
});

