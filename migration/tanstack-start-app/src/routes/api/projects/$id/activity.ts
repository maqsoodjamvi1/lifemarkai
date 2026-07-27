import { createFileRoute } from "@tanstack/react-router";
import { getProjectActivity, ingestProjectActivity } from "@/lib/server-fns/project-activity";

/** Native /api/projects/:id/activity — GET(unified feed), POST(ingest event). */
export const Route = createFileRoute("/api/projects/$id/activity")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const url = new URL(request.url);
        const limit = parseInt(url.searchParams.get("limit") ?? "30", 10);
        const offset = parseInt(url.searchParams.get("offset") ?? "0", 10);
        const r = await getProjectActivity({ data: { projectId: params.id, limit, offset } });
        if (r.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (r.status === "not_found") return Response.json({ error: "Not found" }, { status: 404 });
        return Response.json({ events: r.events, total: r.total });
      },
      POST: async ({ request, params }) => {
        const body = (await request.json().catch(() => ({}))) as {
          type?: string;
          title?: string;
          detail?: string;
          meta?: Record<string, unknown>;
        };
        const r = await ingestProjectActivity({
          data: { projectId: params.id, type: body.type ?? "", title: body.title ?? "", detail: body.detail, meta: body.meta },
        });
        if (r.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (r.status === "not_found") return Response.json({ error: "Not found" }, { status: 404 });
        if (r.status === "bad_request") return Response.json({ error: "Missing fields" }, { status: 400 });
        return Response.json({ ok: true });
      },
    },
  },
});
