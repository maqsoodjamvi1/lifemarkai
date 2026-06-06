import { appendFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { computeCreditCost } from "../lib/ai/credit-cost";
import { shouldUseSubagents, runSubagentInvestigation } from "../lib/ai/subagents";
import { verifyPreviewHtml, shouldRunPreviewVerify } from "../lib/ai/preview-verify";
import { buildFallbackHtml } from "../lib/preview/build-fallback-html";

const LOG = join(dirname(fileURLToPath(import.meta.url)), "..", "debug-799475.log");
const SESSION = "799475";

function log(payload: Record<string, unknown>) {
  const line = JSON.stringify({ sessionId: SESSION, timestamp: Date.now(), runId: "post-fix", ...payload });
  appendFileSync(LOG, `${line}\n`);
  console.log(line);
}

let passed = 0;
let failed = 0;

function assert(hypothesisId: string, name: string, ok: boolean, data?: Record<string, unknown>) {
  if (ok) passed++;
  else failed++;
  log({ hypothesisId, location: "verify-lovable-gaps.ts", message: name, data: { ok, ...data } });
}

assert("H1", "subagents on 12-file build", shouldUseSubagents("Build a dashboard", "build", 12));
assert("H1", "subagents on investigate prompt", shouldUseSubagents("Investigate the auth flow", "build", 3));
assert("H2", "credit cost scales with files", computeCreditCost({ mode: "build", filesGenerated: 6 }) >= 2);
assert("H2", "preview verify minimal html", verifyPreviewHtml("<html><body><div id=\"root\"></div></body></html>").ok);

const sampleFiles = [
  { path: "src/App.tsx", content: "export default function App(){return <div>Hi</div>}", language: "tsx", id: "1", project_id: "p", created_at: "", updated_at: "" },
  { path: "src/main.tsx", content: "import App from './App'", language: "tsx", id: "2", project_id: "p", created_at: "", updated_at: "" },
  { path: "index.html", content: "<html><body><div id=\"root\"></div></body></html>", language: "html", id: "3", project_id: "p", created_at: "", updated_at: "" },
];
const bundled = buildFallbackHtml(sampleFiles as any);
const bundleVerify = verifyPreviewHtml(bundled);
assert("H2", "preview verify real bundle", bundleVerify.ok, { htmlLen: bundled.length, checks: bundleVerify.checks });

assert("H3", "preview verify trigger", shouldRunPreviewVerify("Build a form and verify it works", "build"));

const inv = runSubagentInvestigation("Fix auth login flow", [
  { path: "src/pages/Login.tsx", content: "export function Login() {}" },
  { path: "src/App.tsx", content: "auth" },
]);
assert("H3", "subagent investigation returns steps", inv.steps.length > 0);

log({ location: "verify-lovable-gaps.ts", message: "summary", data: { passed, failed } });
process.exit(failed > 0 ? 1 : 0);
