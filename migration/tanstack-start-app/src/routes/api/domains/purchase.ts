import { createFileRoute } from "@tanstack/react-router";
import { purchaseDomainDirect } from "@/lib/server-fns/domains-purchase";

/** Native /api/domains/purchase — direct registrar registration. */
export const Route = createFileRoute("/api/domains/purchase")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as any;
        const r = await purchaseDomainDirect({ data: body });
        if (r.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (r.status === "gated") return Response.json({ error: r.message, requiredPlan: r.requiredPlan }, { status: r.code });
        if (r.status === "unconfigured") return Response.json({ error: r.message }, { status: 501 });
        if (r.status === "bad_request") return Response.json({ error: r.message }, { status: 400 });
        if (r.status === "not_found") return Response.json({ error: "Project not found" }, { status: 404 });
        if (r.status === "registrar_error") return Response.json({ error: r.message }, { status: 502 });
        return Response.json(r.result);
      },
    },
  },
});
