/**
 * Production supervisor — starts the TanStack Start server plus the three
 * isolated workers (API routes, sandbox/Modal, AI SSE) and restarts any child
 * that dies. Used as the container CMD; requires prebuilt bundles
 * (.tmp/api-routes, .tmp/ai-http) and the vite build output (.output).
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const startAppRoot = path.resolve(__dirname, "..");

const HOST = "127.0.0.1";
const API_PORT = Number(process.env.LIFEMARK_API_WORKER_PORT || 3011);
const SANDBOX_PORT = Number(process.env.LIFEMARK_SANDBOX_WORKER_PORT || 3012);
const AI_PORT = Number(process.env.LIFEMARK_AI_WORKER_PORT || 3010);
const SERVER_PORT = Number(process.env.PORT || 3000);

// Vite's output directory moved between TanStack Start versions: the older
// vinxi-based builds emitted `.output/`, the current `tanstackStart()` plugin
// emits `dist/`. Hard-coding either one breaks silently on the other — the
// Docker build fails at COPY with ".output: not found" even though `vite build`
// succeeded seconds earlier. Resolve instead of assuming.
// CONFIRMED from a real build artifact (docker run … ls .output/server):
//   .output/server/server.js   ← @tanstack/start-plugin-core 1.171.24 emits THIS
//   .output/server/assets/
//
// Do not "simplify" this list to one entry. Grepping the plugin source for
// filename literals is misleading — it contains "index.js" in an unrelated
// context, and trusting that over the actual artifact is precisely how this
// broke once already. The directory name also varies (dist/ vs .output/, see
// the Dockerfile), so probe rather than assume; the failure branch below prints
// every path tried, which is what made this diagnosable in seconds.
const SERVER_ENTRY_CANDIDATES = [
  ".output/server/server.js",
  ".output/server/index.js",
  ".output/server/index.mjs",
  "dist/server/server.js",
  "dist/server/index.js",
  "dist/server/index.mjs",
];
// Local and upgraded deployments can contain both layouts. Pick the newest
// artifact instead of trusting list order, otherwise a stale `.output` tree can
// silently win after a current Vite build has written `dist` (or vice versa).
const serverEntry = SERVER_ENTRY_CANDIDATES
  .map((relativePath) => {
    const absolutePath = path.join(startAppRoot, relativePath);
    return fs.existsSync(absolutePath)
      ? { absolutePath, modifiedAt: fs.statSync(absolutePath).mtimeMs }
      : null;
  })
  .filter(Boolean)
  .sort((a, b) => b.modifiedAt - a.modifiedAt)[0]?.absolutePath;
if (!serverEntry) {
  console.error(
    `[start-production] no server entry found under ${startAppRoot}.\n` +
      `Looked for:\n  ${SERVER_ENTRY_CANDIDATES.join("\n  ")}\n` +
      `Run \`vite build\` first, or check which directory it wrote to.`,
  );
  process.exit(1);
}
console.log(`[start-production] server entry: ${path.relative(startAppRoot, serverEntry)}`);

let shuttingDown = false;
const children = new Map();

function launch(name, args, env, backoffMs = 1000) {
  if (shuttingDown) return;
  const child = spawn(process.execPath, args, {
    cwd: startAppRoot,
    env: { ...process.env, ...env },
    stdio: ["ignore", "inherit", "inherit"],
  });
  children.set(name, child);
  console.log(`[start-production] ${name} pid=${child.pid}`);
  child.on("exit", (code, signal) => {
    children.delete(name);
    if (shuttingDown) return;
    console.error(
      `[start-production] ${name} exited code=${code} signal=${signal} — restarting in ${backoffMs}ms`,
    );
    setTimeout(
      () => launch(name, args, env, Math.min(backoffMs * 2, 30_000)),
      backoffMs,
    );
  });
}

// PHASE 2: api-worker + sandbox-worker launches removed — the API worker was
// retired (all routes native) and sandbox-preview is now native too.
const aiWorkerScript = path.join(startAppRoot, "scripts/ai-http-worker.mjs");

launch("ai-worker", [aiWorkerScript], {
  LIFEMARK_AI_WORKER_HOST: HOST,
  LIFEMARK_AI_WORKER_PORT: String(AI_PORT),
  LIFEMARK_AI_SKIP_REBUILD: "1",
  NODE_OPTIONS: [process.env.NODE_OPTIONS, "--max-old-space-size=8192"]
    .filter(Boolean)
    .join(" "),
});

// The build output is a fetch handler, not a listening server — running it
// directly exits 0 immediately (see scripts/serve-tanstack.mjs). Host it.
const serveScript = path.join(__dirname, "serve-tanstack.mjs");
launch("server", [serveScript, serverEntry], {
  PORT: String(SERVER_PORT),
  HOST: "0.0.0.0",
  // Server must never self-spawn workers — point clients at the sidecars.
  LIFEMARK_API_WORKER_URL: `http://${HOST}:${API_PORT}`,
  LIFEMARK_SANDBOX_WORKER_URL: `http://${HOST}:${SANDBOX_PORT}`,
  LIFEMARK_AI_WORKER_URL: `http://${HOST}:${AI_PORT}`,
});

function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`[start-production] ${signal} — stopping children`);
  for (const [name, child] of children) {
    console.log(`[start-production] kill ${name}`);
    child.kill("SIGTERM");
  }
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
