import { createFileRoute } from "@tanstack/react-router";
import { toggleProjectStar, getProjectStar } from "@/lib/server-fns/project-social";

/** Native /api/projects/:id/star — POST toggles a community star, GET reads state. */
export const Route = createFileRoute("/api/projects/$id/star")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const r = await toggleProjectStar({ data: { projectId: params.id } });
        if (r.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (r.status === "not_found") {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        if (r.status === "forbidden") {
          return Response.json({ error: "Project is not public" }, { status: 403 });
        }
        return Response.json({ starred: r.starred, count: r.count });
      },
      GET: async ({ params }) => {
        const r = await getProjectStar({ data: { projectId: params.id } });
        return Response.json({ starred: r.starred, count: r.count });
      },
    },
  },
});
