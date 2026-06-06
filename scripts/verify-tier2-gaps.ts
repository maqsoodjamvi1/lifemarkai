import { appendFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import {
  parseCloudToolPermissions,
  canAutoRunCloudTool,
  isCloudToolBlocked,
  needsCloudToolConfirmation,
  DEFAULT_CLOUD_TOOL_PERMISSIONS,
  buildCloudPermissionsPromptBlock,
  inferCloudToolFromPrompt,
  shouldBlockCloudAction,
  requiresCloudConfirmation,
} from "../lib/cloud/permissions";
import {
  isSemrushConfigured,
  formatSemrushContext,
} from "../lib/integrations/semrush";
import { getTemplateById, BUILT_IN_TEMPLATES } from "../lib/templates/built-in";

const LOG = join(dirname(fileURLToPath(import.meta.url)), "..", "debug-799475.log");
const SESSION = "799475";

function log(payload: Record<string, unknown>) {
  const line = JSON.stringify({ sessionId: SESSION, timestamp: Date.now(), runId: "tier2", ...payload });
  appendFileSync(LOG, `${line}\n`);
  console.log(line);
}

let passed = 0;
let failed = 0;

function assert(hypothesisId: string, name: string, ok: boolean, data?: Record<string, unknown>) {
  if (ok) passed++;
  else failed++;
  log({ hypothesisId, location: "verify-tier2-gaps.ts", message: name, data: { ok, ...data } });
}

// T2-1: Semrush module exports and context formatting
assert("T2-1", "semrush isSemrushConfigured is boolean", typeof isSemrushConfigured() === "boolean");
const ctx = formatSemrushContext({
  keyword: { keyword: "saas", searchVolume: 12000, cpc: 4.5, competition: 0.6, results: 1000000 },
  related: [{ keyword: "saas platform", searchVolume: 8000, cpc: 3.2, competition: 0.5 }],
});
assert("T2-1", "formatSemrushContext includes keyword", ctx.includes("saas") && ctx.includes("12,000"));

// T2-2: Cloud tool permissions
const perms = parseCloudToolPermissions({ database: "allow", secrets: "never" });
assert("T2-2", "parseCloudToolPermissions merges defaults", perms.database === "allow" && perms.storage === "ask");
assert("T2-2", "canAutoRunCloudTool allow", canAutoRunCloudTool("database", perms));
assert("T2-2", "isCloudToolBlocked never", isCloudToolBlocked("secrets", perms));
assert("T2-2", "needsCloudToolConfirmation ask", needsCloudToolConfirmation("storage", DEFAULT_CLOUD_TOOL_PERMISSIONS));

// T2-3: Shopify starter template
const shopify = getTemplateById("shopify-storefront");
assert("T2-3", "shopify template exists", !!shopify);
assert("T2-3", "shopify template has app file", !!shopify?.files.find((f) => f.path === "src/App.tsx"));
assert("T2-3", "shopify template tagged", shopify?.tags.includes("shopify") ?? false);
assert("T2-3", "shopify in BUILT_IN_TEMPLATES", BUILT_IN_TEMPLATES.some((t) => t.id === "shopify-storefront"));

// T2-4: API route files exist (static check)
import { existsSync } from "fs";
const semrushRoute = join(dirname(fileURLToPath(import.meta.url)), "..", "app/api/integrations/semrush/route.ts");
const cloudPermRoute = join(dirname(fileURLToPath(import.meta.url)), "..", "app/api/cloud/permissions/route.ts");
assert("T2-4", "semrush API route file", existsSync(semrushRoute));
assert("T2-4", "cloud permissions API route file", existsSync(cloudPermRoute));

const promptBlock = buildCloudPermissionsPromptBlock(
  { ...DEFAULT_CLOUD_TOOL_PERMISSIONS, secrets: "never" },
  true,
);
assert("T2-5", "cloud permissions prompt block", promptBlock.includes("Secrets") && promptBlock.includes("never"));
assert("T2-5", "inferCloudToolFromPrompt deploy", inferCloudToolFromPrompt("deploy to production") === "deploy");
assert("T2-5", "shouldBlockCloudAction never", shouldBlockCloudAction("add a secret env var", { ...DEFAULT_CLOUD_TOOL_PERMISSIONS, secrets: "never" }).blocked);
assert("T2-5", "requiresCloudConfirmation ask", requiresCloudConfirmation("run a migration", DEFAULT_CLOUD_TOOL_PERMISSIONS).required);

log({ location: "verify-tier2-gaps.ts", message: "summary", data: { passed, failed } });
process.exit(failed > 0 ? 1 : 0);
