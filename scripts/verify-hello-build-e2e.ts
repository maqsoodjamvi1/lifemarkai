/** Quick E2E: hello-world build must return files via SSE done event. */
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
  const e = { sessionId: "06409d", timestamp: Date.now(), runId: "hello-e2e", message, data };
  appendFileSync(LOG, `${JSON.stringify(e)}\n`);
  console.log(JSON.stringify(e));
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
    body: JSON.stringify({ name: `Hello E2E ${Date.now()}`, framework: "react" }),
  });
  const project = await pr.json();

  const start = Date.now();
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
  });
  if (!res.ok || !res.body) throw new Error(`chat ${res.status}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let fileCount = 0;
  let gotDone = false;

  while (Date.now() - start < 180_000) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    for (const line of buf.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const evt = JSON.parse(line.slice(6).trim()) as { done?: boolean; fileCount?: number };
        if (evt.done) {
          gotDone = true;
          fileCount = evt.fileCount ?? 0;
          break;
        }
      } catch { /* partial */ }
    }
    if (gotDone) break;
  }

  const ok = gotDone && fileCount > 0;
  log("hello build result", { gotDone, fileCount, elapsedSec: Math.round((Date.now() - start) / 1000), ok });
  process.exit(ok ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });
