import { appendFileSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const LOG = join(dirname(fileURLToPath(import.meta.url)), "..", "debug-799475.log");
const SESSION = "799475";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function log(payload: Record<string, unknown>) {
  const line = JSON.stringify({ sessionId: SESSION, timestamp: Date.now(), runId: "tier5", ...payload });
  appendFileSync(LOG, `${line}\n`);
  console.log(line);
}

let passed = 0;
let failed = 0;

function assert(hypothesisId: string, name: string, ok: boolean, data?: Record<string, unknown>) {
  if (ok) passed++;
  else failed++;
  log({ hypothesisId, location: "verify-tier5-gaps.ts", message: name, data: { ok, ...data } });
}

// T5-1: Most visitors dashboard tab
const browserTabs = readFileSync(join(ROOT, "components/dashboard/project-browser-tabs.tsx"), "utf8");
assert("T5-1", "visitors tab id", browserTabs.includes('"visitors"'));
assert("T5-1", "Most visitors label", browserTabs.includes("Most visitors"));
assert("T5-1", "sort by total_views", browserTabs.includes("total_views"));
assert("T5-1", "emphasizeViews prop", browserTabs.includes("emphasizeViews"));

const projectsGrid = readFileSync(join(ROOT, "components/dashboard/projects-grid.tsx"), "utf8");
assert("T5-1", "Eye icon visitor badge", projectsGrid.includes("Eye") && projectsGrid.includes("emphasizeViews"));

// T5-2: Chat date separators
const chatPanel = readFileSync(join(ROOT, "components/editor/chat-panel.tsx"), "utf8");
assert("T5-2", "formatDateSeparator helper", chatPanel.includes("formatDateSeparator"));
assert("T5-2", "sameCalendarDay helper", chatPanel.includes("sameCalendarDay"));
assert("T5-2", "date separator render", chatPanel.includes("showDateSep"));

// T5-3: HubSpot connector
const connectorWizard = readFileSync(join(ROOT, "components/editor/connector-wizard-panel.tsx"), "utf8");
assert("T5-3", "hubspot connector id", connectorWizard.includes('id: "hubspot"'));
assert("T5-3", "hubspot api client npm", connectorWizard.includes("@hubspot/api-client"));
assert("T5-3", "HUBSPOT_ACCESS_TOKEN env", connectorWizard.includes("HUBSPOT_ACCESS_TOKEN"));

// T5-4: Nested project folders
assert("T5-4", "migration 062", existsSync(join(ROOT, "supabase/migrations/062_nested_project_groups.sql")));
const migration062 = readFileSync(join(ROOT, "supabase/migrations/062_nested_project_groups.sql"), "utf8");
assert("T5-4", "parent_id column", migration062.includes("parent_id"));

const projectGroups = readFileSync(join(ROOT, "components/dashboard/project-groups.tsx"), "utf8");
assert("T5-4", "buildGroupTree helper", projectGroups.includes("buildGroupTree"));
assert("T5-4", "New subfolder action", projectGroups.includes("New subfolder"));

const groupsRoute = readFileSync(join(ROOT, "app/api/projects/groups/route.ts"), "utf8");
assert("T5-4", "parent_id in POST", groupsRoute.includes("parent_id"));

log({ location: "verify-tier5-gaps.ts", message: "summary", data: { passed, failed } });
process.exit(failed > 0 ? 1 : 0);
