// @ts-nocheck
/**
 * Deploy Worker — processes jobs from the lifemarkai:deploy queue.
 *
 * Run as a separate long-lived process:
 *   node -r ts-node/register lib/queue/deploy-worker.ts
 *
 * Or with the pm2 ecosystem: add a second app entry pointing to this file.
 */
import type { Job } from "bullmq";
import { createWorker, QUEUES, type DeployJobPayload } from "./client";
import { buildDeployIndexHtml, buildNetlifyFileMap, buildVercelFilesList } from "@/lib/deploy/build-deploy-files";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Insert a notification row directly. The previous code enqueued onto
 * `lifemarkai:notification`, but no worker consumes that queue, so deploy
 * notifications were never delivered. The worker already holds an admin client.
 */
async function notify(
  supabase: Awaited<ReturnType<typeof createAdminClient>>,
  row: { userId: string; type: string; title: string; body?: string; link?: string; metadata?: Record<string, unknown> }
): Promise<void> {
  try {
    await supabase.from("notifications").insert({
      user_id: row.userId,
      type: row.type,
      title: row.title,
      body: row.body ?? null,
      link: row.link ?? null,
      metadata: row.metadata ?? null,
    });
  } catch {
    // Best-effort — never fail a deploy because a notification couldn't be written.
  }
}

/** Deploy a flat file list to Vercel and poll until ready. Ported from /api/deploy. */
async function deployToVercel(
  projectName: string,
  projectId: string,
  files: Array<{ path: string; content: string }>
): Promise<string> {
  const VERCEL_TOKEN = process.env.VERCEL_TOKEN;
  if (!VERCEL_TOKEN) throw new Error("VERCEL_TOKEN not set");
  const VERCEL_API = "https://api.vercel.com";

  const vercelFiles = buildVercelFilesList(files, { projectId, projectName });

  const res = await fetch(`${VERCEL_API}/v13/deployments`, {
    method: "POST",
    headers: { Authorization: `Bearer ${VERCEL_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: `lifemark-${projectId.slice(0, 12)}`,
      files: vercelFiles,
      projectSettings: { framework: null, buildCommand: null, outputDirectory: null },
      target: "production",
    }),
  });
  if (!res.ok) throw new Error(`Vercel API ${res.status}: ${await res.text()}`);

  type VercelDeployment = { id: string; url: string; readyState: string; alias?: string[] };
  const deploy = (await res.json()) as VercelDeployment;
  const deadline = Date.now() + 120_000;
  let liveUrl = `https://${deploy.url}`;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const statusRes = await fetch(`${VERCEL_API}/v13/deployments/${deploy.id}`, {
      headers: { Authorization: `Bearer ${VERCEL_TOKEN}` },
    });
    if (!statusRes.ok) break;
    const status = (await statusRes.json()) as VercelDeployment;
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

async function processDeployJob(job: Job<DeployJobPayload>): Promise<{ url: string }> {
  const { projectId, userId, deploymentId, provider, projectName, badgeHidden } = job.data;
  const supabase = await createAdminClient();

  // Look up the owner's referral code so the injected badge credits them when a
  // visitor signs up from the deployed app (the built-in growth loop).
  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("referral_code")
    .eq("id", userId)
    .single();

  // Re-fetch authoritative files from the DB. The payload may carry them
  // (back-compat) but the DB is the source of truth and keeps Redis jobs small.
  let files = job.data.files ?? [];
  if (files.length === 0) {
    const { data } = await supabase
      .from("project_files")
      .select("path, content")
      .eq("project_id", projectId);
    files = (data as Array<{ path: string; content: string }>) ?? [];
  }
  if (files.length === 0) {
    throw new Error(`No files found for project ${projectId}`);
  }

  // Mark deployment as building
  await supabase.from("deployments").update({ status: "building" }).eq("id", deploymentId);
  await job.log(`Starting ${provider} deployment for project ${projectId}`);

  let deployedUrl = "";

  try {
    if (provider === "netlify" && process.env.NETLIFY_AUTH_TOKEN) {
      const NETLIFY_TOKEN = process.env.NETLIFY_AUTH_TOKEN;
      const NETLIFY_API = "https://api.netlify.com/api/v1";

      const netlifyFetch = async <T>(path: string, opts: RequestInit = {}): Promise<T> => {
        const res = await fetch(`${NETLIFY_API}${path}`, {
          ...opts,
          headers: {
            Authorization: `Bearer ${NETLIFY_TOKEN}`,
            "Content-Type": "application/json",
            ...opts.headers,
          },
        });
        if (!res.ok) throw new Error(`Netlify API ${res.status}: ${await res.text()}`);
        return res.json() as Promise<T>;
      };

      // Get or create Netlify site
      const siteName = `lifemark-${projectId.slice(0, 12)}`;
      let siteId: string;

      await job.log("Fetching Netlify site...");
      await job.updateProgress(10);

      type NetlifySite = { id: string; name: string; ssl_url: string };
      const sites = await netlifyFetch<NetlifySite[]>(`/sites?name=${encodeURIComponent(siteName)}`);
      const existing = sites.find((s) => s.name === siteName);

      if (existing) {
        siteId = existing.id;
      } else {
        const newSite = await netlifyFetch<NetlifySite>("/sites", {
          method: "POST",
          body: JSON.stringify({ name: siteName }),
        });
        siteId = newSite.id;
      }

      // Build file map
      await job.log("Building file map...");
      await job.updateProgress(30);

      const fileMap = buildNetlifyFileMap(files, {
        projectId,
        projectName,
        badgeHidden: badgeHidden ?? false,
        referralCode: ownerProfile?.referral_code ?? null,
      });

      // Deploy to Netlify
      await job.log("Uploading to Netlify...");
      await job.updateProgress(50);

      type NetlifyDeploy = { id: string; state: string; ssl_url: string; url: string; error_message?: string };
      const deploy = await netlifyFetch<NetlifyDeploy>(`/sites/${siteId}/deploys`, {
        method: "POST",
        body: JSON.stringify({ files: fileMap, async: true }),
      });

      // Poll for completion
      const deadline = Date.now() + 90_000;
      let progress = 60;
      deployedUrl = deploy.ssl_url || deploy.url;

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 4000));
        const status = await netlifyFetch<NetlifyDeploy>(`/deploys/${deploy.id}`);
        progress = Math.min(progress + 5, 90);
        await job.updateProgress(progress);
        await job.log(`Deploy state: ${status.state}`);

        if (status.state === "ready") {
          deployedUrl = status.ssl_url || status.url || deployedUrl;
          break;
        }
        if (status.state === "error") {
          throw new Error(status.error_message ?? "Netlify build failed");
        }
      }
    } else if (provider === "vercel" && process.env.VERCEL_TOKEN) {
      await job.log("Uploading to Vercel...");
      await job.updateProgress(40);
      deployedUrl = await deployToVercel(projectName, projectId, files);
      await job.updateProgress(90);
    } else if (process.env.NODE_ENV === "production") {
      // No real provider configured — fail loudly rather than return a fake
      // "live" URL. A fabricated URL is the single biggest trust-killer here.
      throw new Error(
        `No deploy provider configured for "${provider}". Set NETLIFY_AUTH_TOKEN or VERCEL_TOKEN.`
      );
    } else {
      // Non-production only: simulate so local dev without tokens still works.
      await new Promise((r) => setTimeout(r, 2000));
      deployedUrl = `https://lifemark-${projectId.slice(0, 8)}.lifemarkai.app`;
      await job.log("Simulated deployment (dev mode — no deploy token configured)");
    }

    // Mark done in DB
    await supabase.from("deployments").update({
      status: "live",
      url: deployedUrl,
      deployed_at: new Date().toISOString(),
    }).eq("id", deploymentId);

    await supabase.from("projects").update({
      status: "active",
      deployed_url: deployedUrl,
    }).eq("id", projectId);

    await job.updateProgress(100);
    await job.log(`✅ Deployment live at ${deployedUrl}`);

    // Send in-app notification
    await notify(supabase, {
      userId,
      type: "deploy_success",
      title: "Deployment live!",
      body: `${projectName} is now available at ${deployedUrl}`,
      link: `/editor/${projectId}`,
      metadata: { deploymentId, url: deployedUrl },
    });

    return { url: deployedUrl };
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    const attempt = job.attemptsMade + 1;
    const maxAttempts = job.opts.attempts ?? 1;
    await job.log(`❌ Deploy attempt ${attempt}/${maxAttempts} failed: ${msg}`);

    // Only finalize (mark failed + notify the user) once retries are exhausted —
    // otherwise an attempt-1 failure that later succeeds would send the user a
    // spurious "failed" notification before the "live" one.
    if (attempt >= maxAttempts) {
      await supabase.from("deployments").update({
        status: "failed",
        build_log: msg,
      }).eq("id", deploymentId);

      await notify(supabase, {
        userId,
        type: "deploy_failed",
        title: "Deployment failed",
        body: msg,
        link: `/editor/${projectId}`,
      });
    }

    // Re-throw so BullMQ retries until attempts are exhausted.
    throw error;
  }
}

// Start the worker
const worker = createWorker<DeployJobPayload>(QUEUES.deploy, processDeployJob);

if (worker) {
  console.log("🚀 Deploy worker started, waiting for jobs...");
  process.on("SIGTERM", async () => {
    console.log("Shutting down deploy worker...");
    await worker.close();
    process.exit(0);
  });
} else {
  console.warn("⚠️  Redis not configured — deploy worker not started");
  process.exit(0);
}
