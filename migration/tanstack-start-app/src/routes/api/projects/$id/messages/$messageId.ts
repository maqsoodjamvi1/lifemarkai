import { createFileRoute } from "@tanstack/react-router";
import { deleteMessage, patchMessage } from "@/lib/server-fns/messages";

function denied(result: { httpStatus: number; error: string }) {
  return Response.json({ error: result.error }, { status: result.httpStatus });
}

/** Native /api/projects/:id/messages/:messageId */
export const Route = createFileRoute("/api/projects/$id/messages/$messageId")({
  server: {
    handlers: {
      PATCH: async ({ request, params }) => {
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const result = await patchMessage({
            projectId: params.id,
            messageId: params.messageId,
            rating:
              body.rating === 1 || body.rating === -1 || body.rating === null
                ? (body.rating as 1 | -1 | null)
                : undefined,
            metadata:
              "metadata" in body
                ? ((body.metadata as Record<string, unknown> | null) ?? null)
                : undefined,
            mergeMetadata: body.mergeMetadata !== false,
          });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "denied") return denied(result);
        if (result.status === "not_found") {
          return Response.json({ error: "Message not found" }, { status: 404 });
        }
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 400 });
        }
        return Response.json({ ok: true, message: result.message });
      },
      DELETE: async ({ params }) => {
        const result = await deleteMessage({ projectId: params.id, messageId: params.messageId });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "denied") return denied(result);
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        return Response.json({ ok: true });
      },
    },
  },
});
