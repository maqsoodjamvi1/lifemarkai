import { readFileSync, appendFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const LOG = "debug-799475.log";
const SESSION = "799475";
const projectId = "fb18d6f5-400f-4b7c-ba75-737ca94ddcf9";

function log(location, message, data, hypothesisId) {
  const entry = {
    sessionId: SESSION,
    timestamp: Date.now(),
    location,
    message,
    data,
    hypothesisId,
    runId: "post-fix-verify",
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

const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);

const { data: project, error: projectErr } = await sb
  .from("projects")
  .select("id, name, status, deployed_url")
  .eq("id", projectId)
  .single();

if (projectErr || !project) {
  log("verify-editor-load", "project lookup failed", { error: projectErr?.message }, "H3");
  process.exit(1);
}

const { data: files } = await sb
  .from("project_files")
  .select("id, path")
  .eq("project_id", projectId);

log(
  "verify-editor-load",
  "editor data available",
  { projectId, fileCount: files?.length ?? 0, status: project.status },
  "H3"
);

// Verify preview route (public, no auth)
const previewRes = await fetch(`http://localhost:3000/preview/${projectId}`);
const previewHtml = await previewRes.text();
log(
  "verify-editor-load",
  "preview route",
  { status: previewRes.status, htmlLen: previewHtml.length },
  "H2"
);

// Verify SW no longer cache-first for _next/static
const sw = readFileSync("public/sw.js", "utf8");
const swCachesNextStatic = /_next\/static/.test(sw) && /cache-first|cache\.match/.test(sw.split("_next/static")[1]?.slice(0, 400) ?? "");
log(
  "verify-editor-load",
  "sw chunk policy",
  {
    cacheName: sw.match(/CACHE_NAME = "([^"]+)"/)?.[1] ?? null,
    bypassesEditor: sw.includes('pathname.startsWith("/editor")'),
    networkOnlyChunks: sw.includes("event.respondWith(fetch(request))"),
    registrarClearsEditor: readFileSync("components/pwa/service-worker-registrar.tsx", "utf8").includes('pathname.startsWith("/editor")'),
  },
  "H6"
);

console.log("\nDone — see debug-799475.log");
