import { appendFileSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { buildLifemarkDeployUrl, isBrandedDeployActive } from "../lib/deploy/branded-deploy-url";

const LOG = join(dirname(fileURLToPath(import.meta.url)), "..", "debug-799475.log");
const SESSION = "799475";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function log(payload: Record<string, unknown>) {
  const line = JSON.stringify({ sessionId: SESSION, timestamp: Date.now(), runId: "tier7", ...payload });
  appendFileSync(LOG, `${line}\n`);
  console.log(line);
}

let passed = 0;
let failed = 0;

function assert(hypothesisId: string, name: string, ok: boolean, data?: Record<string, unknown>) {
  if (ok) passed++;
  else failed++;
  log({ hypothesisId, location: "verify-tier7-gaps.ts", message: name, data: { ok, ...data } });
}

// T7-1: Branded deploy URL helper + worker/route wiring
assert("T7-1", "branded-deploy-url module", existsSync(join(ROOT, "lib/deploy/branded-deploy-url.ts")));

const branded = buildLifemarkDeployUrl({
  projectName: "My App",
  projectId: "abc123456789",
  brandedSubdomain: "acme",
  brandedStatus: "active",
});
assert("T7-1", "branded URL pattern", branded === "https://my-app.acme.lifemarkai.app", { branded });

const defaultUrl = buildLifemarkDeployUrl({
  projectName: "My App",
  projectId: "abc123456789",
});
assert("T7-1", "default URL pattern", defaultUrl === "https://my-app-abc12345.lifemarkai.app", { defaultUrl });

assert(
  "T7-1",
  "isBrandedDeployActive",
  isBrandedDeployActive({ projectName: "x", projectId: "y", brandedSubdomain: "acme", brandedStatus: "active" }),
);

const deployRoute = readFileSync(join(ROOT, "app/api/deploy/route.ts"), "utf8");
assert("T7-1", "deploy route uses helper", deployRoute.includes("buildLifemarkDeployUrl"));
assert("T7-1", "deploy route fetches branding", deployRoute.includes("branded_subdomain"));

const deployWorker = readFileSync(join(ROOT, "lib/queue/deploy-worker.ts"), "utf8");
assert("T7-1", "deploy worker uses helper", deployWorker.includes("buildLifemarkDeployUrl"));

// T7-2: Clarify-first toggle in chat composer
const chatPanel = readFileSync(join(ROOT, "components/editor/chat-panel.tsx"), "utf8");
assert("T7-2", "clarify toggle button", chatPanel.includes("setClarifyFirst"));
assert("T7-2", "Clarify label", chatPanel.includes(">Clarify<") || chatPanel.includes("Clarify\n"));

// T7-3: Microsoft 365 connector
const connectorWizard = readFileSync(join(ROOT, "components/editor/connector-wizard-panel.tsx"), "utf8");
assert("T7-3", "microsoft_365 connector", connectorWizard.includes('id: "microsoft_365"'));
assert("T7-3", "MS_CLIENT_ID env", connectorWizard.includes("MS_CLIENT_ID"));

// T7-4: Custom MCP URL install
const mcpPanel = readFileSync(join(ROOT, "components/editor/mcp-panel.tsx"), "utf8");
assert("T7-4", "custom mcp url state", mcpPanel.includes("customMcpUrls"));
assert("T7-4", "remote command", mcpPanel.includes('command: "remote"'));
assert("T7-4", "MCP server URL input", mcpPanel.includes("MCP server URL"));

log({ location: "verify-tier7-gaps.ts", message: "summary", data: { passed, failed } });
process.exit(failed > 0 ? 1 : 0);
