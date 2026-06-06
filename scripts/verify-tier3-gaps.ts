import { appendFileSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { DOC_PAGES, getDocBySlug } from "../lib/docs/content";
import { BUILT_IN_TEMPLATES } from "../lib/templates/built-in";

const LOG = join(dirname(fileURLToPath(import.meta.url)), "..", "debug-799475.log");
const SESSION = "799475";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function log(payload: Record<string, unknown>) {
  const line = JSON.stringify({ sessionId: SESSION, timestamp: Date.now(), runId: "tier3", ...payload });
  appendFileSync(LOG, `${line}\n`);
  console.log(line);
}

let passed = 0;
let failed = 0;

function assert(hypothesisId: string, name: string, ok: boolean, data?: Record<string, unknown>) {
  if (ok) passed++;
  else failed++;
  log({ hypothesisId, location: "verify-tier3-gaps.ts", message: name, data: { ok, ...data } });
}

// T3-1: Public docs site
assert("T3-1", "docs pages defined", DOC_PAGES.length >= 6);
assert("T3-1", "getting-started doc", !!getDocBySlug("getting-started"));
assert("T3-1", "mcp-server doc", !!getDocBySlug("mcp-server"));
assert("T3-1", "native-apps doc", !!getDocBySlug("native-apps"));
assert("T3-1", "docs route files", existsSync(join(ROOT, "app/(marketing)/docs/page.tsx")));
assert("T3-1", "docs slug route", existsSync(join(ROOT, "app/(marketing)/docs/[slug]/page.tsx")));

// T3-2: Native distribution panel
assert("T3-2", "native panel file", existsSync(join(ROOT, "components/editor/native-distribution-panel.tsx")));

// T3-3: MCP tools expanded
const mcpSource = readFileSync(join(ROOT, "app/api/mcp/route.ts"), "utf8");
assert("T3-3", "mcp deploy_project tool", mcpSource.includes("deploy_project"));
assert("T3-3", "mcp get_deploy_status tool", mcpSource.includes("get_deploy_status"));
assert("T3-3", "mcp list_templates tool", mcpSource.includes("list_templates"));
assert("T3-3", "mcp server v1.1", mcpSource.includes('"1.1.0"'));

// T3-4: Templates still available for MCP
assert("T3-4", "templates for mcp", BUILT_IN_TEMPLATES.length >= 20);

log({ location: "verify-tier3-gaps.ts", message: "summary", data: { passed, failed } });
process.exit(failed > 0 ? 1 : 0);
