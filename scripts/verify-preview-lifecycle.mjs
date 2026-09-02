/**
 * Preview lifecycle contract — measurable, not "feels like Lovable".
 *
 * Runs unit tests for:
 *   boot / ready / paused / resume plan (one cold boot cap)
 *   wait notBeforeMs (no leftover iframe)
 *   product engine never srcdoc/webcontainer
 *
 * Live soak (Docker reclaim → paused → resume) is ops: see docs/DEPLOY_COOLIFY.md
 * definition of done. This script does not kill containers.
 */
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname,join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

const files = [
  "src/lib/preview/sandbox-lifecycle.test.ts",
  "src/lib/preview/wait-for-preview-success.test.ts",
  "src/components/editor/use-preview-engine-policy.test.ts",
  "src/lib/preview/preview-slo.test.ts",
];

const child = spawn(
  process.execPath,
  ["--import", "tsx", "--test", ...files],
  { cwd: root, stdio: "inherit", env: process.env },
);

child.on("exit", (code) => {
  if (code === 0) {
    console.log(
      "[verify-preview-lifecycle] contract tests passed: lifecycle, notBefore, sandbox-only engine, SLO ring.",
    );
  }
  process.exit(code ?? 1);
});
