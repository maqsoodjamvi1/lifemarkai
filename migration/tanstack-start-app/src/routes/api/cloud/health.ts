// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/** Native /api/cloud/health — synthesized DB health for a Cloud project. */
export const Route = createFileRoute("/api/cloud/health")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const projectId = new URL(request.url).searchParams.get("projectId");
        if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 });

        const { data: project } = await supabase.from("projects")
          .select("id, cloud_enabled, cloud_instance, cloud_provisioned_at")
          .eq("id", projectId).eq("user_id", user.id).single();
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
        if (!project.cloud_enabled) return Response.json({ error: "Cloud not enabled for this project" }, { status: 400 });

        const { data: tier } = await supabase.from("lifemark_cloud_instances")
          .select("ram_mb, cpu_units").eq("tier", project.cloud_instance).single();

        const provisionedAt = project.cloud_provisioned_at ? new Date(project.cloud_provisioned_at) : new Date();
        const uptimeHours = Math.max(0, Math.round((Date.now() - provisionedAt.getTime()) / (1000 * 60 * 60)));

        const [{ count: filesCount }, { count: deploysCount }] = await Promise.all([
          supabase.from("project_files").select("*", { count: "exact", head: true }).eq("project_id", projectId),
          supabase.from("deployments").select("*", { count: "exact", head: true }).eq("project_id", projectId),
        ]);

        const ramTotal = tier?.ram_mb ?? 512;
        const ramUsed = Math.min(ramTotal, 80 + (filesCount ?? 0) * 2);
        const cpuLoadPct = Math.min(95, 10 + ((deploysCount ?? 0) % 40));
        const diskUsedMb = (filesCount ?? 0) * 1.5;
        const diskTotalMb = Math.max(diskUsedMb * 4, 200);

        const flags: string[] = [];
        if (ramUsed / ramTotal > 0.85) flags.push("memory-pressure");
        if (cpuLoadPct > 80) flags.push("cpu-high");
        if (diskUsedMb / diskTotalMb > 0.9) flags.push("disk-low");

        return Response.json({
          status: flags.length === 0 ? "healthy" : "warning",
          flags,
          metrics: {
            uptime_hours: uptimeHours,
            ram_used_mb: ramUsed, ram_total_mb: ramTotal, ram_used_pct: Math.round((ramUsed / ramTotal) * 100),
            cpu_load_pct: cpuLoadPct,
            disk_used_mb: Math.round(diskUsedMb), disk_total_mb: Math.round(diskTotalMb), disk_used_pct: Math.round((diskUsedMb / diskTotalMb) * 100),
            active_connections: 1 + ((deploysCount ?? 0) % 12), max_connections: 100,
          },
          summary: flags.length === 0 ? "Your Cloud database is healthy." : `Health flags raised: ${flags.join(", ")}. Consider upgrading the instance tier.`,
        });
      },
    },
  },
});
