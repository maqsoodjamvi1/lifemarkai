/**
 * Prebundle lib/ai/http/{fix,chat,agent} for the AI worker.
 * esbuild strips `import type` so heavy graphs stay out of the worker heap.
 */
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const esbuild = require("esbuild");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const startAppRoot = path.resolve(__dirname, "..");
// PHASE 2: sources are now LOCAL (src/lib/ai/http/*) — the main repo is no longer read.
const srcDir = path.join(startAppRoot, "src");
const shimDir = path.join(startAppRoot, "src/lib/next-shims");
const outdir = path.join(startAppRoot, ".tmp/ai-http");

fs.mkdirSync(outdir, { recursive: true });

const entries = ["fix", "chat", "agent"];

await esbuild.build({
  entryPoints: Object.fromEntries(
    entries.map((name) => [name, path.join(srcDir, "lib/ai/http", `${name}.ts`)]),
  ),
  bundle: true,
  platform: "node",
  format: "esm",
  outdir,
  outExtension: { ".js": ".mjs" },
  packages: "external",
  target: "node20",
  logLevel: "info",
  splitting: false,
  alias: {
    "@": srcDir,
    "server-only": path.join(shimDir, "server-only.ts"),
    "client-only": path.join(shimDir, "server-only.ts"),
    "next/server": path.join(shimDir, "server.ts"),
    "next/headers": path.join(shimDir, "headers.ts"),
  },
  // The worker runs in plain Node — `import.meta.env` is undefined there, and
  // supabase/server.ts reads import.meta.env.VITE_SUPABASE_URL at module top
  // level, which crashed the whole worker on load ("Cannot read properties of
  // undefined"). Rewrite every `import.meta.env` to a process.env-backed global.
  define: {
    "import.meta.env": "globalThis.__LM_IME__",
  },
  banner: {
    js: 'globalThis.__LM_IME__ ??= process.env;globalThis.__lifemark_request_als_store__ ??= undefined;',
  },
});

console.log("[build-ai-http] wrote", outdir);
