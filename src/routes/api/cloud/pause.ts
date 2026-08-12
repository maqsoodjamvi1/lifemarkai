import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { isManagementConfigured,pauseManagedProject,restoreManagedProject } from "@/lib/cloud/management";
import type { Json } from "@/types/database";

/** Native /api/cloud/pause — manually pause/wake a project's Cloud backend. */
export const Route = createFileRoute("/api/cloud/pause")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { projectId, action } = (await request.json().catch(() => ({}))) as { projectId?: string; action?: "pause" | "wake" };
        if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 });
        if (action !== "pause" && action !== "wake") return Response.json({ error: 'action must be "pause" or "wake"' }, { status: 400 });

        const { data: project } = await supabase.from("projects")
          .select("id, cloud_enabled, cloud_status, cloud_project_ref, metadata")
          .eq("id", projectId).eq("user_id", user.id).single();
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
        if (!project.cloud_enabled) return Response.json({ error: "Cloud is not enabled for this project" }, { status: 400 });

        if (action === "pause" && project.cloud_status === "paused") return Response.json({ ok: true, status: "paused", message: "Already paused" });
        if (action === "wake" && project.cloud_status !== "paused") return Response.json({ ok: true, status: project.cloud_status, message: "Not paused" });

        let infraNote: string | undefined;
        if (project.cloud_project_ref && isManagementConfigured()) {
          const res = action === "pause" ? await pauseManagedProject(project.cloud_project_ref) : await restoreManagedProject(project.cloud_project_ref);
          if (!res.ok) infraNote = res.error;
        }

        const meta: { [key: string]: Json | undefined } =
          project.metadata && typeof project.metadata === "object" && !Array.isArray(project.metadata)
            ? project.metadata
            : {};
        await supabase.from("projects").update({
          cloud_status: action === "pause" ? "paused" : "active",
          metadata: {
            ...meta,
            cloud_paused_manually: action === "pause",
            cloud_paused_idle: action === "pause" ? Boolean(meta.cloud_paused_idle) : false,
            cloud_paused_at: action === "pause" ? new Date().toISOString() : null,
          },
        }).eq("id", projectId);

        return Response.json({ ok: true, status: action === "pause" ? "paused" : "active", ...(infraNote ? { note: `Infrastructure call: ${infraNote}` } : {}) });
      },
    },
  },
});
