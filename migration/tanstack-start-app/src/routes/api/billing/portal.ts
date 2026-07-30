import { createFileRoute } from "@tanstack/react-router";
import { createPortalSession } from "@/lib/server-fns/billing-native";

/** Native /api/billing/portal — Stripe billing portal (off the worker). */
export const Route = createFileRoute("/api/billing/portal")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const origin = request.headers.get("origin") ?? new URL(request.url).origin;
        const r = await createPortalSession({ data: { origin } });
        if (r.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (r.status === "bad_request") return Response.json({ error: r.message }, { status: 400 });
        return Response.json({ url: r.url });
      },
    },
  },
});
