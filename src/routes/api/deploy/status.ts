import { createFileRoute } from "@tanstack/react-router";
import { getDeployStatus } from "@/lib/server-fns/deploy-status";

/** Native /api/deploy/status */
export const Route = createFileRoute("/api/deploy/status")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const projectId = url.searchParams.get("projectId");
        if (!projectId) {
          return Response.json({ error: "projectId required" }, { status: 400 });
        }
        const result = await getDeployStatus({ projectId });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "not_found") {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        return Response.json({
          status: result.deployStatus,
          url: result.url,
          deployedAt: result.deployedAt,
          error: result.error,
        });
      },
    },
  },
});
