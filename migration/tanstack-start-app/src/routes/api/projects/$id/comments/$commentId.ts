import { createFileRoute } from "@tanstack/react-router";
import { deleteComment,patchComment } from "@/lib/server-fns/comments";

function denied(result: { httpStatus: number; error: string }) {
  return Response.json({ error: result.error }, { status: result.httpStatus });
}

/** Native /api/projects/:id/comments/:commentId */
export const Route = createFileRoute("/api/projects/$id/comments/$commentId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const result = await patchComment({
          projectId: params.id,
          commentId: params.commentId,
          content: typeof body.content === "string" ? body.content : undefined,
          resolved:
            typeof body.resolved === "boolean" ? body.resolved : undefined,
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
        return Response.json(result.comment);
      },
      DELETE: async ({ params }) => {
        const result = await deleteComment({
          projectId: params.id,
          commentId: params.commentId,
        });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "denied") return denied(result);
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        return Response.json({ success: true });
      },
    },
  },
});
