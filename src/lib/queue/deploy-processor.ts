import type { Job } from "bullmq";
import { createAdminClient } from "@/lib/supabase/server";
import { publishBuild } from "@/lib/deploy/publish-build";
import { buildLifemarkDeployUrl } from "@/lib/deploy/branded-deploy-url";
import { logger } from "@/lib/logger";
import { parseTraceparent,withTraceSpan } from "@/lib/monitoring/tracing";
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
    const supabase = createAdminClient() as any;
    const { data: deployment } = await supabase
      .from("deployments")
      .select("id,status,project_id,user_id")
      .eq("id", payload.deploymentId)
      .single();
    if (!deployment || deployment.project_id !== payload.projectId || deployment.user_id !== payload.userId) {
      throw new Error("Deployment job ownership check failed");
    }
    if (deployment.status === "live") return { status: "already-live" };

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
      return { status: "live", url };
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
}
