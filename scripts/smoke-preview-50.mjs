#!/usr/bin/env node
/**
 * Preview smoke suite — 50+ cases covering the editor preview path.
 * Usage: node --experimental-strip-types scripts/smoke-preview-50.mjs
 */
import { spawnSync } from "node:child_process";
import { writeFileSync, mkdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "..");
const TARGET = 50;

const TEST_FILES = [
  "src/lib/preview/normalized-error.test.ts",
  "src/lib/preview/diagnose-preview.test.ts",
  "src/lib/preview/preview-error-copy.test.ts",
  "src/lib/preview/preview-error-bridge.test.ts",
  "src/lib/preview/normalize-imports.test.ts",
  "src/lib/preview/resolve-preview-engine.test.ts",
  "src/lib/preview/preview-host.test.ts",
  "src/lib/preview/veb-bridge.test.ts",
  "src/lib/preview/ensure-toolchain.test.ts",
  "src/lib/preview/build-static-preview.test.ts",
  "src/lib/preview/patch-vite-origin-keying.test.ts",
  "src/lib/preview/lifemark-schema.test.ts",
  "src/lib/preview/lifemark-sdk-runtime.test.ts",
  "src/components/editor/preview-panel-utils.test.ts",
];

const result = spawnSync(
  process.execPath,
  ["--experimental-strip-types", "--test", "--test-reporter=spec", ...TEST_FILES],
  {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  },
);

const out = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
const passMatch = out.match(/ℹ pass (\d+)/);
const failMatch = out.match(/ℹ fail (\d+)/);
const testsMatch = out.match(/ℹ tests (\d+)/);
const passed = Number(passMatch?.[1] ?? 0);
const failed = Number(failMatch?.[1] ?? 0);
const total = Number(testsMatch?.[1] ?? 0);

const reportDir = resolve(ROOT, "tmp/smoke-reports");
mkdirSync(reportDir, { recursive: true });
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const report = {
  kind: "preview-smoke-50",
  stamp,
  target: TARGET,
  total,
  passed,
  failed,
  exitCode: result.status,
  gate: passed >= TARGET && failed === 0 ? "PASS" : "FAIL",
  files: TEST_FILES,
  tail: out.split("\n").slice(-50),
};
writeFileSync(join(reportDir, `preview-smoke-${stamp}.json`), JSON.stringify(report, null, 2));

console.log(out);
console.log("\n========== PREVIEW SMOKE GATE ==========");
console.log(`target:  ${TARGET}`);
console.log(`passed:  ${passed}`);
console.log(`failed:  ${failed}`);
console.log(`total:   ${total}`);
console.log(`gate:    ${report.gate}`);
console.log(`report:  tmp/smoke-reports/preview-smoke-${stamp}.json`);

if (failed > 0 || passed < TARGET) process.exit(1);
process.exit(0);
