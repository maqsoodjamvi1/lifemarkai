import type { Job } from "bullmq";
import { createClient } from "@supabase/supabase-js";
import { publishBuild } from "@/lib/deploy/publish-build";
import { buildLifemarkDeployUrl } from "@/lib/deploy/branded-deploy-url";
import { logger } from "@/lib/logger";
import { parseTraceparent,withTraceSpan } from "@/lib/monitoring/tracing";
import { runJobOnce } from "./idempotency";
import type { DeployJobPayload } from "./client";

export async function processDeployJob(job: Job<DeployJobPayload>) {
  const payload = job.data;
  if (payload.provider !== "lifemarkai") {
    throw new Error(`Queued provider ${payload.provider} is unsupported; external providers must use the direct deployment path`);
  }

  const parent = parseTraceparent(payload.traceparent);
  return withTraceSpan("deploy.worker", {
    parent,
    attributes: { "job.id": String(job.id ?? ""), "deployment.id": payload.deploymentId, "project.id": payload.projectId },
  }, async () => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !serviceKey) throw new Error("Supabase service configuration is required");
    const supabase = createClient(supabaseUrl, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }) as any;
    const { data: deployment } = await supabase
      .from("deployments")
      .select("id,status,project_id,user_id")
      .eq("id", payload.deploymentId)
      .single();
    if (!deployment || deployment.project_id !== payload.projectId || deployment.user_id !== payload.userId) {
      throw new Error("Deployment job ownership check failed");
    }
    if (deployment.status === "live") return { status: "already-live" };

    // This handler used to do all its side effects unwrapped — despite
    // idempotency.ts's own doc comment using `consumer: "deploy-processor"`
    // as its canonical usage example. A BullMQ redelivery (the queue is
    // configured with attempts:3 + backoff) arriving after publishBuild
    // already ran, but before the final `deployments` row flipped to
    // "live", would re-run a real build and re-deploy. The status=="live"
    // check above is a cheap early-out for the common case but isn't a
    // claim — two concurrent deliveries can both read past it. runJobOnce's
    // claim-based insert is what actually makes a second delivery a no-op.
    const outcome = await runJobOnce(supabase, {
      consumer: "deploy-processor",
      idempotencyKey: `deploy:${payload.deploymentId}`,
      backend: "bullmq",
    }, async () => {
      const { data: project } = await supabase
        .from("projects")
        .select("*, project_files(*)")
        .eq("id", payload.projectId)
        .eq("user_id", payload.userId)
        .single();
      if (!project) throw new Error("Project not found");

      const files = (project.project_files ?? []) as Array<{ path: string; content: string; language?: string }>;
      const buildLog: string[] = [];
      try {
        await job.updateProgress(10);
        const result = await publishBuild(payload.projectId, files, (line) => buildLog.push(line));
        if (!result.ok) throw new Error(result.detail);

        const { data: owner } = await supabase
          .from("profiles")
          .select("branded_subdomain,branded_status")
          .eq("id", payload.userId)
          .single();
        const url = buildLifemarkDeployUrl({
          projectName: project.name,
          projectId: payload.projectId,
          appSlug: project.app_slug,
          brandedSubdomain: owner?.branded_subdomain,
          brandedStatus: owner?.branded_status,
        });

        const deployedAt = new Date().toISOString();
        const { error: deploymentError } = await supabase.from("deployments").update({
          status: "live", url, deployed_at: deployedAt, build_log: buildLog.join("\n").slice(0, 20000),
        }).eq("id", payload.deploymentId);
        if (deploymentError) throw deploymentError;
        const { error: projectError } = await supabase.from("projects").update({
          deployed_url: url, status: "active",
        }).eq("id", payload.projectId).eq("user_id", payload.userId);
        if (projectError) throw projectError;
        await job.updateProgress(100);
        logger.info("deploy.worker_live", { deploymentId: payload.deploymentId, projectId: payload.projectId, url });
        return { status: "live" as const, url };
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        await supabase.from("deployments").update({
          status: "failed", build_log: [`[worker] FAILED: ${detail}`, ...buildLog].join("\n").slice(0, 20000),
        }).eq("id", payload.deploymentId);
        logger.error("deploy.worker_failed", error instanceof Error ? error : new Error(detail), {
          deploymentId: payload.deploymentId, projectId: payload.projectId,
        });
        throw error;
      }
    });

    if (!outcome.ran) {
      logger.info("deploy.worker_dedup", { deploymentId: payload.deploymentId, skipped: outcome.skipped });
      return { status: outcome.skipped === "duplicate" ? "already-processed" : "in-flight" };
    }
    return outcome.result;
  });
}
