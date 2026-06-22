// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { buildDeployIndexHtml, buildNetlifyFileMap, buildVercelFilesList } from "@/lib/deploy/build-deploy-files";
import { buildLifemarkDeployUrl } from "@/lib/deploy/branded-deploy-url";
import { NextRequest, NextResponse } from "next/server";
import { sendDeploymentEmail } from "@/lib/email/resend";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { enqueueDeployJob, getDeployQueue } from "@/lib/queue/client";
import { logger } from "@/lib/logger";

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
  } catch {}

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
  const deadline = Date.now() + 60_000;
  let liveUrl = deploy.ssl_url || deploy.url || "";

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const status = await netlifyFetch<NetlifyDeploy>(
      `/deploys/${deploy.id}`
    );
    if (status.state === "ready") {
      liveUrl = status.ssl_url || status.url || liveUrl;
      break;
    }
    if (status.state === "error") {
      throw new Error(status.error_message ?? "Netlify build failed");
    }
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

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(`${VERCEL_API}/v13/deployments/${deployId}`, {
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
    });
    if (!statusRes.ok) break;
    const status = await statusRes.json() as VercelDeployment;
    if (status.readyState === "READY") {
      liveUrl = status.alias?.[0] ? `https://${status.alias[0]}` : `https://${status.url}`;
      break;
    }
    if (status.readyState === "ERROR" || status.readyState === "CANCELED") {
      throw new Error("Vercel deployment failed");
    }
  }

  return liveUrl;
}

// ── Route handlers ─────────────────────────────────────────────────────────

/** GET /api/deploy?projectId=<id> — list deploy history for a project */
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  // Verify ownership
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const { data, error } = await (supabase as any)
    .from("deployments")
    .select("id, status, url, provider, snapshot_id, file_count, commit_sha, deployed_at, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data ?? []);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rl = await rateLimitAsync(user.id, RATE_LIMITS.deploy);
  if (!rl.success) {
    return NextResponse.json(
      { error: "Too many deployments. Please wait before deploying again." },
      { status: 429, headers: { "X-RateLimit-Reset": String(rl.resetAt) } }
    );
  }

  const { projectId, provider = "netlify" } = await req.json();

  // Fetch project + files
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("*, project_files(*)")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { data: ownerBranding } = await (supabase as any)
    .from("profiles")
    .select("branded_subdomain, branded_status")
    .eq("id", user.id)
    .single();

  const lifemarkUrl = () =>
    buildLifemarkDeployUrl({
      projectName: project.name as string,
      projectId,
      brandedSubdomain: ownerBranding?.branded_subdomain,
      brandedStatus: ownerBranding?.branded_status,
    });

  const projectFiles = (project.project_files as Array<{ path: string; content: string; language?: string }>) ?? [];

  // Auto-snapshot current files for rollback capability
  const snapshotFiles = projectFiles.map((f) => ({
    path: (f as { path: string }).path,
    content: (f as { content: string }).content,
    language: (f as { language?: string }).language ?? "plaintext",
  }));
  let snapshotId: string | null = null;
  if (snapshotFiles.length > 0) {
    const { data: snap } = await (supabase as any)
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
  const { data: deployment } = await (supabase as any)
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

  if (!deployment) return NextResponse.json({ error: "Failed to create deployment" }, { status: 500 });

  // ── Try Bull queue first (reliable, with retry + build logs) ──────────────
  const queue = getDeployQueue();
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
    });
    logger.info("deploy.queued", { deploymentId: deployment.id, projectId, userId: user.id });
    return NextResponse.json({
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
      let deployProjectFiles = projectFiles;
      try {
        const { tryViteBuild } = await import("@/lib/deploy/build-project");
        const built = await tryViteBuild(projectFiles);
        if (built && built.length > 0) deployProjectFiles = built as typeof projectFiles;
      } catch { /* fall back to static files */ }

      if (provider === "vercel" && VERCEL_TOKEN) {
        // ── Real Vercel deployment ──
        deployedUrl = await deployToVercel(project.name as string, projectId, deployProjectFiles);
      } else if (provider === "netlify" && NETLIFY_TOKEN) {
        // ── Real Netlify deployment ──
        const site = await getOrCreateSite(projectId, project.name as string);
        const { data: ownerProfile } = await (supabase as any)
          .from("profiles")
          .select("referral_code")
          .eq("id", user.id)
          .single();
        const fileMap = buildNetlifyFileMap(deployProjectFiles, {
          projectId,
          projectName: project.name as string,
          badgeHidden: (project as any).badge_hidden ?? false,
          referralCode: ownerProfile?.referral_code ?? null,
        });
        deployedUrl = await deployToNetlify(site.id, fileMap);
      } else {
        // ── Simulated deployment (fallback / lifemarkai provider) ──
        await new Promise((r) => setTimeout(r, 2500));
        deployedUrl = lifemarkUrl();
      }

      // Update deployment record
      await (supabase as any)
        .from("deployments")
        .update({
          status: "live",
          url: deployedUrl,
          deployed_at: new Date().toISOString(),
        })
        .eq("id", deployment.id);

      // Update project record
      await (supabase as any)
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
      await (supabase as any)
        .from("deployments")
        .update({
          status: "failed",
          error_message: err instanceof Error ? err.message : "Unknown error",
        } as Record<string, unknown>)
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

  return NextResponse.json({
    deploymentId: deployment.id,
    status: "building",
    url: estimatedUrl,
    provider,
    message: `Deploying to ${providerLabel}… this takes ~30 seconds.`,
  });
}

