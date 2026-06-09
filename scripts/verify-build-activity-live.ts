/**
 * Live SSE + DB check: build_activity in done event and persisted message metadata.
 */
import { readFileSync, appendFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const LOG = "debug-83daa0.log";
const BASE = "http://localhost:3000";

function log(message: string, data: Record<string, unknown>, hypothesisId: string) {
  const entry = {
    sessionId: "83daa0",
    timestamp: Date.now(),
    runId: "build-activity-live",
    location: "verify-build-activity-live.ts",
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
    log("auth failed", { error: error?.message }, "H9");
    process.exit(1);
  }

  const projectRef = new URL(env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  const cookie = `sb-${projectRef}-auth-token=${encodeURIComponent(
    JSON.stringify({
      access_token: auth.session.access_token,
      refresh_token: auth.session.refresh_token,
      expires_at: auth.session.expires_at,
      expires_in: auth.session.expires_in,
      token_type: auth.session.token_type,
      user: auth.session.user,
    }),
  )}`;

  const demoRes = await fetch(`${BASE}/api/demo/create-sample-project`);
  const projectId = demoRes.ok ? (await demoRes.json()).projectId : null;
  if (!projectId) {
    log("no project", {}, "H9");
    process.exit(1);
  }

  const filesRes = await fetch(`${BASE}/api/projects/${projectId}/files`, { headers: { Cookie: cookie } });
  const filesPayload = filesRes.ok ? await filesRes.json() : [];
  const files = Array.isArray(filesPayload) ? filesPayload : filesPayload.files ?? [];

  const res = await fetch(`${BASE}/api/ai/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({
      projectId,
      message: "Add a short footer with copyright text",
      mode: "build",
      model: "claude-opus-4-6",
      files: files.map((f: { path: string; content: string; language?: string }) => ({
        path: f.path,
        content: f.content,
        language: f.language,
      })),
    }),
  });

  if (!res.ok || !res.body) {
    log("chat failed", { status: res.status }, "H9");
    process.exit(1);
  }

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
        const parsed = JSON.parse(line.slice(6));
        if (parsed.done) donePayload = parsed;
      } catch {
        /* skip */
      }
    }
    if (donePayload) break;
  }
  reader.cancel().catch(() => {});

  const buildActivity = donePayload?.build_activity;
  const assistantMessageId = donePayload?.assistantMessageId;
  log("SSE done payload", {
    hasDone: !!donePayload,
    assistantMessageId,
    buildActivitySteps: Array.isArray(buildActivity) ? buildActivity.length : 0,
    buildActivityLabels: Array.isArray(buildActivity)
      ? (buildActivity as Array<{ label: string }>).map((s) => s.label)
      : [],
    fileCount: donePayload?.fileCount,
  }, "H9");

  if (typeof assistantMessageId === "string") {
    const { data: row } = await sb
      .from("messages")
      .select("id, metadata")
      .eq("id", assistantMessageId)
      .single();
    const meta = row?.metadata as { build_activity?: unknown[] } | null;
    log("DB message metadata", {
      found: !!row,
      hasBuildActivity: Array.isArray(meta?.build_activity),
      stepCount: Array.isArray(meta?.build_activity) ? meta!.build_activity!.length : 0,
    }, "H9");
  } else {
    log("DB message metadata", { found: false, reason: "no assistantMessageId in done" }, "H9");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
