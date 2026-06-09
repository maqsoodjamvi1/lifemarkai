/**
 * Runtime verification for preview engine resolution (WebContainers vs fallback).
 */
import { appendFileSync } from "fs";
import {
  shouldUseWebContainer,
  resolvePreviewEngine,
} from "../lib/preview/resolve-preview-engine";

const LOG = "debug-83daa0.log";

function log(message: string, data: Record<string, unknown>, hypothesisId: string) {
  const entry = {
    sessionId: "83daa0",
    timestamp: Date.now(),
    runId: "preview-engine-verify",
    location: "verify-preview-engine.ts",
    message,
    data,
    hypothesisId,
  };
  appendFileSync(LOG, JSON.stringify(entry) + "\n");
  console.log(JSON.stringify(entry));
}

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, hypothesisId: string, detail?: unknown) {
  log(name, { ok, detail }, hypothesisId);
  if (ok) passed++;
  else failed++;
}

const viteProject = [
  { path: "package.json" },
  { path: "vite.config.ts" },
  { path: "src/main.tsx" },
  { path: "src/App.tsx" },
];

const staticProject = [{ path: "index.html" }];

check("vite project eligible", shouldUseWebContainer(viteProject), "H7");
check("static html not eligible", !shouldUseWebContainer(staticProject), "H7");

check(
  "isolated + vite → webcontainer",
  resolvePreviewEngine(viteProject, { crossOriginIsolated: true }) === "webcontainer",
  "H7",
);
check(
  "not isolated → fallback",
  resolvePreviewEngine(viteProject, { crossOriginIsolated: false }) === "fallback",
  "H7",
);
check(
  "useWebContainers false → fallback",
  resolvePreviewEngine(viteProject, { crossOriginIsolated: true, preferWebContainers: false }) === "fallback",
  "H7",
);

log("summary", { passed, failed, total: passed + failed }, "H7");
process.exit(failed > 0 ? 1 : 0);
