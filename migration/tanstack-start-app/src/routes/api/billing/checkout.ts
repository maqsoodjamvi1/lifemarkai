import { createFileRoute } from "@tanstack/react-router";
import { createSubscriptionCheckout } from "@/lib/server-fns/billing-native";

/** Native /api/billing/checkout — Stripe subscription checkout (off the worker). */
export const Route = createFileRoute("/api/billing/checkout")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          plan?: string;
          billing?: "monthly" | "yearly";
        };
        const appUrl = new URL(request.url).origin;
        const r = await createSubscriptionCheckout({
          data: { plan: body.plan ?? "", billing: body.billing, appUrl },
        });
        if (r.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (r.status === "bad_request") return Response.json({ error: r.message }, { status: 400 });
        return Response.json({ url: r.url });
      },
    },
  },
});
