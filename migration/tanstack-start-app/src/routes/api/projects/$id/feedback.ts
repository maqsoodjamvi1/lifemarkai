import { createFileRoute } from "@tanstack/react-router";
import { listFeedback, submitFeedback } from "@/lib/server-fns/project-feedback";

/** Native /api/projects/:id/feedback — GET(owner list), POST(public submit). */
export const Route = createFileRoute("/api/projects/$id/feedback")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const r = await listFeedback({ projectId: params.id });
        if (r.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (r.status === "error") return Response.json({ error: r.message }, { status: 500 });
        return Response.json({ feedback: r.feedback });
      },
      POST: async ({ request, params }) => {
        const body = (await request.json().catch(() => ({}))) as {
          rating?: number;
          message?: string;
          page_url?: string;
        };
        const userAgent = request.headers.get("user-agent") ?? undefined;
        const r = await submitFeedback({ projectId: params.id, ...body, userAgent });
        if (r.status === "error") return Response.json({ error: r.message }, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
