import { createFileRoute } from "@tanstack/react-router";
import { entriConnect } from "@/lib/server-fns/domains";

/** Native /api/domains/entri — connect-existing-domain flow (Entri or manual DNS). */
export const Route = createFileRoute("/api/domains/entri")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { projectId?: string; domain?: string };
        const r = await entriConnect({ data: { projectId: body.projectId ?? "", domain: body.domain ?? "" } });
        if (r.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (r.status === "bad_request") return Response.json({ error: r.message }, { status: 400 });
        if (r.status === "not_found") return Response.json({ error: "Project not found" }, { status: 404 });
        return Response.json(r.payload);
      },
    },
  },
});
