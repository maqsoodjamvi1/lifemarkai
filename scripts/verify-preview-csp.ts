/**
 * Audit editor COOP/COEP/CSP for WebContainer compatibility.
 */
import { readFileSync, appendFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { shouldUseWebContainer } from "../lib/preview/resolve-preview-engine";

const LOG = "debug-83daa0.log";
const BASE = "http://localhost:3000";
const DEMO_EMAIL = "demo@lifemarkai.app";
const DEMO_PASSWORD = "DemoPassword123!";

function log(message: string, data: Record<string, unknown>, hypothesisId: string) {
  const entry = {
    sessionId: "83daa0",
    timestamp: Date.now(),
    runId: "preview-csp-verify",
    location: "verify-preview-csp.ts",
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
  email: DEMO_EMAIL,
  password: DEMO_PASSWORD,
});

if (authErr || !auth.session) {
  log("auth failed", { error: authErr?.message }, "H7a");
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

let projectId: string;
const demoRes = await fetch(`${BASE}/api/demo/create-sample-project`);
if (demoRes.ok) {
  projectId = (await demoRes.json()).projectId;
} else {
  projectId = "2fc379dd-f915-4451-ba47-b9af0296a9b9";
}

const editorRes = await fetch(`${BASE}/editor/${projectId}`, {
  headers: { Cookie: cookie },
  redirect: "manual",
});

const csp = editorRes.headers.get("content-security-policy") ?? "";
const connectSrc = csp.match(/connect-src[^;]+/)?.[0] ?? "";
const frameSrc = csp.match(/frame-src[^;]+/)?.[0] ?? "";
const workerSrc = csp.match(/worker-src[^;]+/)?.[0] ?? "";
const wcDomains = ["staticblitz.com", "webcontainer.io", "webcontainer-api.io", "stackblitz.io"];

log("editor headers + CSP audit", {
  status: editorRes.status,
  projectId,
  coop: editorRes.headers.get("cross-origin-opener-policy"),
  coep: editorRes.headers.get("cross-origin-embedder-policy"),
  connectSrc,
  frameSrc,
  workerSrc,
  connectMissing: wcDomains.filter((d) => !connectSrc.includes(d)),
  frameMissing: wcDomains.filter((d) => !frameSrc.includes(d)),
}, "H7a");

const filesRes = await fetch(`${BASE}/api/projects/${projectId}/files`, {
  headers: { Cookie: cookie },
});
const filesPayload = filesRes.ok ? await filesRes.json() : [];
const files = Array.isArray(filesPayload) ? filesPayload : filesPayload.files ?? [];

log("project webcontainer eligibility", {
  fileCount: files.length,
  eligible: shouldUseWebContainer(files),
  paths: files.slice(0, 10).map((f: { path: string }) => f.path),
}, "H7d");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
