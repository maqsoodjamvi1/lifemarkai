import { createFileRoute } from "@tanstack/react-router";
import { createProject, listProjects } from "@/lib/server-fns/projects";

/**
 * Native /api/projects — more specific than /api/$ catch-all.
 * Dashboard create/list hit this without crossing to Next.
 */
export const Route = createFileRoute("/api/projects")({
  server: {
    handlers: {
      GET: async () => {
        const result = await listProjects();
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        return Response.json(result.projects);
      },
      POST: async ({ request }) => {
        let body: unknown = {};
        try {
          body = await request.json();
        } catch {
          body = {};
        }
        try {
          const result = await createProject({ data: body as any });
          if (result.status === "unauthorized") {
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          }
          if (result.status === "error") {
            return Response.json({ error: result.message }, { status: 400 });
          }
          return Response.json(result.project, { status: 201 });
        } catch (err) {
          const message = err instanceof Error ? err.message : "Invalid project input";
          return Response.json({ error: message }, { status: 400 });
        }
      },
    },
  },
});
