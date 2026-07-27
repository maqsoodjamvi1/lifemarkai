import { createFileRoute } from "@tanstack/react-router";
import { deleteEnvVar } from "@/lib/server-fns/env";

/** Native DELETE /api/projects/:id/env/:key */
export const Route = createFileRoute("/api/projects/$id/env/$key")({
  server: {
    handlers: {
      DELETE: async ({ params }) => {
        const result = await deleteEnvVar({
          data: { projectId: params.id, key: params.key },
        });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "not_found") {
          return Response.json({ error: "Project not found" }, { status: 404 });
        }
        return Response.json({ ok: true, key: result.key, deleted: result.deleted });
      },
    },
  },
});
