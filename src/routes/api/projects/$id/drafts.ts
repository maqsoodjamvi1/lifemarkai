import { createFileRoute } from "@tanstack/react-router";
import { createProjectDraft,listProjectDrafts } from "@/lib/server-fns/drafts";

/** Native /api/projects/:id/drafts — list sibling drafts / branch a new one. */
export const Route = createFileRoute("/api/projects/$id/drafts")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const result = await listProjectDrafts({ projectId: params.id });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "not_found") {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        return Response.json({ rootId: result.rootId, drafts: result.drafts });
      },
      POST: async ({ params }) => {
        const result = await createProjectDraft({ projectId: params.id });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "not_found") {
          return Response.json({ error: "Not found" }, { status: 404 });
        }
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        return Response.json({ draft: result.draft }, { status: 201 });
      },
    },
  },
});
