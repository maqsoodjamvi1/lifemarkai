import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { buildNetlifyFileMap, buildVercelFilesList, mergeViteBuildAssets } from "@/lib/deploy/build-deploy-files";
import { buildLifemarkDeployUrl } from "@/lib/deploy/branded-deploy-url";
import { sendDeploymentEmail } from "@/lib/email/resend";
import { rateLimitAsync,RATE_LIMITS } from "@/lib/rate-limit";
import { enqueueDeployJob,getDeployQueue } from "@/lib/queue/client";
import { logger } from "@/lib/logger";
import { createTraceContext,parseTraceparent,traceparent } from "@/lib/monitoring/tracing";
import { evaluatePublishGate,publishGateResponseBody } from "@/lib/security/publish-gate";

// ── Netlify helpers ────────────────────────────────────────────────────────

const NETLIFY_TOKEN = process.env.NETLIFY_AUTH_TOKEN;
const NETLIFY_API = "https://api.netlify.com/api/v1";

interface NetlifySite {
  id: string;
  name: string;
  ssl_url: string;
  url: string;
}

interface NetlifyDeploy {
  id: string;
  state: "uploading" | "uploaded" | "processing" | "ready" | "error";
  ssl_url: string;
  url: string;
  error_message?: string;
}

async function netlifyFetch<T>(
  path: string,
  opts: RequestInit = {}
): Promise<T> {
  if (!NETLIFY_TOKEN) throw new Error("NETLIFY_AUTH_TOKEN not set");
  const res = await fetch(`${NETLIFY_API}${path}`, {
    ...opts,
    headers: {
      Authorization: `Bearer ${NETLIFY_TOKEN}`,
      "Content-Type": "application/json",
      ...opts.headers,
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Netlify API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

/** Get or create a Netlify site for this project. */
async function getOrCreateSite(
  projectId: string,
  projectName: string
): Promise<NetlifySite> {
  // Use a stable site name derived from project id
  const siteName = `lifemark-${projectId.slice(0, 12)}`;

  try {
    // Try fetching existing site by name
    const sites = await netlifyFetch<NetlifySite[]>(
      `/sites?name=${encodeURIComponent(siteName)}`
    );
    const existing = sites.find((s) => s.name === siteName);
    if (existing) return existing;
  } catch {
    // site lookup is best-effort; creation below is the fallback path.
  }

  // Create new site
  return netlifyFetch<NetlifySite>("/sites", {
    method: "POST",
    body: JSON.stringify({
      name: siteName,
      custom_domain: null,
    }),
  });
}

/** Deploy files to a Netlify site and wait for it to go live (max 30s). */
async function deployToNetlify(
  siteId: string,
  fileMap: Record<string, string>
): Promise<string> {
  // Create deployment with file contents
  const deploy = await netlifyFetch<NetlifyDeploy>(`/sites/${siteId}/deploys`, {
    method: "POST",
    body: JSON.stringify({ files: fileMap, async: true }),
  });

  // Poll until ready (max 60s)
  const buildBudgetMs = Math.max(60_000, Number.parseInt(process.env.NETLIFY_BUILD_TIMEOUT_MS ?? "240000", 10));
  const deadline = Date.now() + buildBudgetMs;
  let liveUrl = deploy.ssl_url || deploy.url || "";

  // Falling out of this loop on the DEADLINE is not success. `liveUrl` was
  // seeded from the create response, so the caller used to receive a URL,
  // write status "live", set `projects.deployed_url`, clear the
  // unpublished-changes dot and email the user "your app is live" — for a site
  // that was still building, or had errored after we stopped watching. Throw
  // instead, so a slow deploy is reported as unfinished rather than as done.
  let ready = false;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const status = await netlifyFetch<NetlifyDeploy>(
      `/deploys/${deploy.id}`
    );
    if (status.state === "ready") {
      liveUrl = status.ssl_url || status.url || liveUrl;
      ready = true;
      break;
    }
    if (status.state === "error") {
      throw new Error(status.error_message ?? "Netlify build failed");
    }
  }

  if (!ready) {
    throw new Error(
      `Netlify is still building after ${Math.round(buildBudgetMs / 1000)} seconds. The deploy may still finish - check your Netlify dashboard before publishing again.`,
    );
  }

  return liveUrl;
}

// ── Vercel helpers ─────────────────────────────────────────────────────────

const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
const VERCEL_API = "https://api.vercel.com";

interface VercelDeployment {
  id: string;
  url: string;
  readyState: "BUILDING" | "ERROR" | "INITIALIZING" | "QUEUED" | "READY" | "CANCELED";
  alias?: string[];
}

async function deployToVercel(
  projectName: string,
  projectId: string,
  files: Array<{ path: string; content: string }>
): Promise<string> {
  if (!VERCEL_TOKEN) throw new Error("VERCEL_TOKEN not set");

  const vercelFiles = buildVercelFilesList(files, { projectId, projectName });

  const deployName = `lifemark-${projectId.slice(0, 12)}`;

  const res = await fetch(`${VERCEL_API}/v13/deployments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VERCEL_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: deployName,
      files: vercelFiles,
      projectSettings: { framework: null, buildCommand: null, outputDirectory: null },
      target: "production",
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Vercel API ${res.status}: ${body}`);
  }

  const deploy = await res.json() as VercelDeployment;

  // Poll until ready (max 120s)
  const deadline = Date.now() + 120_000;
  const deployId = deploy.id;
  let liveUrl = `https://${deploy.url}`;

  // Same hazard as Netlify above, with one extra: `if (!statusRes.ok) break`
  // treated a single transient 5xx from Vercel as "done", so one bad poll
  // reported a mid-build deployment as live. Transient failures are now
  // tolerated (keep polling until the deadline) and only a READY state counts
  // as ready.
  let ready = false;
  let lastPollError: string | null = null;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(`${VERCEL_API}/v13/deployments/${deployId}`, {
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
    });
    if (!statusRes.ok) {
      lastPollError = `Vercel API ${statusRes.status}`;
      continue;
    }
    lastPollError = null;
    const status = await statusRes.json() as VercelDeployment;
    if (status.readyState === "READY") {
      liveUrl = status.alias?.[0] ? `https://${status.alias[0]}` : `https://${status.url}`;
      ready = true;
      break;
    }
    if (status.readyState === "ERROR" || status.readyState === "CANCELED") {
      throw new Error("Vercel deployment failed");
    }
  }

  if (!ready) {
    throw new Error(
      lastPollError
        ? `Could not confirm the Vercel deploy finished (${lastPollError}). Check your Vercel dashboard before publishing again.`
        : "Vercel is still building after 2 minutes. The deploy may still finish — check your Vercel dashboard before publishing again.",
    );
  }

  return liveUrl;
}

// ── Route handlers ─────────────────────────────────────────────────────────

/** GET /api/deploy?projectId=<id> — list deploy history for a project */
async function handleGET(req: Request) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 });

  // Verify ownership
  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return Response.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await supabase
    .from("deployments")
    .select("id, status, url, provider, snapshot_id, file_count, commit_sha, deployed_at, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json(data ?? []);
}

async function handlePOST(req: Request) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.deploy);
  if (!rl.success) {
    return Response.json(
      { error: "Too many deployments. Please wait before deploying again." },
      { status: 429, headers: { "X-RateLimit-Reset": String(rl.resetAt) } }
    );
  }

  const {
    projectId,
    provider = "netlify",
    allowCriticalSecurityFindings = false,
    // Separate from the critical override on purpose: accepting "this API key is
    // fake" is a different decision from "yes, publish these card numbers".
    allowPersonalDataFindings = false,
  } = await req.json();

  // Fetch project + files
  const { data: project } = await supabase
    .from("projects")
    .select("*, project_files(*)")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

  const { data: ownerBranding } = await supabase
    .from("profiles")
    .select("branded_subdomain, branded_status")
    .eq("id", user.id)
    .single();

  // Ensure the project has a unique app_slug so the deploy URL is a CLEAN
  // slug host ({app_slug}.apps.lifemarkai.com). Generate lazily if missing;
  // on any failure the builder falls back to the id-embedded host.
  let appSlug: string | null = (project as { app_slug?: string | null }).app_slug ?? null;
  if (!appSlug) {
    try {
      const { data: gen } = await supabase.rpc("generate_app_slug", {
        p_name: (project as { name?: string }).name ?? "app",
      });
      if (typeof gen === "string" && gen) {
        appSlug = gen;
        // Persist so the slug is stable across future deploys.
        await supabase
          .from("projects")
          .update({ app_slug: gen })
          .eq("id", projectId)
          .is("app_slug", null);
      }
    } catch { /* fall back to id-based URL */ }
  }

  const lifemarkUrl = () =>
    buildLifemarkDeployUrl({
      projectName: project.name as string,
      projectId,
      appSlug,
      brandedSubdomain: ownerBranding?.branded_subdomain,
      brandedStatus: ownerBranding?.branded_status,
    });

  const projectFiles = (project.project_files as Array<{ path: string; content: string; language?: string }>) ?? [];

  // Publish-time security gate. The project security panel remains the place to
  // investigate and fix issues, but deployments must make an explicit decision
  // when a scan finds critical risks or personal data.
  //
  // Delegated to lib/security/publish-gate so this route and the chat publish path
  // enforce the SAME rule. They did not before: chat published with no scan at all,
  // and this gate tested only `severity === "critical"`, which no PII rule can
  // reach — so card numbers and SSNs were detected and then shipped anyway.
  const gate = evaluatePublishGate(projectFiles, {
    allowCritical: allowCriticalSecurityFindings,
    allowPii: allowPersonalDataFindings,
  });
  const securityFindings = gate.findings;
  if (gate.blocked) {
    return Response.json(publishGateResponseBody(gate), { status: 412 });
  }

  // Auto-snapshot current files for rollback capability
  const snapshotFiles = projectFiles.map((f) => ({
    path: (f as { path: string }).path,
    content: (f as { content: string }).content,
    language: (f as { language?: string }).language ?? "plaintext",
  }));
  let snapshotId: string | null = null;
  if (snapshotFiles.length > 0) {
    const { data: snap } = await supabase
      .from("project_snapshots")
      .insert({
        project_id: projectId,
        user_id: user.id,
        label: `Deploy snapshot · ${new Date().toLocaleString()}`,
        is_baseline: true,
        files: snapshotFiles,
        patches: null,
        parent_id: null,
      })
      .select("id")
      .single();
    snapshotId = snap?.id ?? null;
  }

  // Create deployment record (building state)
  const { data: deployment } = await supabase
    .from("deployments")
    .insert({
      project_id: projectId,
      user_id: user.id,
      status: "building",
      provider,
      snapshot_id: snapshotId,
      file_count: snapshotFiles.length,
    })
    .select()
    .single();

  if (!deployment) return Response.json({ error: "Failed to create deployment" }, { status: 500 });

  // ── Try Bull queue first (reliable, with retry + build logs) ──────────────
  const queue = process.env.DEPLOY_WORKER_ENABLED === "true" && provider === "lifemarkai" ? getDeployQueue() : null;
  if (queue) {
    await enqueueDeployJob({
      projectId,
      userId: user.id,
      deploymentId: deployment.id,
      provider: provider as "netlify" | "vercel" | "lifemarkai",
      // files intentionally omitted — the worker re-fetches them from the DB to
      // keep the Redis payload small and avoid stale snapshots.
      projectName: project.name as string,
      badgeHidden: (project as any).badge_hidden ?? false,
      traceparent: traceparent(createTraceContext(parseTraceparent(req.headers.get("traceparent")))),
    });
    logger.info("deploy.queued", { deploymentId: deployment.id, projectId, userId: user.id });
    return Response.json({
      deploymentId: deployment.id,
      status: "queued",
      url: lifemarkUrl(),
      message: "Deployment queued — you'll get a notification when it's live.",
    });
  }

  // ── Fallback: direct async (no Redis) ─────────────────────────────────────
  void (async () => {
    try {
      let deployedUrl: string;

      // Phase 4 — preview == deploy: try a real `vite build` (opt-in via
      // ENABLE_SERVER_VITE_BUILD); on success deploy the production dist/.
      let viteBuilt: Array<{ path: string; content: string }> | null = null;
      try {
        const { tryViteBuild } = await import("@/lib/deploy/build-project");
        const built = await tryViteBuild(projectFiles);
        if (built && built.length > 0) viteBuilt = built;
      } catch { /* fall back to static files */ }

      if (provider === "vercel" && VERCEL_TOKEN) {
        deployedUrl = await deployToVercel(project.name as string, projectId, projectFiles);
      } else if (provider === "netlify" && NETLIFY_TOKEN) {
        // ── Real Netlify deployment ──
        const site = await getOrCreateSite(projectId, project.name as string);
        const { data: ownerProfile } = await supabase
          .from("profiles")
          .select("referral_code")
          .eq("id", user.id)
          .single();
        const netlifyOpts = {
          projectId,
          projectName: project.name as string,
          badgeHidden: (project as any).badge_hidden ?? false,
          referralCode: ownerProfile?.referral_code ?? null,
          appSlug,
        };
        let fileMap = buildNetlifyFileMap(projectFiles, netlifyOpts);
        if (viteBuilt?.length) fileMap = mergeViteBuildAssets(fileMap, viteBuilt);
        deployedUrl = await deployToNetlify(site.id, fileMap);
      } else {
        // ── Self-hosted deployment (lifemarkai provider) ──
        //
        // This branch used to be a 2500ms sleep followed by `lifemarkUrl()`. It
        // reported success, wrote an {app_slug}.apps.lifemarkai.com URL to
        // projects.deployed_url, and produced nothing — every one of those URLs
        // led to a 503. Now it compiles the project and stores the output, and
        // the URL is only written if there is something behind it.
        const { publishBuild } = await import("@/lib/deploy/publish-build");
        const buildLog: string[] = [];
        const result = await publishBuild(projectId, projectFiles, (line) => {
          buildLog.push(line);
        });

        if (!result.ok) {
          // The failure reason goes in build_log, NOT an `error` column —
          // `deployments` has no such column, and writing to one that does not
          // exist makes PostgREST reject the whole update, so the row would
          // have stayed "building" forever with nothing recorded. Checked
          // against information_schema rather than assumed.
          await supabase
            .from("deployments")
            .update({
              status: "failed",
              build_log: [`[publish] FAILED: ${result.detail}`, ...buildLog]
                .join("\n")
                .slice(0, 20000),
            })
            .eq("id", deployment.id);
          logger.error("deploy.publish_failed", {
            deploymentId: deployment.id,
            projectId,
            detail: result.detail,
          });
          return;
        }

        await supabase
          .from("deployments")
          .update({ build_log: buildLog.join("\n").slice(0, 20000) })
          .eq("id", deployment.id);
        deployedUrl = lifemarkUrl();
      }

      // Update deployment record
      await supabase
        .from("deployments")
        .update({
          status: "live",
          url: deployedUrl,
          deployed_at: new Date().toISOString(),
        })
        .eq("id", deployment.id);

      // Update project record
      await supabase
        .from("projects")
        .update({ deployed_url: deployedUrl, status: "active" })
        .eq("id", projectId);

      // Send email notification
      if (user.email) {
        sendDeploymentEmail(user.email, project.name as string, deployedUrl).catch(
          () => {}
        );
      }
    } catch (err) {
      logger.error("deploy.failed", err instanceof Error ? err : new Error(String(err)), {
        deploymentId: deployment.id,
        projectId,
        userId: user.id,
        provider,
      });
      await supabase
        .from("deployments")
        .update({
          status: "failed",
          // build_log, not error_message. `error_message` is a field on NETLIFY's
          // status response (typed above), not a column on our deployments table -
          // which is how the wrong name got here. The update silently failed, so a
          // failed deploy kept its old status and looked stuck rather than errored.
          build_log: err instanceof Error ? err.message : "Unknown error",
        })
        .eq("id", deployment.id);
    }
  })();

  // Return immediately so the UI can poll for status
  const estimatedUrl =
    provider === "vercel" && VERCEL_TOKEN
      ? `https://lifemark-${projectId.slice(0, 12)}.vercel.app`
      : NETLIFY_TOKEN && provider === "netlify"
        ? `https://lifemark-${projectId.slice(0, 12)}.netlify.app`
        : lifemarkUrl();

  const providerLabel = provider === "vercel" ? "Vercel" : provider === "netlify" ? "Netlify" : "LifemarkAI";

  return Response.json({
    deploymentId: deployment.id,
    status: "building",
    url: estimatedUrl,
    provider,
    message: `Deploying to ${providerLabel}… this takes ~30 seconds.`,
  });
}


export const Route = createFileRoute("/api/deploy")({
  server: {
    handlers: {
      GET: async ({ request }) => handleGET(request),
      POST: async ({ request }) => handlePOST(request),
    },
  },
});
