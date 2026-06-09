/**
 * Verify Agent tab routing is not downgraded to build by keyword heuristics.
 * Run: npx tsx scripts/verify-agent-mode-routing.ts
 */
import { appendFileSync } from "fs";
import { resolvePromptMode } from "../lib/ai/editor-intelligence.ts";

const LOG = "debug-148b16.log";

function log(message: string, data: Record<string, unknown>, hypothesisId: string) {
  const entry = {
    sessionId: "148b16",
    timestamp: Date.now(),
    runId: "agent-mode-routing-verify",
    location: "verify-agent-mode-routing.ts",
    message,
    data,
    hypothesisId,
  };
  appendFileSync(LOG, JSON.stringify(entry) + "\n");
  console.log(JSON.stringify(entry));
}

const ctx = {
  currentMode: "agent" as const,
  fileCount: 12,
  hasPreviewError: false,
  files: [],
};

const cases: Array<{ prompt: string; expect: string }> = [
  { prompt: "Add a simple footer component", expect: "agent" },
  { prompt: "Create a dashboard for the app", expect: "agent" },
  { prompt: "Build a login page for the website", expect: "agent" },
  { prompt: "/build add footer", expect: "build" },
];

let failed = 0;
for (const { prompt, expect } of cases) {
  const got = resolvePromptMode(prompt, ctx);
  const ok = got === expect;
  if (!ok) failed++;
  log("resolvePromptMode", { prompt, expect, got, ok }, "H-AGENT-ROUTE");
}

log("summary", { passed: cases.length - failed, failed, ok: failed === 0 }, "H-AGENT-ROUTE");
process.exit(failed > 0 ? 1 : 0);
