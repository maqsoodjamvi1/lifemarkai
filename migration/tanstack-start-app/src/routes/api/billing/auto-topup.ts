import { createFileRoute } from "@tanstack/react-router";
import { getAutoTopup, updateAutoTopup } from "@/lib/server-fns/billing-auto-topup";

/** Native /api/billing/auto-topup — GET settings+card, POST multi-action (off the worker). */
export const Route = createFileRoute("/api/billing/auto-topup")({
  server: {
    handlers: {
      GET: async () => {
        const r = await getAutoTopup();
        if (r.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
        return Response.json({
          enabled: r.enabled,
          threshold: r.threshold,
          amount: r.amount,
          hasCard: r.hasCard,
          card: r.card,
        });
      },
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const r = await updateAutoTopup(body);
        if (r.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (r.status === "bad_request") return Response.json({ error: r.message }, { status: 400 });
        if (r.status === "client_secret") return Response.json({ clientSecret: r.clientSecret });
        return Response.json({ ok: true });
      },
    },
  },
});
