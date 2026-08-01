import { createFileRoute } from "@tanstack/react-router";
import {
  deleteProject,
  getProject,
  updateProject,
} from "@/lib/server-fns/projects";

/** Native /api/projects/:id — GET / PATCH / DELETE (Start-owned). */
export const Route = createFileRoute("/api/projects/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const result = await getProject({ id: params.id });
        if (result.status === "not_found") {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json(result.project);
      },
      PATCH: async ({ request, params }) => {
        let patch: Record<string, unknown> = {};
        try {
          patch = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const result = await updateProject({ id: params.id, patch });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "not_found") {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        if (result.status === "forbidden") {
          return Response.json({ error: result.message }, { status: 403 });
        }
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 400 });
        }
        return Response.json(result.project);
      },
      DELETE: async ({ params }) => {
        const result = await deleteProject({ id: params.id });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "not_found") {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        return Response.json({ success: true });
      },
    },
  },
});
