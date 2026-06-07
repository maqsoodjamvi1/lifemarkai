/**
 * Authenticated editor load test — signs in as demo user, fetches /editor,
 * writes server-side debug logs to debug-799475.log.
 */
import { readFileSync, appendFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const LOG = "debug-799475.log";
const BASE = "http://localhost:3000";
const DEMO_EMAIL = "demo@lifemarkai.app";
const DEMO_PASSWORD = "DemoPassword123!";

function log(location, message, data, hypothesisId) {
  const entry = {
    sessionId: "799475",
    timestamp: Date.now(),
    location,
    message,
    data,
    hypothesisId,
    runId: "browser-verify",
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
    })
);

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const projectRef = new URL(supabaseUrl).hostname.split(".")[0];

const sb = createClient(supabaseUrl, anonKey);

const { data: auth, error: authErr } = await sb.auth.signInWithPassword({
  email: DEMO_EMAIL,
  password: DEMO_PASSWORD,
});

if (authErr || !auth.session) {
  log("verify-editor-browser", "demo sign-in failed", { error: authErr?.message }, "H4");
  process.exit(1);
}

log("verify-editor-browser", "demo sign-in ok", { userId: auth.user.id }, "H4");

// Ensure a project exists
let projectId;
const demoRes = await fetch(`${BASE}/api/demo/create-sample-project`);
if (demoRes.ok) {
  const demo = await demoRes.json();
  projectId = demo.projectId;
} else {
  projectId = "fb18d6f5-400f-4b7c-ba75-737ca94ddcf9";
}

const sessionPayload = JSON.stringify({
  access_token: auth.session.access_token,
  refresh_token: auth.session.refresh_token,
  expires_at: auth.session.expires_at,
  expires_in: auth.session.expires_in,
  token_type: auth.session.token_type,
  user: auth.session.user,
});

const cookieName = `sb-${projectRef}-auth-token`;
const cookie = `${cookieName}=${encodeURIComponent(sessionPayload)}`;

const editorRes = await fetch(`${BASE}/editor/${projectId}`, {
  headers: { Cookie: cookie },
  redirect: "manual",
});

const html = editorRes.status === 200 ? await editorRes.text() : "";
log("verify-editor-browser", "editor fetch", {
  projectId,
  status: editorRes.status,
  htmlLen: html.length,
  hasBootScript: html.includes("editor-chunk-recovery") || html.includes("editor boot script"),
  hasEditorLayout: html.includes("EditorLayout") || html.includes("Loading chat"),
}, "H4");

const promptRes = await fetch(
  `${BASE}/editor/${projectId}?prompt=${encodeURIComponent("Build a hello world page")}&mode=build`,
  { headers: { Cookie: cookie }, redirect: "manual" },
);
log("verify-editor-browser", "editor with starter prompt", {
  projectId,
  status: promptRes.status,
  ok: promptRes.status === 200,
}, "H7");

if (editorRes.status !== 200) {
  console.error("Editor fetch failed — status", editorRes.status);
  process.exit(1);
}

console.log("\nEditor HTML loaded — check debug-799475.log for server-side entries");
