/**
 * Runtime verification for Vite config patching (WebContainer server-ready).
 */
import { appendFileSync } from "fs";
import { patchViteConfigForWebContainer } from "../lib/preview/patch-vite-for-webcontainer";

const LOG = "debug-83daa0.log";

function log(message: string, data: Record<string, unknown>) {
  const entry = {
    sessionId: "83daa0",
    timestamp: Date.now(),
    runId: "vite-patch-verify",
    location: "verify-vite-webcontainer-patch.ts",
    message,
    data,
    hypothesisId: "H8",
  };
  appendFileSync(LOG, JSON.stringify(entry) + "\n");
  console.log(JSON.stringify(entry));
}

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  log(name, { ok, detail });
  if (ok) passed++;
  else failed++;
}

const demoConfig = `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
  },
})`;

const patched = patchViteConfigForWebContainer(demoConfig);
check("adds host:true to existing server block", /host:\s*true/.test(patched), patched);
check("adds clean react babel config", /react\(\{\s*babel:\s*\{\s*plugins:\s*\[\]\s*\}\s*\}\)/.test(patched), patched);

const already = patchViteConfigForWebContainer("export default { server: { host: true } }");
check("idempotent when host already set", already.includes("host: true"), already);

const noServer = patchViteConfigForWebContainer("export default defineConfig({ plugins: [] })");
check("adds server block when missing", /server:\s*\{\s*host:\s*true/.test(noServer), noServer);

log("summary", { passed, failed, total: passed + failed });
process.exit(failed > 0 ? 1 : 0);
