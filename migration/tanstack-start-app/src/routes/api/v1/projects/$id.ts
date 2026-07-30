// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateApiRequest } from "@/lib/api/api-key";

/**
 * Native /api/v1/projects/:id — public API single project.
 *   GET → project metadata + file count   (scope: projects:read)
 */
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export const Route = createFileRoute("/api/v1/projects/$id")({
  server: {
    handlers: {
      OPTIONS: async () => new Response(null, { status: 204, headers: CORS }),

      GET: async ({ request, params }) => {
        const auth = await authenticateApiRequest(request, "projects:read");
        if (!auth.ok) return Response.json({ error: auth.error }, { status: auth.status, headers: CORS });

        const { id } = params;
        const supabase = createAdminClient();

        const { data: project } = await supabase
          .from("projects")
          .select(
            "id, name, description, framework, status, deployed_url, preview_url, cloud_enabled, cloud_status, created_at, updated_at",
          )
          .eq("id", id)
          .eq("user_id", auth.userId)
          .single();

        if (!project) return Response.json({ error: "Project not found" }, { status: 404, headers: CORS });

        const { count } = await supabase
          .from("project_files")
          .select("id", { count: "exact", head: true })
          .eq("project_id", id);

        return Response.json({ project: { ...project, file_count: count ?? 0 } }, { headers: CORS });
      },
    },
  },
});
