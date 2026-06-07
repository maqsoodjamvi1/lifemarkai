import { appendFileSync, existsSync, readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const LOG = join(dirname(fileURLToPath(import.meta.url)), "..", "debug-799475.log");
const SESSION = "799475";
const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function log(payload: Record<string, unknown>) {
  const line = JSON.stringify({ sessionId: SESSION, timestamp: Date.now(), runId: "tier6", ...payload });
  appendFileSync(LOG, `${line}\n`);
  console.log(line);
}

let passed = 0;
let failed = 0;

function assert(hypothesisId: string, name: string, ok: boolean, data?: Record<string, unknown>) {
  if (ok) passed++;
  else failed++;
  log({ hypothesisId, location: "verify-tier6-gaps.ts", message: name, data: { ok, ...data } });
}

// T6-1: Draw on attached chat images
const chatPanel = readFileSync(join(ROOT, "components/editor/chat-panel.tsx"), "utf8");
assert("T6-1", "PreviewAnnotateModal import", chatPanel.includes("PreviewAnnotateModal"));
assert("T6-1", "chatAnnotateOpen state", chatPanel.includes("chatAnnotateOpen"));
assert("T6-1", "Draw on image button", chatPanel.includes("Draw on image"));

// T6-2: Telegram settings UI
assert("T6-2", "telegram panel file", existsSync(join(ROOT, "components/dashboard/telegram-settings-panel.tsx")));
const telegramPanel = readFileSync(join(ROOT, "components/dashboard/telegram-settings-panel.tsx"), "utf8");
assert("T6-2", "telegram link API", telegramPanel.includes("/api/integrations/telegram/link"));
const settingsPage = readFileSync(join(ROOT, "components/dashboard/settings-page.tsx"), "utf8");
assert("T6-2", "integrations section", settingsPage.includes('"integrations"'));
assert("T6-2", "TelegramSettingsPanel wired", settingsPage.includes("TelegramSettingsPanel"));
assert("T6-2", "notifications panel wired", settingsPage.includes("NotificationsPanel"));
assert("T6-2", "api keys panel wired", settingsPage.includes("ApiKeysPanel"));

// T6-3: Atlassian + Inngest connectors
const connectorWizard = readFileSync(join(ROOT, "components/editor/connector-wizard-panel.tsx"), "utf8");
assert("T6-3", "atlassian connector", connectorWizard.includes('id: "atlassian"'));
assert("T6-3", "inngest connector", connectorWizard.includes('id: "inngest"'));
assert("T6-3", "ATLASSIAN_API_TOKEN env", connectorWizard.includes("ATLASSIAN_API_TOKEN"));

// T6-4: Message edit branch toast
assert("T6-4", "branch saved toast", chatPanel.includes("Branch saved"));
assert("T6-4", "history branches hint", chatPanel.includes("History → Branches"));

log({ location: "verify-tier6-gaps.ts", message: "summary", data: { passed, failed } });
process.exit(failed > 0 ? 1 : 0);
