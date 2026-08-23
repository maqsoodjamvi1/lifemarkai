#!/usr/bin/env node
/**
 * Codespace / local one-shot verification for polyglot editor intelligence.
 *
 * Usage:
 *   node scripts/verify-polyglot-codespace.mjs
 *
 * Optional side services (if already running):
 *   LIFEMARK_RUST_AST_URL=http://127.0.0.1:8765
 *   LIFEMARK_PYTHON_AI_URL=http://127.0.0.1:8766
 */
import { spawnSync } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

const steps = [];
function run(label, cmd, args, env = {}) {
  const r = spawnSync(cmd, args, {
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const ok = r.status === 0;
  steps.push({ label, ok, code: r.status });
  if (!ok) {
    console.error(`FAIL ${label}`);
    if (r.stdout) console.error(r.stdout.slice(-1500));
    if (r.stderr) console.error(r.stderr.slice(-1500));
  } else {
    console.log(`PASS ${label}`);
  }
  return ok;
}

console.log("=== LifemarkAI polyglot + preview codespace verify ===\n");

let ok = true;
ok = run("polyglot-bridge unit", "node", ["--import", "tsx", "--test", "src/lib/intelligence/polyglot-bridge.test.ts"]) && ok;
ok = run("schema unit", "node", ["--import", "tsx", "--test", "src/lib/preview/lifemark-schema.test.ts"]) && ok;
ok = run("sdk-runtime unit", "node", ["--import", "tsx", "--test", "src/lib/preview/lifemark-sdk-runtime.test.ts"]) && ok;
ok = run("preview smoke ≥50", "node", ["--experimental-strip-types", "scripts/smoke-preview-50.mjs"]) && ok;

// Optional live side services
const rust = process.env.LIFEMARK_RUST_AST_URL;
const py = process.env.LIFEMARK_PYTHON_AI_URL;
if (rust || py) {
  console.log("\n--- live polyglot services ---");
  if (rust) {
    try {
      const h = await fetch(`${rust.replace(/\/$/, "")}/health`);
      console.log(h.ok ? "PASS rust health" : `FAIL rust health ${h.status}`);
      ok = ok && h.ok;
    } catch (e) {
      console.log("FAIL rust health", e.message);
      ok = false;
    }
  }
  if (py) {
    try {
      const h = await fetch(`${py.replace(/\/$/, "")}/health`);
      console.log(h.ok ? "PASS python health" : `FAIL python health ${h.status}`);
      ok = ok && h.ok;
    } catch (e) {
      console.log("FAIL python health", e.message);
      ok = false;
    }
  }
} else {
  console.log("\n(side services unset — offline LLM-only path; set LIFEMARK_*_URL to probe live)");
}

console.log("\n=== summary ===");
for (const s of steps) console.log(`${s.ok ? "PASS" : "FAIL"} ${s.label}`);
console.log(ok ? "\nGATE: PASS" : "\nGATE: FAIL");
process.exit(ok ? 0 : 1);
