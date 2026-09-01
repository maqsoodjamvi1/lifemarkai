/**
 * Publish-from-chat helper (Lovable "ship it" parity).
 *
 * The deploy pipeline in `app/api/deploy/route.ts` is inline-only (its Netlify
 * helpers aren't exported), so this module replicates its direct/fallback path
 * 1:1 — reusing everything that IS exported (`buildNetlifyFileMap`,
 * `buildLifemarkDeployUrl`, `tryViteBuild`, `sendDeploymentEmail`) — but runs
 * SYNCHRONOUSLY so the chat route can stream progress and hand the user a live
 * URL in the same SSE response. It intentionally skips the Bull queue: the
 * queue path is fire-and-forget (URL arrives later via notification), which
 * doesn't fit a chat turn that must end with "your app is live at <url>".
 *
 * Keep this in lockstep with routes/api/deploy.ts if the deploy flow changes.
 *
 * SECURITY GATE. Because this module deploys directly instead of calling the
 * deploy route, it originally ran no security scan at all — "publish it" in chat
 * shipped code the Publish button would have refused with a 412. Both paths now
 * call `evaluatePublishGate` from lib/security/publish-gate, which is the single
 * definition of what blocks a publish. If you add a check, add it there, not here.
 */

import { evaluatePublishGate } from "../security/publish-gate.ts";
import { buildNetlifyFileMap, mergeViteBuildAssets } from "./build-deploy-files.ts";
import { buildLifemarkDeployUrl } from "./branded-deploy-url.ts";
import { sendDeploymentEmail } from "../email/resend.ts";
import { logger } from "../logger.ts";

// ── Netlify helpers (mirrored from app/api/deploy/route.ts — not exported there) ──

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

async function netlifyFetch<T>(path: string, opts: RequestInit = {}): Promise<T> {
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

/** Get or create a Netlify site for this project (stable name from project id). */
async function getOrCreateSite(projectId: string): Promise<NetlifySite> {
  const siteName = `lifemark-${projectId.slice(0, 12)}`;
  try {
    const sites = await netlifyFetch<NetlifySite[]>(
      `/sites?name=${encodeURIComponent(siteName)}`
    );
    const existing = sites.find((s) => s.name === siteName);
    if (existing) return existing;
  } catch {
    // site lookup is best-effort; creation below will handle the fallback.
  }
  return netlifyFetch<NetlifySite>("/sites", {
    method: "POST",
    body: JSON.stringify({ name: siteName, custom_domain: null }),
  });
}

/** Deploy files to a Netlify site and wait for it to go live (max 60s poll). */
async function deployToNetlify(
  siteId: string,
  fileMap: Record<string, string>
): Promise<string> {
  const deploy = await netlifyFetch<NetlifyDeploy>(`/sites/${siteId}/deploys`, {
    method: "POST",
    body: JSON.stringify({ files: fileMap, async: true }),
  });

  const deadline = Date.now() + 60_000;
  let liveUrl = deploy.ssl_url || deploy.url || "";

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 3000));
    const status = await netlifyFetch<NetlifyDeploy>(`/deploys/${deploy.id}`);
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

// ── Public API ─────────────────────────────────────────────────────────────

export interface PublishFromChatResult {
  ok: boolean;
  url?: string;
  deploymentId?: string;
  provider: "netlify" | "lifemarkai";
  fileCount: number;
  error?: string;
}

export interface PublishFromChatOptions {
  /** Supabase client already scoped to the caller (user client or admin for API-key auth). */
  supabase: unknown;
  projectId: string;
  userId: string;
  /** Progress callback — each string is streamed to the chat client. */
  emit?: (status: string) => void;
}

/**
 * Publish a project's current files, synchronously. Never throws — failures
 * come back as `{ ok: false, error }` so the chat route can render a friendly
 * "Publish failed: …" assistant message instead of a naked exception.
 */
export async function publishProjectFromChat(
  opts: PublishFromChatOptions
): Promise<PublishFromChatResult> {
  const { projectId, userId } = opts;
  const supabase = opts.supabase as any;
  const emit = opts.emit ?? (() => {});
  const provider: "netlify" | "lifemarkai" = NETLIFY_TOKEN ? "netlify" : "lifemarkai";

  let deploymentId: string | undefined;
  let fileCount = 0;

  try {
    // Fetch project + files (ownership-scoped, same as the deploy route)
    const { data: project } = await supabase
      .from("projects")
      .select("*, project_files(*)")
      .eq("id", projectId)
      .eq("user_id", userId)
      .single();

    if (!project) {
      return { ok: false, provider, fileCount: 0, error: "Project not found" };
    }

    const projectFiles =
      (project.project_files as Array<{ path: string; content: string; language?: string }>) ?? [];
    fileCount = projectFiles.length;
    if (projectFiles.length === 0) {
      return { ok: false, provider, fileCount: 0, error: "This project has no files to publish yet — build something first." };
    }

    // ── Security gate ─────────────────────────────────────────────────────────
    // This path talks to Netlify directly rather than going through
    // routes/api/deploy.ts, so it inherited none of that route's checks: asking
    // the agent to publish shipped code the Publish button would have refused.
    // Same shared gate now, so the two cannot diverge again.
    //
    // No override is accepted here on purpose. Overriding a security block is a
    // decision a user makes by looking at findings and choosing to accept them;
    // it is not something to infer from a chat message like "publish it". If the
    // gate trips, the user is told what and where, and can accept the risk from
    // the Publish panel where the findings are visible.
    const gate = evaluatePublishGate(projectFiles);
    if (gate.blocked) {
      const where = gate.blocking
        .slice(0, 3)
        .map((f) => `${f.title} (${f.file}:${f.line})`)
        .join("; ");
      const more = gate.blocking.length > 3 ? ` +${gate.blocking.length - 3} more` : "";
      emit(`Publish blocked by the security gate (${gate.reasons.join(", ")}).`);
      return {
        ok: false,
        provider,
        fileCount,
        error: `${gate.message} Found: ${where}${more}`,
      };
    }

    const { data: ownerProfile } = await supabase
      .from("profiles")
      .select("branded_subdomain, branded_status, referral_code, email")
      .eq("id", userId)
      .single();

    // Ensure a unique app_slug so the URL is a CLEAN slug host; generate lazily
    // if missing (builder falls back to the id-embedded host on failure).
    let appSlug: string | null = (project as { app_slug?: string | null }).app_slug ?? null;
    if (!appSlug) {
      try {
        const { data: gen } = await supabase.rpc("generate_app_slug", {
          p_name: (project as { name?: string }).name ?? "app",
        });
        if (typeof gen === "string" && gen) {
          appSlug = gen;
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
        brandedSubdomain: ownerProfile?.branded_subdomain,
        brandedStatus: ownerProfile?.branded_status,
      });

    // Auto-snapshot current files for rollback capability
    emit("Snapshotting current version…");
    const snapshotFiles = projectFiles.map((f) => ({
      path: f.path,
      content: f.content,
      language: f.language ?? "plaintext",
    }));
    let snapshotId: string | null = null;
    const { data: snap } = await supabase
      .from("project_snapshots")
      .insert({
        project_id: projectId,
        user_id: userId,
        label: `Publish snapshot · ${new Date().toLocaleString()}`,
        is_baseline: true,
        files: snapshotFiles,
        patches: null,
        parent_id: null,
      })
      .select("id")
      .single();
    snapshotId = snap?.id ?? null;

    // Create deployment record (building state)
    const { data: deployment } = await supabase
      .from("deployments")
      .insert({
        project_id: projectId,
        user_id: userId,
        status: "building",
        provider,
        snapshot_id: snapshotId,
        file_count: snapshotFiles.length,
      })
      .select()
      .single();
    if (!deployment) {
      return { ok: false, provider, fileCount, error: "Failed to create deployment record" };
    }
    deploymentId = deployment.id as string;

    // Preview == deploy: try a real `vite build` when opted in (same as deploy route)
    let viteBuilt: typeof projectFiles | null = null;
    try {
      const { tryViteBuild } = await import("@/lib/deploy/build-project");
      const built = await tryViteBuild(projectFiles);
      if (built && built.length > 0) viteBuilt = built as typeof projectFiles;
    } catch {
      /* fall back to static files */
    }

    let deployedUrl: string;
    if (provider === "netlify") {
      emit("Uploading to Netlify…");
      const site = await getOrCreateSite(projectId);
      const netlifyOpts = {
        projectId,
        projectName: project.name as string,
        badgeHidden: (project as { badge_hidden?: boolean }).badge_hidden ?? false,
        referralCode: ownerProfile?.referral_code ?? null,
        appSlug: (project as { app_slug?: string | null }).app_slug ?? null,
      };
      let fileMap = buildNetlifyFileMap(projectFiles, netlifyOpts);
      if (viteBuilt?.length) fileMap = mergeViteBuildAssets(fileMap, viteBuilt);
      emit("Waiting for the site to go live…");
      deployedUrl = await deployToNetlify(site.id, fileMap);
    } else {
      // Lifemark-hosted deployment (fallback / lifemarkai provider) — mirrors
      // routes/api/deploy.ts's own lifemarkai branch. This used to be a
      // 2.5s sleep followed by `lifemarkUrl()`: it reported success, wrote
      // an {app_slug}.apps.lifemarkai.com URL to projects.deployed_url, and
      // published nothing — no build, no stored files, nothing for that URL
      // to serve. Whenever NETLIFY_AUTH_TOKEN isn't configured, every chat
      // "ship it" took this branch and told the user "Your app is live!"
      // while the URL 503'd. Now it runs the same real build+store pipeline
      // as the deploy route (publishBuild → vite build when applicable,
      // stored via storeBuild's compare-and-swap live flip) before the URL
      // is ever handed back.
      emit("Building your app…");
      const { publishBuild } = await import("@/lib/deploy/publish-build");
      const result = await publishBuild(projectId, projectFiles, (line) => emit(line));
      if (!result.ok) {
        await supabase
          .from("deployments")
          .update({ status: "failed", build_log: `[publish] FAILED: ${result.detail}` })
          .eq("id", deploymentId);
        return { ok: false, deploymentId, provider, fileCount, error: result.detail };
      }
      deployedUrl = lifemarkUrl();
    }

    // Update deployment + project records
    await supabase
      .from("deployments")
      .update({ status: "live", url: deployedUrl, deployed_at: new Date().toISOString() })
      .eq("id", deploymentId);
    await supabase
      .from("projects")
      .update({ deployed_url: deployedUrl, status: "active" })
      .eq("id", projectId);

    // Email notification (fire-and-forget, same as deploy route)
    if (ownerProfile?.email) {
      sendDeploymentEmail(ownerProfile.email, project.name as string, deployedUrl).catch(() => {});
    }

    logger.info("deploy.from_chat.live", { deploymentId, projectId, userId, provider, url: deployedUrl });
    return { ok: true, url: deployedUrl, deploymentId, provider, fileCount };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(
      "deploy.from_chat.failed",
      err instanceof Error ? err : new Error(message),
      { deploymentId, projectId, userId, provider }
    );
    if (deploymentId) {
      await supabase
        .from("deployments")
        // build_log, not error_message - the latter is not a column, so this update
        // silently failed and a failed deploy was never marked failed. It kept its
        // previous status forever, which is why builds could appear stuck rather
        // than errored.
        .update({ status: "failed", build_log: message })
        .eq("id", deploymentId)
        .then(() => {}, () => {});
    }
    return { ok: false, deploymentId, provider, fileCount, error: message };
  }
}
