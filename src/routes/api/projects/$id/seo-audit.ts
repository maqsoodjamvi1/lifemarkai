import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { auditProject } from "@/lib/seo/audit";

/** Native /api/projects/:id/seo-audit — static on-page SEO audit (owner/collab). */
export const Route = createFileRoute("/api/projects/$id/seo-audit")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const projectId = params.id;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data: project } = await supabase
          .from("projects").select("id, user_id").eq("id", projectId).single();
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

        if (user.id !== project.user_id) {
          const { data: collab } = await supabase
            .from("collaborators").select("role").eq("project_id", projectId).eq("user_id", user.id).single();
          if (!collab) return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        const { data: files } = await supabase
          .from("project_files").select("path, content").eq("project_id", projectId);

        const result = auditProject((files ?? []) as Array<{ path: string; content: string }>);
        return Response.json({
          scannedAt: new Date().toISOString(),
          fileCount: (files ?? []).length,
          ...result,
        });
      },
    },
  },
});
