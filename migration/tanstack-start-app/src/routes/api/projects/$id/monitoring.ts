import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { getProjectAccess,canWriteProjectFiles } from "@/lib/project/access";

/**
 * Native /api/projects/:id/monitoring — project monitoring settings (Beta).
 * Stored in projects.metadata.monitoring = { enabled, cadence, last_run_at }.
 */
export const Route = createFileRoute("/api/projects/$id/monitoring")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const projectId = params.id;
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const access = await getProjectAccess(supabase, projectId, user.id);
        if (!canWriteProjectFiles(access)) return Response.json({ error: "Project not found" }, { status: 404 });

        const { data: project } = await supabase
          .from("projects").select("metadata").eq("id", projectId).single();
        const monitoring = ((project?.metadata ?? {}) as { monitoring?: unknown }).monitoring ?? { enabled: false, cadence: "daily" };
        return Response.json({ monitoring });
      },

      POST: async ({ request, params }) => {
        const projectId = params.id;
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const access = await getProjectAccess(supabase, projectId, user.id);
        if (!canWriteProjectFiles(access)) return Response.json({ error: "Project not found" }, { status: 404 });

        const { enabled, cadence } = (await request.json().catch(() => ({}))) as { enabled?: boolean; cadence?: string };
        if (typeof enabled !== "boolean") return Response.json({ error: "enabled (boolean) required" }, { status: 400 });
        const safeCadence = cadence === "weekly" ? "weekly" : "daily";

        const { data: project } = await supabase
          .from("projects").select("metadata").eq("id", projectId).single();
        const meta = (project?.metadata ?? {}) as Record<string, unknown>;
        const prev = (meta.monitoring ?? {}) as Record<string, unknown>;

        const nextMonitoring = { ...prev, enabled, cadence: safeCadence };
        await supabase
          .from("projects")
          .update({ metadata: { ...meta, monitoring: nextMonitoring } })
          .eq("id", projectId);

        return Response.json({ ok: true, monitoring: nextMonitoring });
      },
    },
  },
});
