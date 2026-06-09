/**
 * Verify project files access control + demo endpoint hardening.
 * Run: npx tsx scripts/verify-project-access.ts
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import {
  canReadProjectFiles,
  canWriteProjectFiles,
} from "../lib/project/access.ts";

const BASE = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
const DEMO_EMAIL = "demo@lifemarkai.app";
const DEMO_PASSWORD = "DemoPassword123!";

let passed = 0;
let failed = 0;

function check(name: string, ok: boolean, detail?: unknown) {
  console.log(JSON.stringify({ name, ok, detail }));
  if (ok) passed++;
  else failed++;
}

function loadEnv() {
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
  token_type: string;
  user: unknown;
}, supabaseUrl: string) {
  const projectRef = new URL(supabaseUrl).hostname.split(".")[0];
  return `sb-${projectRef}-auth-token=${encodeURIComponent(JSON.stringify(session))}`;
}

async function main() {
  check("canRead owner", canReadProjectFiles("owner"), null);
  check("canRead public", canReadProjectFiles("public"), null);
  check("canRead null", !canReadProjectFiles(null), null);
  check("canWrite editor", canWriteProjectFiles("editor"), null);
  check("canWrite viewer", !canWriteProjectFiles("viewer"), null);
  check("canWrite public", !canWriteProjectFiles("public"), null);

  const env = loadEnv();
  const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL!, env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);

  const { data: demoAuth, error: demoErr } = await sb.auth.signInWithPassword({
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  check("demo sign-in", !demoErr && !!demoAuth.session, { error: demoErr?.message });
  if (!demoAuth.session) {
    process.exit(1);
  }

  const demoRes1 = await fetch(`${BASE}/api/demo/create-sample-project`);
  const demo1 = demoRes1.ok ? await demoRes1.json() : null;
  check("demo endpoint ok", demoRes1.ok && !!demo1?.projectId, { status: demoRes1.status });

  const demoRes2 = await fetch(`${BASE}/api/demo/create-sample-project`);
  const demo2 = demoRes2.ok ? await demoRes2.json() : null;
  check(
    "demo idempotent",
    demo1?.projectId && demo1.projectId === demo2?.projectId,
    { first: demo1?.projectId, second: demo2?.projectId, reused: demo2?.reused },
  );
  check(
    "demo no credentials leak",
    !demo2?.demoCredentials && !demo2?.password,
    { keys: demo2 ? Object.keys(demo2) : [] },
  );

  const projectId = demo1?.projectId as string;
  const demoCookie = authCookie(demoAuth.session, env.NEXT_PUBLIC_SUPABASE_URL!);

  const ownerFiles = await fetch(`${BASE}/api/projects/${projectId}/files`, {
    headers: { Cookie: demoCookie },
  });
  check("owner can read files", ownerFiles.ok, { status: ownerFiles.status });

  const randomId = "00000000-0000-4000-8000-000000000099";
  const deniedFiles = await fetch(`${BASE}/api/projects/${randomId}/files`, {
    headers: { Cookie: demoCookie },
  });
  check("foreign project returns 404", deniedFiles.status === 404, { status: deniedFiles.status });

  const unauthFiles = await fetch(`${BASE}/api/projects/${projectId}/files`);
  check("unauthenticated returns 401", unauthFiles.status === 401, { status: unauthFiles.status });

  const ownerEnv = await fetch(`${BASE}/api/projects/${projectId}/env`, {
    headers: { Cookie: demoCookie },
  });
  check("owner can read env keys", ownerEnv.ok, { status: ownerEnv.status });

  const deniedEnv = await fetch(`${BASE}/api/projects/${randomId}/env`, {
    headers: { Cookie: demoCookie },
  });
  check("foreign env returns 404", deniedEnv.status === 404, { status: deniedEnv.status });

  const unauthAgent = await fetch(`${BASE}/api/ai/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ projectId, task: "test" }),
  });
  check("agent unauthenticated returns 401", unauthAgent.status === 401, { status: unauthAgent.status });

  const deniedAgent = await fetch(`${BASE}/api/ai/agent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: demoCookie },
    body: JSON.stringify({ projectId: randomId, task: "test" }),
  });
  check("agent foreign project returns 404", deniedAgent.status === 404, { status: deniedAgent.status });

  const ownerExport = await fetch(`${BASE}/api/projects/${projectId}/export`, {
    headers: { Cookie: demoCookie },
  });
  check("owner can export project", ownerExport.ok, { status: ownerExport.status });

  const deniedExport = await fetch(`${BASE}/api/projects/${randomId}/export`, {
    headers: { Cookie: demoCookie },
  });
  check("foreign export returns 404", deniedExport.status === 404, { status: deniedExport.status });

  const ownerPreview = await fetch(`${BASE}/api/projects/${projectId}/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: demoCookie },
    body: JSON.stringify({
      dataUrl: "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIRAxEAPwCwAA//2Q==",
    }),
  });
  check("owner can upload preview", ownerPreview.ok, { status: ownerPreview.status });

  const deniedPreview = await fetch(`${BASE}/api/projects/${randomId}/preview`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: demoCookie },
    body: JSON.stringify({ dataUrl: "data:image/jpeg;base64,AA==" }),
  });
  check("foreign preview returns 404", deniedPreview.status === 404, { status: deniedPreview.status });

  const ownerActivity = await fetch(`${BASE}/api/projects/${projectId}/activity`, {
    headers: { Cookie: demoCookie },
  });
  check("owner can read activity", ownerActivity.ok, { status: ownerActivity.status });

  const deniedActivity = await fetch(`${BASE}/api/projects/${randomId}/activity`, {
    headers: { Cookie: demoCookie },
  });
  check("foreign activity returns 404", deniedActivity.status === 404, { status: deniedActivity.status });

  const ownerPreviewVerify = await fetch(`${BASE}/api/projects/${projectId}/preview-verify`, {
    method: "POST",
    headers: { Cookie: demoCookie },
  });
  check("owner can preview-verify", ownerPreviewVerify.ok, { status: ownerPreviewVerify.status });

  const deniedPreviewVerify = await fetch(`${BASE}/api/projects/${randomId}/preview-verify`, {
    method: "POST",
    headers: { Cookie: demoCookie },
  });
  check("foreign preview-verify returns 404", deniedPreviewVerify.status === 404, {
    status: deniedPreviewVerify.status,
  });

  console.log(JSON.stringify({ passed, failed, ok: failed === 0 }));
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
