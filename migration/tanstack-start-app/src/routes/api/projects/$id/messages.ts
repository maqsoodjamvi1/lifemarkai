import { createFileRoute } from "@tanstack/react-router";
import {
  clearMessages,
  listMessages,
  postMessages,
} from "@/lib/server-fns/messages";

function denied(result: { httpStatus: number; error: string }) {
  return Response.json({ error: result.error }, { status: result.httpStatus });
}

/** Native /api/projects/:id/messages */
export const Route = createFileRoute("/api/projects/$id/messages")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const result = await listMessages({
          data: {
            projectId: params.id,
            before: url.searchParams.get("before") ?? undefined,
            limit: url.searchParams.get("limit")
              ? Number(url.searchParams.get("limit"))
              : undefined,
          },
        });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "denied") return denied(result);
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 500 });
        }
        return Response.json({ messages: result.messages, hasMore: result.hasMore });
      },
      POST: async ({ request, params }) => {
        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }
        const result = await postMessages({
          data: {
            projectId: params.id,
            restore: body.restore === true,
            truncate: body.truncate === true,
            afterMessageId:
              typeof body.afterMessageId === "string" ? body.afterMessageId : undefined,
            fromCreatedAt:
              typeof body.fromCreatedAt === "string" ? body.fromCreatedAt : undefined,
            includePivot: body.includePivot !== false,
            messages: Array.isArray(body.messages) ? (body.messages as any) : undefined,
          },
        });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        if (result.status === "denied") return denied(result);
        if (result.status === "not_found") {
          return Response.json({ error: result.error }, { status: 404 });
        }
        if (result.status === "error") {
          return Response.json({ error: result.message }, { status: 400 });
        }
        if ("truncated" in result && result.truncated) {
          return Response.json({
            ok: true,
            truncated: true,
            deleted: result.deleted,
          });
        }
        if ("restored" in result) {
          return Response.json({ ok: true, restored: result.restored });
        }
        return Response.json({
          ok: true,
          assistantMessageId: result.assistantMessageId,
        });
      },
      DELETE: async ({ params }) => {
        const result = await clearMessages({ data: { projectId: params.id } });
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
