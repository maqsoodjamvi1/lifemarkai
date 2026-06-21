import { computeCreditCost } from "../lib/ai/credit-cost";
import { shouldUseSubagents, runSubagentInvestigation } from "../lib/ai/subagents";
import { verifyPreviewHtml, shouldRunPreviewVerify } from "../lib/ai/preview-verify";
import { buildFallbackHtml } from "../lib/preview/build-fallback-html";

let passed = 0;
let failed = 0;

function assert(name: string, ok: boolean, data?: Record<string, unknown>) {
  if (ok) passed++;
  else failed++;
  console.log(JSON.stringify({ message: name, ok, ...data }));
}

assert("subagents on 12-file build", shouldUseSubagents("Build a dashboard", "build", 12));
assert("subagents on investigate prompt", shouldUseSubagents("Investigate the auth flow", "build", 3));

const sixFileCost = computeCreditCost({ mode: "build", filesGenerated: 6 });
assert("credit cost scales with files (fractional)", sixFileCost >= 1.0, { cost: sixFileCost });
assert("preview verify minimal html", verifyPreviewHtml("<html><body><div id=\"root\"></div></body></html>").ok);

const sampleFiles = [
  { path: "src/App.tsx", content: "export default function App(){return <div>Hi</div>}", language: "tsx", id: "1", project_id: "p", created_at: "", updated_at: "" },
  { path: "src/main.tsx", content: "import App from './App'", language: "tsx", id: "2", project_id: "p", created_at: "", updated_at: "" },
  { path: "index.html", content: "<html><body><div id=\"root\"></div></body></html>", language: "html", id: "3", project_id: "p", created_at: "", updated_at: "" },
];
const bundled = buildFallbackHtml(sampleFiles as any);
const bundleVerify = verifyPreviewHtml(bundled);
assert("preview verify real bundle", bundleVerify.ok, { htmlLen: bundled.length, checks: bundleVerify.checks });

assert("preview verify trigger", shouldRunPreviewVerify("Build a form and verify it works", "build"));

const inv = runSubagentInvestigation("Fix auth login flow", [
  { path: "src/pages/Login.tsx", content: "export function Login() {}" },
  { path: "src/App.tsx", content: "auth" },
]);
assert("subagent investigation returns steps", inv.steps.length > 0);

console.log(JSON.stringify({ message: "summary", passed, failed }));
process.exit(failed > 0 ? 1 : 0);
