import { createFileRoute } from "@tanstack/react-router";
import { upsertPinComment, deletePinComment } from "@/lib/server-fns/comments";

function denied(result: { httpStatus: number; error: string }) {
  return Response.json({ error: result.error }, { status: result.httpStatus });
}

/**
 * Native /api/projects/:id/comments/pin — upsert/delete a single preview pin
 * (src/components/editor/preview-annotations.tsx), keyed by a client-chosen
 * client_id rather than the server row id, so the click-to-annotate UI can
 * create AND edit a pin through the same call without first waiting on a
 * round trip to learn a server-assigned id.
 */
export const Route = createFileRoute("/api/projects/$id/comments/pin")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const clientId = typeof body.client_id === "string" ? body.client_id : "";
        const content = typeof body.content === "string" ? body.content : "";
        const pinX = typeof body.pin_x === "number" ? body.pin_x : NaN;
        const pinY = typeof body.pin_y === "number" ? body.pin_y : NaN;
        if (!clientId || !content.trim() || !Number.isFinite(pinX) || !Number.isFinite(pinY)) {
          return Response.json(
            { error: "client_id, content, pin_x and pin_y are required" },
            { status: 400 },
          );
        }
        if (content.length > 4000) {
          return Response.json({ error: "Comment too long (max 4000 chars)" }, { status: 400 });
        }

        const result = await upsertPinComment({
          projectId: params.id,
          clientId,
          content,
          pinX,
          pinY,
          pinColor: typeof body.pin_color === "string" ? body.pin_color : "yellow",
          resolved: body.resolved === true,
        });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "denied") return denied(result);
        if (result.status === "bad_request") {
          return Response.json({ error: result.error }, { status: 400 });
        }
        if (result.status === "not_supported") {
          // Migration 185 hasn't run on this database yet — the caller
          // falls back to its own local cache rather than treating this
          // as a hard failure.
          return Response.json({ error: "Pin comments not supported" }, { status: 501 });
        }
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        return Response.json(result.comment, { status: 201 });
      },
      DELETE: async ({ request, params }) => {
        const clientId = new URL(request.url).searchParams.get("client_id") ?? "";
        if (!clientId) {
          return Response.json({ error: "client_id is required" }, { status: 400 });
        }
        const result = await deletePinComment({ projectId: params.id, clientId });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "denied") return denied(result);
        if (result.status === "not_supported") {
          return Response.json({ error: "Pin comments not supported" }, { status: 501 });
        }
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        return Response.json({ success: true });
      },
    },
  },
});
