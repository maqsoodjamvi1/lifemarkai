/**
 * Live smoke: build mode SSE must return files in data.done.
 * Writes NDJSON to debug-148b16.log
 */
import { appendFileSync, readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const LOG = "debug-148b16.log";
const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

function log(
  location: string,
  message: string,
  data: Record<string, unknown>,
  hypothesisId: string,
) {
  const entry = {
    sessionId: "148b16",
    timestamp: Date.now(),
    runId: "build-files-verify",
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

async function main() {
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
  const { data: auth, error } = await sb.auth.signInWithPassword({
    email: "demo@lifemarkai.app",
    password: "DemoPassword123!",
  });
  if (error || !auth.session) {
    log("verify-build-files-done.ts", "auth failed", { error: error?.message }, "H-BUILD");
    process.exit(1);
  }

  const demoRes = await fetch(`${BASE}/api/demo/create-sample-project`);
  const projectId = demoRes.ok ? (await demoRes.json()).projectId : null;
  if (!projectId) {
    log("verify-build-files-done.ts", "no project", {}, "H-BUILD");
    process.exit(1);
  }

  const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
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
      message: "Build a minimal hello world React page with a blue heading",
      mode: "build",
      files: [],
    }),
  });

  log("verify-build-files-done.ts", "chat response", { status: res.status, ok: res.ok }, "H-BUILD");
  if (!res.ok || !res.body) process.exit(1);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let donePayload: Record<string, unknown> | null = null;
  const deadline = Date.now() + 120_000;

  while (Date.now() < deadline) {
    const { value, done } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    for (const line of buf.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      try {
        const data = JSON.parse(line.slice(6)) as Record<string, unknown>;
        if (data.done) donePayload = data;
      } catch { /* skip */ }
    }
    if (donePayload) break;
  }
  reader.cancel().catch(() => {});

  const files = (donePayload?.files as unknown[]) ?? [];
  const fileCount = (donePayload?.fileCount as number) ?? files.length;
  const ok = fileCount > 0;

  log(
    "verify-build-files-done.ts",
    "done payload files",
    {
      ok,
      fileCount,
      paths: (files as Array<{ path: string }>).map((f) => f.path).slice(0, 10),
      hasBuildActivity: Array.isArray(donePayload?.build_activity),
    },
    "H-BUILD",
  );

  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
