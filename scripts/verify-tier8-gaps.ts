import { appendFileSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { parseSqlBackup } from "../lib/backup/parse-sql-backup";

const LOG = join(dirname(fileURLToPath(import.meta.url)), "..", "debug-799475.log");
const SESSION = "799475";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function log(payload: Record<string, unknown>) {
  const line = JSON.stringify({ sessionId: SESSION, timestamp: Date.now(), runId: "tier8", ...payload });
  appendFileSync(LOG, `${line}\n`);
  console.log(line);
}

let passed = 0;
let failed = 0;

function assert(hypothesisId: string, name: string, ok: boolean, data?: Record<string, unknown>) {
  if (ok) passed++;
  else failed++;
  log({ hypothesisId, location: "verify-tier8-gaps.ts", message: name, data: { ok, ...data } });
}

// T8-1: Snowflake + BigQuery connectors
const connectorWizard = readFileSync(join(ROOT, "components/editor/connector-wizard-panel.tsx"), "utf8");
assert("T8-1", "snowflake connector", connectorWizard.includes('id: "snowflake"'));
assert("T8-1", "bigquery connector", connectorWizard.includes('id: "bigquery"'));
assert("T8-1", "SNOWFLAKE_ACCOUNT env", connectorWizard.includes("SNOWFLAKE_ACCOUNT"));
assert("T8-1", "BIGQUERY_PROJECT_ID env", connectorWizard.includes("BIGQUERY_PROJECT_ID"));

// T8-2: Brevo + Mailgun connectors
assert("T8-2", "brevo connector", connectorWizard.includes('id: "brevo"'));
assert("T8-2", "mailgun connector", connectorWizard.includes('id: "mailgun"'));
assert("T8-2", "BREVO_API_KEY env", connectorWizard.includes("BREVO_API_KEY"));

// T8-3: DB backup restore
assert("T8-3", "parse-sql-backup module", existsSync(join(ROOT, "lib/backup/parse-sql-backup.ts")));

const sampleDump = [
  "-- LifemarkAI Database Backup",
  "-- FILE: src/App.tsx",
  "-- LANGUAGE: tsx",
  "/*",
  "export default function App() { return null; }",
  "*/",
].join("\n");
const parsed = parseSqlBackup(sampleDump);
assert("T8-3", "parseSqlBackup extracts file", parsed.length === 1 && parsed[0].path === "src/App.tsx");

const dbBackupRoute = readFileSync(join(ROOT, "app/api/projects/db-backup/route.ts"), "utf8");
assert("T8-3", "restore action in API", dbBackupRoute.includes('action === "restore"'));
assert("T8-3", "parseSqlBackup in API", dbBackupRoute.includes("parseSqlBackup"));

const migrationsPanel = readFileSync(join(ROOT, "components/editor/migrations-wizard-panel.tsx"), "utf8");
assert("T8-3", "restore upload UI", migrationsPanel.includes("Restore from .sql file"));
assert("T8-3", "onFilesUpdate prop", migrationsPanel.includes("onFilesUpdate"));

// T8-4: PWA install on desktop too
const pwaPrompt = readFileSync(join(ROOT, "components/dashboard/pwa-install-prompt.tsx"), "utf8");
assert("T8-4", "no mobile-only gate", !pwaPrompt.includes("if (!isMobile) return"));
assert("T8-4", "beforeinstallprompt listener", pwaPrompt.includes("beforeinstallprompt"));

log({ location: "verify-tier8-gaps.ts", message: "summary", data: { passed, failed } });
process.exit(failed > 0 ? 1 : 0);
