/**
 * Live smoke: /api/ai/agent SSE returns step events and completes.
 * Writes NDJSON to debug-148b16.log
 */
import { appendFileSync, readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const LOG = "debug-148b16.log";
const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const MAX_MS = 90_000;

function log(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
) {
  const entry = {
    sessionId: "148b16",
    timestamp: Date.now(),
    runId: "agent-api-live-verify",
    location,
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

function authCookie(session: {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  expires_in?: number;
  token_type: string;
  user: unknown;
}, supabaseUrl: string) {
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  return `sb-${projectRef}-auth-token=${encodeURIComponent(JSON.stringify(session))}`;
}

async function main() {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: auth, error } = await sb.auth.signInWithPassword({
    email: "demo@lifemarkai.app",
    password: "DemoPassword123!",
  });
  if (error || !auth.session) {
    log("verify-agent-api-live.ts", "auth failed", { error: error?.message }, "H-AGENT-API");
    process.exit(1);
  }

  const cookie = authCookie(auth.session, env.NEXT_PUBLIC_SUPABASE_URL!);

  const grantRes = await fetch(`${BASE}/api/billing/dev-grant`, {
    method: "POST",
    headers: { Cookie: cookie },
  }).catch(() => null);
  const creditsRes = await fetch(`${BASE}/api/billing/credits`, { headers: { Cookie: cookie } });
  const creditsBody = creditsRes.ok ? await creditsRes.json() : null;
  log("verify-agent-api-live.ts", "credits before agent", {
    grantStatus: grantRes?.status ?? null,
    credits: creditsBody?.credits ?? null,
  }, "H-AGENT-CREDITS");

  const demoRes = await fetch(`${BASE}/api/demo/create-sample-project`);
  const projectId = demoRes.ok ? (await demoRes.json()).projectId : null;
  if (!projectId) {
    log("verify-agent-api-live.ts", "no project", {}, "H-AGENT-API");
    process.exit(1);
  }

  const res = await fetch(`${BASE}/api/ai/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      projectId,
      task: "List all project file paths using the list_files tool, then reply DONE.",
      model: "claude-opus-4-6",
    }),
  });

  log("verify-agent-api-live.ts", "agent response", {
    status: res.status,
    ok: res.ok,
    contentType: res.headers.get("content-type"),
  }, "H-AGENT-API");

  if (!res.ok || !res.body) {
    const errBody = await res.text().catch(() => "");
    log("verify-agent-api-live.ts", "agent failed", { errBody: errBody.slice(0, 300) }, "H-AGENT-API");
    process.exit(1);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let stepCount = 0;
  let fileUpdates = 0;
  let done = false;
  let agentError: string | null = null;
  const started = Date.now();

  while (Date.now() - started < MAX_MS) {
    const { value, done: streamDone } = await reader.read();
    if (streamDone) break;
    for (const line of decoder.decode(value).split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6));
        if (data.step) stepCount++;
        if (data.fileUpdated) fileUpdates++;
        if (data.done) done = true;
        if (data.error) agentError = data.error;
      } catch {}
    }
    if (done || agentError) break;
  }

  const ok = done && stepCount > 0 && !agentError;
  log("verify-agent-api-live.ts", "agent stream summary", {
    ok,
    stepCount,
    fileUpdates,
    done,
    agentError,
    elapsedMs: Date.now() - started,
  }, "H-AGENT-DONE");

  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  log("verify-agent-api-live.ts", "fatal", { error: String(e) }, "H-AGENT-API");
  process.exit(1);
});
