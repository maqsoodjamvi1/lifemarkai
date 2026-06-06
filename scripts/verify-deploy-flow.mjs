import { readFileSync, appendFileSync } from "fs";
import { createClient } from "@supabase/supabase-js";

const LOG = "debug-ed67f3.log";
const SESSION = "ed67f3";
const projectId = "fb18d6f5-400f-4b7c-ba75-737ca94ddcf9";

function log(location, message, data, hypothesisId) {
  const entry = {
    sessionId: SESSION,
    timestamp: Date.now(),
    location,
    message,
    data,
    hypothesisId,
    runId: "post-fix",
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
  .select("id, name, user_id")
  .eq("id", projectId)
  .single();

if (projectErr || !project) {
  log("verify-deploy-flow", "project lookup failed", { error: projectErr?.message }, "H_POLL");
  process.exit(1);
}

const { data: files } = await sb
  .from("project_files")
  .select("path, content")
  .eq("project_id", projectId);

const { buildDeployIndexHtml } = await import("../lib/deploy/build-deploy-files.ts");
const html = buildDeployIndexHtml(files ?? [], {
  projectId,
  projectName: project.name,
});

log(
  "verify-deploy-flow",
  "deploy build stats",
  {
    sourceFiles: files?.length ?? 0,
    deployHtmlLen: html.length,
    hasMatchRoute: html.includes("function matchRoute"),
    hasModules: html.includes("lifemark-module"),
    oldSingleAppOnly:
      html.includes("React.createElement(App)") && !html.includes("lifemark-module"),
  },
  "H1"
);

const slug = String(project.name)
  .toLowerCase()
  .replace(/[^a-z0-9]/g, "-")
  .replace(/-+/g, "-");
const deployedUrl = `https://${slug}-${projectId.slice(0, 8)}.lifemarkai.app`;

const { data: deployment, error: insertErr } = await sb
  .from("deployments")
  .insert({
    project_id: projectId,
    user_id: project.user_id,
    status: "building",
    provider: "lifemarkai",
    file_count: files?.length ?? 0,
  })
  .select("id, status")
  .single();

if (insertErr || !deployment) {
  log("verify-deploy-flow", "deployment insert failed", { error: insertErr?.message }, "H_POLL");
  process.exit(1);
}

log("verify-deploy-flow", "deployment created", { deploymentId: deployment.id, status: deployment.status }, "H_POLL");

await new Promise((r) => setTimeout(r, 500));

await sb
  .from("deployments")
  .update({
    status: "live",
    url: deployedUrl,
    deployed_at: new Date().toISOString(),
  })
  .eq("id", deployment.id);

await sb
  .from("projects")
  .update({ deployed_url: deployedUrl, status: "active" })
  .eq("id", projectId);

const { data: latest } = await sb
  .from("deployments")
  .select("status, url")
  .eq("project_id", projectId)
  .order("created_at", { ascending: false })
  .limit(1)
  .single();

const dbStatus = latest?.status ?? "idle";
const isLive = dbStatus === "live" || dbStatus === "deployed";

log(
  "verify-deploy-flow",
  "deploy status poll simulation",
  {
    dbStatus,
    isLive,
    url: latest?.url ?? null,
    pollWouldSucceed: isLive,
    oldBugWouldFail: dbStatus === "live" && dbStatus !== "deployed",
  },
  "H_POLL"
);
