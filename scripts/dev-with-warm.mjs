/**
 * Start TanStack Start and pre-warm the primary routes.
 */
import { spawn } from "node:child_process";
import http from "node:http";

const PORT = process.env.PORT || "3001";
const BASE = `http://localhost:${PORT}`;
const WARM_PATHS = [
  "/",
  "/login",
  "/api/health",
];

function fetchPath(path) {
  return new Promise((resolve) => {
    const req = http.get(`${BASE}${path}`, (res) => {
      res.resume();
      resolve(res.statusCode ?? 0);
    });
    req.setTimeout(180_000, () => {
      req.destroy();
      resolve(0);
    });
    req.on("error", () => resolve(0));
  });
}

async function warm() {
  console.log("[dev-warm] Pre-compiling routes (first run can take ~30s)…");
  console.log("[dev-warm] Do not open the browser until this finishes.");
  for (const path of WARM_PATHS) {
    const started = Date.now();
    const code = await fetchPath(path);
    const secs = ((Date.now() - started) / 1000).toFixed(1);
    console.log(`[dev-warm] ${path} → ${code || "pending"} (${secs}s)`);
  }
  console.log(`[dev-warm] Ready — open http://localhost:${PORT}`);
}

async function waitForServer() {
  for (let i = 0; i < 120; i++) {
    const code = await fetchPath("/");
    if (code > 0) {
      await warm();
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.warn("[dev-warm] server did not become ready in time");
}

// TanStack Start now runs directly from the repository root.
const child = spawn("npm", ["run", "dev"], {
  stdio: "inherit",
  env: process.env,
  cwd: process.cwd(),
  shell: true,
});

void waitForServer();

child.on("exit", (code) => process.exit(code ?? 0));
