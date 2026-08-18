/**
 * Sandbox provider benchmark — Phase 7 of the Vercel adoption plan.
 *
 * Runs the same scenario list against each requested provider through the
 * app's own /api/projects/:id/sandbox-preview boot path measurements are NOT
 * taken through (that would measure the app), but through the provider
 * abstraction directly via a small driver process on the server where the
 * providers' credentials live.
 *
 * This script is the HARNESS + REPORT format; it must run on the VPS (or any
 * host with MODAL and VERCEL credentials) — not in CI, which has neither.
 *
 * Usage:
 *   node scripts/benchmark-sandbox-providers.mjs --providers=modal,vercel --runs=3
 *
 * Output: one JSON line per (provider, scenario, run) with the plan's
 * measurements, then a summary table. Feed the JSON to the comparison doc.
 */
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: {
    providers: { type: "string", default: "modal" },
    runs: { type: "string", default: "3" },
    scenario: { type: "string", default: "vite-react" },
  },
});

const SCENARIOS = {
  // Simple Vite React application — the bread-and-butter preview.
  "vite-react": () => ({
    files: [
      { path: "package.json", content: JSON.stringify({
        name: "bench-vite", private: true, type: "module",
        scripts: { dev: "vite --host 0.0.0.0 --port 3000" },
        dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
        devDependencies: { vite: "^5.4.0", "@vitejs/plugin-react": "^4.3.0" },
      }, null, 2) },
      { path: "vite.config.js", content: "import react from '@vitejs/plugin-react';export default {plugins:[react()]};" },
      { path: "index.html", content: "<!doctype html><div id=root></div><script type=module src=/src/main.jsx></script>" },
      { path: "src/main.jsx", content: "import {createRoot} from 'react-dom/client';createRoot(document.getElementById('root')).render(<h1>bench</h1>);" },
    ],
  }),
  // Ten-file incremental push onto a warm sandbox (file update latency).
  "ten-file-push": () => ({
    files: Array.from({ length: 10 }, (_, i) => ({
      path: `src/gen/file${i}.js`,
      content: `export const v${i} = ${Math.random()};`,
    })),
    incremental: true,
  }),
  // Dependency installation failure (error surfacing quality).
  "install-failure": () => ({
    files: [
      { path: "package.json", content: JSON.stringify({
        name: "bench-broken", private: true,
        scripts: { dev: "node server.js" },
        dependencies: { "this-package-does-not-exist-lifemark-bench": "^99.0.0" },
      }) },
      { path: "server.js", content: "require('http').createServer((q,s)=>s.end('ok')).listen(3000)" },
    ],
    expectFailure: true,
  }),
};

async function loadProviders(names) {
  // tsx is required because the providers are TS. Run via: node --import tsx
  const { ModalSandboxProvider } = await import("../src/lib/sandbox/modal.ts");
  const { VercelSandboxProvider } = await import("../src/lib/sandbox/vercel.ts");
  const registry = {
    modal: new ModalSandboxProvider(),
    vercel: new VercelSandboxProvider(),
  };
  return names.map((name) => {
    const provider = registry[name];
    if (!provider) throw new Error(`unknown provider ${name}`);
    if (!provider.isEnabled()) throw new Error(`${name} is not configured/enabled on this host`);
    return provider;
  });
}

const providers = await loadProviders(values.providers.split(",").map((s) => s.trim()).filter(Boolean));
const runs = Math.max(1, parseInt(values.runs, 10) || 1);
const scenario = SCENARIOS[values.scenario];
if (!scenario) throw new Error(`unknown scenario ${values.scenario} (have: ${Object.keys(SCENARIOS).join(", ")})`);

const results = [];
for (const provider of providers) {
  for (let run = 0; run < runs; run++) {
    const spec = scenario();
    const startedAt = Date.now();
    let record = { provider: provider.id, scenario: values.scenario, run };
    try {
      const boot = await provider.runProject({ files: spec.files, port: 3000, timeoutMs: 5 * 60_000 });
      record.coldStartMs = Date.now() - startedAt;
      record.ok = boot.ok;
      record.ready = boot.ready !== false;
      record.error = boot.error ?? null;

      if (boot.ok && boot.sandboxId) {
        if (spec.incremental) {
          const t = Date.now();
          await provider.writeFiles(boot.sandboxId, spec.files);
          record.fileUpdateMs = Date.now() - t;
        }
        if (boot.previewUrl) {
          const t = Date.now();
          const res = await fetch(boot.previewUrl, { signal: AbortSignal.timeout(30_000) }).catch(() => null);
          record.httpFirstByteMs = res ? Date.now() - t : null;
          record.httpStatus = res?.status ?? null;
        }
        const t = Date.now();
        const reconnect = await provider.reconnect(boot.sandboxId, 3000);
        record.reconnectMs = Date.now() - t;
        record.reconnectOk = reconnect.ok;
        await provider.kill(boot.sandboxId).catch(() => {});
        record.cleanedUp = true;
      }
      if (spec.expectFailure) record.failedAsExpected = !boot.ok || boot.ready === false;
    } catch (err) {
      record.ok = false;
      record.error = err instanceof Error ? err.message : String(err);
    }
    results.push(record);
    console.log(JSON.stringify(record));
  }
}

// Summary
for (const provider of providers) {
  const mine = results.filter((r) => r.provider === provider.id && r.ok);
  const median = (key) => {
    const vals = mine.map((r) => r[key]).filter((v) => typeof v === "number").sort((a, b) => a - b);
    return vals.length ? vals[Math.floor(vals.length / 2)] : null;
  };
  console.log(`\n${provider.id}: ${mine.length}/${results.filter((r) => r.provider === provider.id).length} ok  ` +
    `coldStart p50=${median("coldStartMs")}ms  reconnect p50=${median("reconnectMs")}ms  firstByte p50=${median("httpFirstByteMs")}ms`);
}
