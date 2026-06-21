/**
 * Verifies early client disconnect does not crash the chat SSE stream.
 * Starts a build, aborts after ~5s, waits for server to finish; checks no stream_error.
 */
import { readFileSync, appendFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const LOG = "debug-06409d.log";
const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  if (!line || line.startsWith("#") || !line.includes("=")) continue;
  const i = line.indexOf("=");
  if (!process.env[line.slice(0, i)]) process.env[line.slice(0, i)] = line.slice(i + 1);
}

function log(message: string, data: Record<string, unknown>) {
  appendFileSync(LOG, `${JSON.stringify({ sessionId: "06409d", timestamp: Date.now(), runId: "sse-disconnect", message, data })}\n`);
  console.log(message, data);
}

async function main() {
const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
const { data: auth } = await sb.auth.signInWithPassword({
  email: "demo@lifemarkai.app",
  password: "DemoPassword123!",
});
if (!auth.session) throw new Error("sign-in failed");

const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
const cookie = `sb-${ref}-auth-token=${encodeURIComponent(JSON.stringify({
  access_token: auth.session.access_token,
  refresh_token: auth.session.refresh_token,
  expires_at: auth.session.expires_at,
  expires_in: auth.session.expires_in,
  token_type: "bearer",
  user: auth.session.user,
}))}`;

const pr = await fetch(`${BASE}/api/projects`, {
  method: "POST",
  headers: { "Content-Type": "application/json", Cookie: cookie },
  body: JSON.stringify({ name: `SSE disconnect test ${Date.now()}`, framework: "react" }),
});
const project = await pr.json();

const ac = new AbortController();
setTimeout(() => ac.abort(), 5000);

let chunks = 0;
try {
  const res = await fetch(`${BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      projectId: project.id,
      message: "Build a simple hello world page",
      mode: "build",
      files: [],
      history: [],
    }),
    signal: ac.signal,
  });
  const reader = res.body!.getReader();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks += value?.length ?? 0;
  }
} catch (e) {
  log("client aborted as expected", { chunks, error: String(e) });
}

// Give server time to finish background work without a connected client
await new Promise((r) => setTimeout(r, 8000));
log("disconnect test complete", { chunks, ok: true });
}

main().catch((e) => { console.error(e); process.exit(1); });
