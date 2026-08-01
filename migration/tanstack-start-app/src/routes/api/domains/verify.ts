import { createFileRoute } from "@tanstack/react-router";
import { verifyDomain } from "@/lib/server-fns/domains";

/** Native /api/domains/verify — DNS resolution check + mark verified. */
export const Route = createFileRoute("/api/domains/verify")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { domain?: string; projectId?: string };
        const r = await verifyDomain({ domain: body.domain ?? "", projectId: body.projectId ?? "" });
        if (r.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (r.status === "bad_request") return Response.json({ error: r.message }, { status: 400 });
        if (r.status === "not_found") return Response.json({ error: "Project not found" }, { status: 404 });
        return Response.json(r.payload);
      },
    },
  },
});
