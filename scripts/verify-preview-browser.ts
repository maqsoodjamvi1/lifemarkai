/**
 * Headless browser check: crossOriginIsolated + preview engine selection on /editor.
 */
import { readFileSync, appendFileSync, unlinkSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { chromium } from "playwright";

const LOG = "debug-83daa0.log";
const BASE = "http://localhost:3000";

function log(message: string, data: Record<string, unknown>, hypothesisId: string) {
  const entry = {
    sessionId: "83daa0",
    timestamp: Date.now(),
    runId: "preview-browser-verify",
    location: "verify-preview-browser.ts",
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
  const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
    email: "demo@lifemarkai.app",
    password: "DemoPassword123!",
  });
  if (authErr || !auth.session) {
    log("auth failed", { error: authErr?.message }, "H7c");
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

  let projectId: string;
  const demoRes = await fetch(`${BASE}/api/demo/create-sample-project`);
  projectId = demoRes.ok ? (await demoRes.json()).projectId : "2fc379dd-f915-4451-ba47-b9af0296a9b9";

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext();
  await context.addCookies([cookie]);
  const page = await context.newPage();

  const cspViolations: string[] = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (text.includes("Content Security Policy") || text.includes("webcontainer") || text.includes("staticblitz")) {
      cspViolations.push(text);
    }
  });

  await page.goto(`${BASE}/editor/${projectId}`, { waitUntil: "networkidle", timeout: 120_000 });

  const browserState = await page.evaluate(() => ({
    crossOriginIsolated: window.crossOriginIsolated,
    href: location.href,
    hasViteBadge: !!document.body?.innerText?.includes("Vite"),
    bodySnippet: document.body?.innerText?.slice(0, 500) ?? "",
  }));

  log("browser editor state", { projectId, ...browserState, cspViolations }, "H7c");

  // Wait for WebContainer boot attempt (up to 90s)
  await page.waitForTimeout(90_000);

  const afterBoot = await page.evaluate(() => ({
    crossOriginIsolated: window.crossOriginIsolated,
    hasViteBadge: !!document.body?.innerText?.includes("Vite"),
    hasWebContainerError: document.body?.innerText?.includes("WebContainer Error") ?? false,
    hasPreviewIframe: document.querySelectorAll("iframe").length,
    bodySnippet: document.body?.innerText?.slice(0, 800) ?? "",
  }));

  log("browser after boot wait", { projectId, ...afterBoot, cspViolations }, "H7e");

  await browser.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
