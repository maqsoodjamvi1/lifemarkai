/**
 * Verifies Lovable chat UX parity helpers + live chat SSE smoke test.
 * Writes NDJSON to debug-799475.log (session 799475).
 */
import { appendFileSync, readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { classifyBuildIntent } from "../lib/ai/build-intent";
import { getSmartPlaceholder } from "../lib/ai/editor-intelligence";

const LOG = "debug-799475.log";
const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const DEMO_EMAIL = "demo@lifemarkai.app";
const DEMO_PASSWORD = "DemoPassword123!";

function log(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
) {
  const entry = {
    sessionId: "799475",
    timestamp: Date.now(),
    location,
    message,
    data,
    hypothesisId,
    runId: "chat-parity-verify",
  };
  appendFileSync(LOG, JSON.stringify(entry) + "\n");
  console.log(JSON.stringify(entry));
}

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, hypothesisId: string, detail?: unknown) {
  log("verify-chat-parity.ts", name, { ok, detail }, hypothesisId);
  if (ok) passed++;
  else failed++;
}

async function liveChatSmoke() {
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
  const { data: auth, error } = await sb.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (error || !auth.session) {
    check("demo sign-in for chat", false, "H2", { error: error?.message });
    return;
  }
  check("demo sign-in for chat", true, "H2", {});

  const demoRes = await fetch(`${BASE}/api/demo/create-sample-project`);
  const demo = demoRes.ok ? await demoRes.json() : null;
  const projectId = demo?.projectId ?? "fb18d6f5-400f-4b7c-ba75-737ca94ddcf9";

  const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL).hostname.split(".")[0];
  const cookie = `sb-${projectRef}-auth-token=${encodeURIComponent(JSON.stringify({
    access_token: auth.session.access_token,
    refresh_token: auth.session.refresh_token,
    expires_at: auth.session.expires_at,
    expires_in: auth.session.expires_in,
    token_type: auth.session.token_type,
    user: auth.session.user,
  }))}`;

  const res = await fetch(`${BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      projectId,
      message: "Build a simple hello world page",
      mode: "build",
      model: "openai/gpt-4o-mini",
      files: [],
      history: [],
    }),
  });

  check("chat API responds", res.ok, "H2", { status: res.status });
  if (!res.ok || !res.body) return;

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let gotChunk = false;
  let gotDone = false;
  let buildIntent = false;

  const deadline = Date.now() + 180_000;
  while (Date.now() < deadline) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    if (buf.includes('"chunk"') || buf.includes("data: {")) gotChunk = true;
    if (buf.includes("build_intent")) buildIntent = true;
    if (buf.includes("[DONE]") || buf.includes('"done":true')) {
      gotDone = true;
      break;
    }
  }
  reader.cancel().catch(() => {});

  check("chat SSE streamed content", gotChunk, "H2", { bufLen: buf.length });
  check("chat SSE build_intent event", buildIntent, "H1", {});
  check("chat SSE completed", gotDone, "H2", {});
}

async function main() {
  const placeholder = getSmartPlaceholder({
    fileCount: 5,
    hasPreviewError: false,
    currentMode: "build",
    streaming: true,
    isLocked: false,
  });
  check("queue follow-up placeholder", placeholder === "queue follow-up…", "H5", { placeholder });

  const intent = classifyBuildIntent(
    "AI chat-to-app builder exactly same like lovable complete interface and work application",
  );
  check(
    "lovable builder status label",
    intent.statusLabel.includes("Lovable-inspired"),
    "H1",
    { statusLabel: intent.statusLabel },
  );

  await liveChatSmoke().catch((e) => {
    check("live chat smoke", false, "H2", { error: String(e) });
  });

  log("verify-chat-parity.ts", "summary", { passed, failed, ok: failed === 0 }, "summary");
  process.exit(failed > 0 ? 1 : 0);
}

main();
