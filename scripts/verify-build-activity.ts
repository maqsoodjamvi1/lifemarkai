/**
 * Runtime verification for lib/ai/build-activity.ts (Lovable build-step indicators).
 */
import { appendFileSync } from "fs";
import {
  initialBuildActivitySteps,
  applyBuildIntentLabel,
  onBuildFileProgress,
  finalizeBuildActivity,
  buildCompletedBuildActivity,
} from "../lib/ai/build-activity";

const LOG = "debug-83daa0.log";

function log(message: string, data: Record<string, unknown>, hypothesisId: string) {
  const entry = {
    sessionId: "83daa0",
    timestamp: Date.now(),
    runId: "build-activity-verify",
    location: "verify-build-activity.ts",
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

let steps = initialBuildActivitySteps(8);
check("initial read step", steps[0]?.id === "read" && steps[0]?.status === "done", "H5", steps[0]);
check("initial plan running", steps[1]?.id === "plan" && steps[1]?.status === "running", "H5", steps[1]);

steps = applyBuildIntentLabel(steps, "Building marketing website…");
check("build intent updates plan label", steps[1]?.label === "Building marketing website…", "H5", steps[1]);

steps = onBuildFileProgress(steps);
check("first file marks plan done", steps.find((s) => s.id === "plan")?.status === "done", "H5");
check("first file starts generate step", steps.some((s) => s.id === "generate" && s.status === "running"), "H5", steps);

steps = onBuildFileProgress(steps);
check("second file keeps generate running", steps.find((s) => s.id === "generate")?.status === "running", "H5");

steps = finalizeBuildActivity(steps, 2, { githubRepo: "acme/cargo-site" });
check("finalize adds saved step", steps.some((s) => s.id === "saved"), "H5");
check("finalize adds github step when linked", steps.some((s) => s.id === "github" && s.label.includes("acme/cargo-site")), "H5");

const serverSteps = buildCompletedBuildActivity(8, "Building homepage…", 2, { githubRepo: "acme/site" });
check("server buildCompletedBuildActivity has saved step", serverSteps.some((s) => s.id === "saved"), "H9", serverSteps);

log("summary", { passed, failed, total: passed + failed }, "H5");
process.exit(failed > 0 ? 1 : 0);
