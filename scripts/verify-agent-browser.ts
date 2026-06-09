/**
 * Browser E2E: Agent tab routes to /api/ai/agent (not /api/ai/chat).
 * Run: npx tsx scripts/verify-agent-browser.ts
 */
import { appendFileSync, readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const LOG = "debug-148b16.log";
const BASE = "http://localhost:3000";

function log(message: string, data: Record<string, unknown>, hypothesisId: string) {
  const entry = {
    sessionId: "148b16",
    timestamp: Date.now(),
    runId: "agent-browser-verify",
    location: "verify-agent-browser.ts",
    message,
    data,
    hypothesisId,
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

async function main() {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: auth, error } = await sb.auth.signInWithPassword({
    email: "demo@lifemarkai.app",
    password: "DemoPassword123!",
  });
  if (error || !auth.session) {
    log("auth failed", { error: error?.message }, "H-AGENT-BROWSER");
    process.exit(1);
  }

  const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  const cookie = {
    name: `sb-${projectRef}-auth-token`,
    value: JSON.stringify({
      access_token: auth.session.access_token,
      refresh_token: auth.session.refresh_token,
      expires_at: auth.session.expires_at,
      expires_in: auth.session.expires_in,
      token_type: auth.session.token_type,
      user: auth.session.user,
    }),
    domain: "localhost",
    path: "/",
    httpOnly: false,
    secure: false,
    sameSite: "Lax" as const,
  };

  await fetch(`${BASE}/api/billing/dev-grant`, {
    method: "POST",
    headers: { Cookie: `${cookie.name}=${encodeURIComponent(cookie.value)}` },
  }).catch(() => {});

  const demoRes = await fetch(`${BASE}/api/demo/create-sample-project`);
  const projectId = demoRes.ok ? (await demoRes.json()).projectId : null;
  if (!projectId) {
    log("no project", {}, "H-AGENT-BROWSER");
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies([cookie]);
  const page = await context.newPage();

  const apiCalls: Array<{ url: string; status: number | null }> = [];
  page.on("request", (req) => {
    const url = req.url();
    if (url.includes("/api/ai/agent") || url.includes("/api/ai/chat")) {
      apiCalls.push({ url, status: null });
    }
  });
  page.on("response", (res) => {
    const url = res.url();
    const hit = apiCalls.find((c) => c.url === url && c.status === null);
    if (hit) hit.status = res.status();
  });

  await page.goto(`${BASE}/editor/${projectId}`, { waitUntil: "domcontentloaded", timeout: 120_000 });
  await page.waitForTimeout(3000);

  // Clear zero-credits simulation if active from prior dev sessions
  await page.evaluate(() => {
    sessionStorage.removeItem("lifemark-debug-zero-credits");
    sessionStorage.setItem("lifemark-debug-zero-credits-off", "1");
  });

  const agentTab = page.getByRole("button", { name: "Agent", exact: true });
  await agentTab.click({ timeout: 30_000 });

  const textarea = page.locator("textarea").first();
  await textarea.fill("List all project file paths using list_files");
  await page.getByRole("button", { name: /send/i }).click({ timeout: 10_000 }).catch(async () => {
    await textarea.press("Enter");
  });

  await page.waitForTimeout(15_000);

  const bodyText = await page.evaluate(() => document.body?.innerText ?? "");
  const agentCalled = apiCalls.some((c) => c.url.includes("/api/ai/agent"));
  const chatCalled = apiCalls.some((c) => c.url.includes("/api/ai/chat"));
  const agentStatus = apiCalls.find((c) => c.url.includes("/api/ai/agent"))?.status ?? null;
  const hasAgentUi =
    bodyText.includes("Starting agent") ||
    bodyText.includes("Thinking") ||
    bodyText.includes("Running ") ||
    bodyText.includes("Observing");

  const ok = agentCalled && !chatCalled && agentStatus === 200;
  log("browser agent flow", {
    ok,
    agentCalled,
    chatCalled,
    agentStatus,
    hasAgentUi,
    apiCalls,
    bodySnippet: bodyText.slice(0, 600),
  }, "H-AGENT-BROWSER");

  await browser.close();
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  log("fatal", { error: String(e) }, "H-AGENT-BROWSER");
  process.exit(1);
});
