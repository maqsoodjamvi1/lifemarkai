import { createFileRoute } from "@tanstack/react-router";
import { redeemPromoCode } from "@/lib/server-fns/billing-native";

/** Native /api/billing/redeem-promo — apply a Stripe promotion code (off the worker). */
export const Route = createFileRoute("/api/billing/redeem-promo")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { code?: string };
        const r = await redeemPromoCode({ code: body.code ?? "" });
        if (r.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (r.status === "error") return Response.json({ error: r.message }, { status: r.code });
        return Response.json({ message: r.message });
      },
    },
  },
});
