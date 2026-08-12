import { createFileRoute } from "@tanstack/react-router";
import { githubSync } from "@/lib/server-fns/github";

/** Native /api/github/sync — create/push/pull/pr/status against a repo (off the worker). */
export const Route = createFileRoute("/api/github/sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { projectId?: string; action?: string };
        const r = await githubSync({ projectId: body.projectId ?? "", action: body.action ?? "" });
        switch (r.status) {
          case "unauthorized":
            return Response.json({ error: "Unauthorized" }, { status: 401 });
          case "not_connected":
            return Response.json({ error: "GitHub not connected" }, { status: 400 });
          case "not_found":
            return Response.json({ error: "Project not found" }, { status: 404 });
          case "no_repo":
            return Response.json({ error: "No GitHub repo connected" }, { status: 400 });
          case "unknown_action":
            return Response.json({ error: "Unknown action" }, { status: 400 });
          default:
            return Response.json(r.payload);
        }
      },
    },
  },
});
