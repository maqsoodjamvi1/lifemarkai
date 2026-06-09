/**
 * Automated zero-credits UX verify — uses system Chrome/Edge (no playwright download).
 */
import { readFileSync, appendFileSync, existsSync } from "fs";
import { chromium } from "playwright";
import { createClient } from "@supabase/supabase-js";

const LOG = ".cursor/debug-c480a3.log";
const BASE = "http://localhost:3000";
const PROJECT_ID = "fb18d6f5-400f-4b7c-ba75-737ca94ddcf9";

function log(location, message, data, hypothesisId) {
  const entry = {
    sessionId: "c480a3",
    timestamp: Date.now(),
    location,
    message: data,
    data,
    hypothesisId,
    runId: "auto-zero-credits",
  };
  // fix message field
  entry.message = message;
  appendFileSync(LOG, JSON.stringify(entry) + "\n");
  console.log(JSON.stringify(entry));
}

const env = Object.fromEntries(
  readFileSync(".env.local", "utf8")
    .split("\n")
    .filter((l) => l && !l.startsWith("#") && l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i), l.slice(i + 1)];
    }),
);

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
  email: "demo@lifemarkai.app",
  password: "DemoPassword123!",
});
if (authErr || !auth.session) {
  log("verify-browser", "auth failed", { error: authErr?.message }, "H4");
  process.exit(1);
}

const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
const cookieName = `sb-${projectRef}-auth-token`;
const cookieValue = encodeURIComponent(
  JSON.stringify({
    access_token: auth.session.access_token,
    refresh_token: auth.session.refresh_token,
    expires_at: auth.session.expires_at,
    expires_in: auth.session.expires_in,
    token_type: auth.session.token_type,
    user: auth.session.user,
  }),
);

const channels = ["msedge", "chrome"];
let browser;
for (const channel of channels) {
  try {
    browser = await chromium.launch({ channel, headless: true });
    log("verify-browser", "browser launched", { channel }, "H4");
    break;
  } catch {
    /* try next */
  }
}
if (!browser) {
  try {
    browser = await chromium.launch({ headless: true });
    log("verify-browser", "browser launched", { channel: "bundled" }, "H4");
  } catch (e) {
    log("verify-browser", "no browser", { error: String(e) }, "H4");
    process.exit(1);
  }
}

const context = await browser.newContext();
await context.addCookies([
  { name: cookieName, value: cookieValue, domain: "localhost", path: "/" },
]);

const page = await context.newPage();
await page.goto(`${BASE}/editor/${PROJECT_ID}`, { waitUntil: "domcontentloaded", timeout: 90000 });

// Enable zero-credits simulation via sessionStorage + reload
await page.evaluate(() => {
  sessionStorage.setItem("lifemark-debug-zero-credits", "1");
});
await page.reload({ waitUntil: "networkidle", timeout: 90000 });
await page.waitForTimeout(10000);

const bodyText = await page.locator("body").innerText();
const hasSimBar = bodyText.includes("Simulating 0 credits");
const hasPreviewPaused = bodyText.includes("Preview paused");
const hasBabelError =
  bodyText.includes("SyntaxError") ||
  bodyText.includes("type ClassValue") ||
  bodyText.includes("Unexpected token");
const hasFixChips =
  bodyText.includes("Investigate") && bodyText.includes("Suggest 3 ways");

log(
  "verify-browser",
  "zero-credits page state",
  {
    hasSimBar,
    hasPreviewPaused,
    hasBabelError,
    hasFixChips,
    snippet: bodyText.slice(0, 800),
  },
  "H2",
);

// Read ingest log entries written by client during page load
let ingestLogs = [];
if (existsSync(LOG)) {
  ingestLogs = readFileSync(LOG, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l))
    .filter((e) => e.runId === "credits-preview" || e.runId === "auto-zero-credits");
}

const zeroCreditLogs = ingestLogs.filter(
  (e) => e.data?.simulateZeroCredits === true || e.data?.outOfCredits === true,
);

log(
  "verify-browser",
  "ingest log summary",
  {
    totalIngest: ingestLogs.length,
    zeroCreditEntries: zeroCreditLogs.length,
    sample: zeroCreditLogs.slice(0, 3),
  },
  "H4",
);

const ok =
  !hasBabelError &&
  !hasFixChips &&
  (hasSimBar || zeroCreditLogs.some((e) => e.data?.outOfCredits === true));

log("verify-browser", "result", { ok }, "H2");
await browser.close();
process.exit(ok ? 0 : 1);
