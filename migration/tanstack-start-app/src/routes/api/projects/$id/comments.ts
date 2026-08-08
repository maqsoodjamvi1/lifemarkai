import { createFileRoute } from "@tanstack/react-router";
import { createComment,listComments } from "@/lib/server-fns/comments";

function denied(result: { httpStatus: number; error: string }) {
  return Response.json({ error: result.error }, { status: result.httpStatus });
}

/** Native /api/projects/:id/comments */
export const Route = createFileRoute("/api/projects/$id/comments")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const result = await listComments({ projectId: params.id });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "denied") return denied(result);
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        return Response.json(result.comments);
      },
      POST: async ({ request, params }) => {
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const content = typeof body.content === "string" ? body.content : "";
        if (!content.trim()) {
          return Response.json({ error: "Content is required" }, { status: 400 });
        }
        if (content.length > 4000) {
          return Response.json(
            { error: "Comment too long (max 4000 chars)" },
            { status: 400 },
          );
        }
        const result = await createComment({
          projectId: params.id,
          content,
          parent_id:
            typeof body.parent_id === "string" ? body.parent_id : null,
          element_xpath:
            typeof body.element_xpath === "string" ? body.element_xpath : null,
          element_tag:
            typeof body.element_tag === "string" ? body.element_tag : null,
          page_path: typeof body.page_path === "string" ? body.page_path : null,
          element_preview:
            typeof body.element_preview === "string"
              ? body.element_preview
              : null,
        });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "denied") return denied(result);
        if (result.status === "bad_request") {
          return Response.json({ error: result.error }, { status: 400 });
        }
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        return Response.json(result.comment, { status: 201 });
      },
    },
  },
});
