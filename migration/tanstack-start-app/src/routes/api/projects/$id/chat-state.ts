import { createFileRoute } from "@tanstack/react-router";
import { getChatState, patchChatState } from "@/lib/server-fns/chat-state";

function denied(result: { httpStatus: number; error: string }) {
  return Response.json({ error: result.error }, { status: result.httpStatus });
}

/** Native /api/projects/:id/chat-state */
export const Route = createFileRoute("/api/projects/$id/chat-state")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const result = await getChatState({ projectId: params.id });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "denied") return denied(result);
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        return Response.json(result.state);
      },
      PATCH: async ({ request, params }) => {
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const result = await patchChatState({
          projectId: params.id,
          pinned_message_id:
            "pinned_message_id" in body
              ? ((body.pinned_message_id as string | null) ?? null)
              : undefined,
          bookmarked_ids: Array.isArray(body.bookmarked_ids)
            ? (body.bookmarked_ids as string[])
            : undefined,
          prompt_queue: Array.isArray(body.prompt_queue)
            ? (body.prompt_queue as unknown[])
            : undefined,
          preview_annotations: Array.isArray(body.preview_annotations)
            ? (body.preview_annotations as unknown[])
            : undefined,
        });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "denied") return denied(result);
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 400 });
        }
        return Response.json(result.state);
      },
    },
  },
});
