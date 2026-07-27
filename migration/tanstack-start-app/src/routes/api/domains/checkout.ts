import { createFileRoute } from "@tanstack/react-router";
import { createDomainCheckout } from "@/lib/server-fns/domains-purchase";

/** Native /api/domains/checkout — Stripe checkout for a domain purchase. */
export const Route = createFileRoute("/api/domains/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as any;
        const appUrl = new URL(request.url).origin;
        const r = await createDomainCheckout({ data: { ...body, appUrl } });
        if (r.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (r.status === "gated") return Response.json({ error: r.message, requiredPlan: r.requiredPlan }, { status: r.code });
        if (r.status === "unconfigured") return Response.json({ error: r.message }, { status: 501 });
        if (r.status === "bad_request") return Response.json({ error: r.message }, { status: 400 });
        if (r.status === "not_found") return Response.json({ error: "Project not found" }, { status: 404 });
        return Response.json({ url: r.url, sessionId: r.sessionId });
      },
    },
  },
});
