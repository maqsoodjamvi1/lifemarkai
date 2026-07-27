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

const serverEntry = path.join(startAppRoot, ".output/server/index.mjs");
if (!fs.existsSync(serverEntry)) {
  console.error(`[start-production] missing ${serverEntry} — run vite build first`);
  process.exit(1);
}

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

launch("server", [serverEntry], {
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
