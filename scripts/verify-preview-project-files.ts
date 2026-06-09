/**
 * Build fallback preview HTML from a real project's files (dev API).
 */
import { readFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";
import { buildFallbackHtml, PREVIEW_ENGINE_REV } from "../lib/preview/build-fallback-html";

const BASE = "http://localhost:3000";
const DEMO_EMAIL = "demo@lifemarkai.app";
const DEMO_PASSWORD = "DemoPassword123!";
const projectId = process.argv[2] ?? "fb18d6f5-400f-4b7c-ba75-737ca94ddcf9";

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
    email: DEMO_EMAIL,
    password: DEMO_PASSWORD,
  });
  if (error || !auth.session) {
    console.log(JSON.stringify({ ok: false, error: error?.message ?? "auth failed" }));
    process.exit(1);
  }

  const ref = new URL(env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0];
  const cookie = `sb-${ref}-auth-token=${encodeURIComponent(
    JSON.stringify({
      access_token: auth.session.access_token,
      refresh_token: auth.session.refresh_token,
      expires_at: auth.session.expires_at,
      expires_in: auth.session.expires_in,
      token_type: auth.session.token_type,
      user: auth.session.user,
    }),
  )}`;

  const filesRes = await fetch(`${BASE}/api/projects/${projectId}/files`, {
    headers: { Cookie: cookie },
  });
  if (!filesRes.ok) {
    console.log(JSON.stringify({ ok: false, status: filesRes.status }));
    process.exit(1);
  }

  const payload = await filesRes.json();
  const files = Array.isArray(payload) ? payload : payload.files ?? [];
  const utils = files.find((f: { path: string }) => f.path.replace(/\\/g, "/").endsWith("lib/utils.ts"));
  const html = buildFallbackHtml(files);
  const broken =
    html.includes("type ClassValue") ||
    html.includes("type ") && html.includes("window.__clsx");

  console.log(
    JSON.stringify({
      ok: !broken,
      rev: PREVIEW_ENGINE_REV,
      projectId,
      fileCount: files.length,
      utilsSnippet: utils?.content?.slice(0, 200) ?? null,
      broken,
      htmlLen: html.length,
    }),
  );
  process.exit(broken ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
