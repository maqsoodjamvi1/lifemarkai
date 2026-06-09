/**
 * Browser verify: zero-credits preview UX via ?debugZeroCredits=1
 */
import { readFileSync, appendFileSync } from "fs";
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
    message,
    data,
    hypothesisId,
    runId: "zero-credits-verify",
  };
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
  log("verify-zero-credits", "auth failed", { error: authErr?.message }, "H4");
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

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext();
await context.addCookies([
  {
    name: cookieName,
    value: cookieValue,
    domain: "localhost",
    path: "/",
  },
]);

const page = await context.newPage();
const url = `${BASE}/editor/${PROJECT_ID}?debugZeroCredits=1`;

await page.goto(url, { waitUntil: "networkidle", timeout: 60000 });
await page.waitForTimeout(8000);

const bodyText = await page.locator("body").innerText();
const hasPreviewPaused = bodyText.includes("Preview paused");
const hasBabelError =
  bodyText.includes("SyntaxError") ||
  bodyText.includes("type ClassValue") ||
  bodyText.includes("Babel");
const hasUpgradePlaceholder = bodyText.includes("Out of credits");
const hasFixChips =
  bodyText.includes("Investigate") && bodyText.includes("Suggest 3 ways");
const creditsBadge = await page
  .locator("text=/\\d+ credits remaining/")
  .first()
  .textContent()
  .catch(() => null);

log(
  "verify-zero-credits",
  "page state",
  {
    url,
    hasPreviewPaused,
    hasBabelError,
    hasUpgradePlaceholder,
    hasFixChips,
    creditsBadge,
    bodySnippet: bodyText.slice(0, 500),
  },
  "H2",
);

const ok = hasPreviewPaused && !hasBabelError && !hasFixChips;
log("verify-zero-credits", "result", { ok }, "H2");

await browser.close();
process.exit(ok ? 0 : 1);
