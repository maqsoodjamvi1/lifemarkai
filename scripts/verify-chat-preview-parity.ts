/**
 * Chat + preview Lovable parity smoke — logs to debug-06409d.log
 */
import { appendFileSync, readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { resolvePromptMode, inferProjectStage } from "../lib/ai/editor-intelligence";
import { shouldOfferDesignPreviews } from "../lib/ai/design-previews";

const LOG = "debug-06409d.log";
const SESSION = "06409d";
const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function log(message: string, data: Record<string, unknown>, hypothesisId: string) {
  const entry = { sessionId: SESSION, timestamp: Date.now(), runId: "parity-smoke", message, data, hypothesisId, location: "verify-chat-preview-parity.ts" };
  appendFileSync(LOG, `${JSON.stringify(entry)}\n`);
  console.log(JSON.stringify(entry));
}

function loadEnv(): Record<string, string> {
  return Object.fromEntries(
    readFileSync(".env.local", "utf8")
      .split("\n")
      .filter((l) => l && !l.startsWith("#") && l.includes("="))
      .map((l) => {
        const i = l.indexOf("=");
        return [l.slice(0, i), l.slice(i + 1)];
      }),
  );
}

function authCookie(session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  token_type?: string;
  user: unknown;
}, supabaseUrl: string) {
  const ref = new URL(supabaseUrl).hostname.split(".")[0];
  return `sb-${ref}-auth-token=${encodeURIComponent(JSON.stringify({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at,
    expires_in: session.expires_in,
    token_type: session.token_type ?? "bearer",
    user: session.user,
  }))}`;
}

async function chatBuild(
  cookie: string,
  projectId: string,
  message: string,
  mode: string,
  deadlineMs = 120_000,
): Promise<{ done: boolean; fileCount: number; mode: string }> {
  const res = await fetch(`${BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ projectId, message, mode, files: [], history: [] }),
  });
  if (!res.ok || !res.body) throw new Error(`chat ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const start = Date.now();
  let fileCount = 0;
  let done = false;

  while (Date.now() - start < deadlineMs) {
    const { value, done: streamDone } = await reader.read();
    if (streamDone) break;
    buf += decoder.decode(value, { stream: true });
    for (const line of buf.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const evt = JSON.parse(line.slice(6).trim()) as { done?: boolean; fileCount?: number };
        if (evt.done) {
          done = true;
          fileCount = evt.fileCount ?? 0;
          reader.cancel().catch(() => {});
          return { done, fileCount, mode };
        }
      } catch { /* partial */ }
    }
  }
  reader.cancel().catch(() => {});
  return { done, fileCount, mode };
}

async function main() {
  let passed = 0;
  let failed = 0;
  const check = (name: string, ok: boolean, hypothesisId: string, data: Record<string, unknown> = {}) => {
    if (ok) passed++; else failed++;
    log(name, { ok, ...data }, hypothesisId);
  };

  // H1 — routing unit tests (no server)
  const chatCtx = { fileCount: 0, hasPreviewError: false, currentMode: "chat" as const, files: [] };
  check(
    "chat tab: build prompt stays chat",
    resolvePromptMode("Build a coffee shop landing page", chatCtx) === "chat",
    "H1",
    { got: resolvePromptMode("Build a coffee shop landing page", chatCtx) },
  );
  check(
    "chat tab: /build escapes to build",
    resolvePromptMode("/build Build a coffee shop landing page", chatCtx) === "build",
    "H1",
    { got: resolvePromptMode("/build Build a coffee shop landing page", chatCtx) },
  );

  const appFiles = [
    { path: "src/App.tsx" },
    { path: "src/pages/Home.tsx" },
    { path: "src/components/Header.tsx" },
    { path: "src/main.tsx" },
    { path: "index.html" },
    { path: "package.json" },
  ];
  const appCtx = { fileCount: 6, hasPreviewError: false, currentMode: "build" as const, files: appFiles };
  check(
    "existing app: build prompt → agent",
    resolvePromptMode("Add a pricing page to the site", appCtx) === "agent",
    "H2",
    { got: resolvePromptMode("Add a pricing page to the site", appCtx), stage: inferProjectStage(appFiles) },
  );

  check(
    "design preview: salon booking empty project",
    shouldOfferDesignPreviews("Build a salon booking website", 0),
    "H3",
  );
  check(
    "design preview: ERP skipped",
    !shouldOfferDesignPreviews("Build an ERP inventory system", 0),
    "H3",
  );

  // H4 — live API (requires dev server)
  const env = loadEnv();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
    email: "demo@lifemarkai.app",
    password: "DemoPassword123!",
  });
  if (authErr || !auth.session) {
    log("live tests skipped", { reason: authErr?.message ?? "no session" }, "H4");
    log("summary", { passed, failed, live: false }, "summary");
    process.exit(failed > 0 ? 1 : 0);
  }

  const cookie = authCookie(auth.session, env.NEXT_PUBLIC_SUPABASE_URL);

  const pr = await fetch(`${BASE}/api/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ name: `Parity chat ${Date.now()}`, framework: "react" }),
  });
  if (!pr.ok) {
    log("create project failed", { status: pr.status }, "H4");
    process.exit(1);
  }
  const project = (await pr.json()) as { id: string };

  try {
    const chatResult = await chatBuild(
      cookie,
      project.id,
      "What is React in one paragraph?",
      "chat",
      120_000,
    );
    check(
      "live: chat mode produces 0 files",
      chatResult.done && chatResult.fileCount === 0,
      "H4",
      chatResult,
    );
  } catch (e) {
    check("live: chat mode request", false, "H4", { error: String(e) });
  }

  log("summary", { passed, failed, live: true }, "summary");
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  log("fatal", { error: String(e) }, "H0");
  process.exit(1);
});
