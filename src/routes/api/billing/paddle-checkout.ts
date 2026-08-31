import { createFileRoute } from "@tanstack/react-router";
import { createPaddleCheckout } from "@/lib/server-fns/billing-paddle";
import { isPaddleConfigured } from "@/lib/paddle/client";

/**
 * Native /api/billing/paddle-checkout — Paddle subscription checkout, the
 * second billing provider alongside /api/billing/checkout (Stripe).
 * GET reports whether Paddle is configured at all, so the billing UI can
 * show/hide the option honestly instead of offering a button that 500s
 * (same pattern as GET /api/tests/run's {available} check).
 */
export const Route = createFileRoute("/api/billing/paddle-checkout")({
  server: {
    handlers: {
      GET: async () => Response.json({ available: isPaddleConfigured() }),
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as {
          plan?: string;
          billing?: "monthly" | "yearly";
        };
        const appUrl = new URL(request.url).origin;
        const r = await createPaddleCheckout({ plan: body.plan ?? "", billing: body.billing, appUrl });
        if (r.status === "not_configured") return Response.json({ error: r.message }, { status: 503 });
        if (r.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (r.status === "bad_request") return Response.json({ error: r.message }, { status: 400 });
        return Response.json({ url: r.url });
      },
    },
  },
});
