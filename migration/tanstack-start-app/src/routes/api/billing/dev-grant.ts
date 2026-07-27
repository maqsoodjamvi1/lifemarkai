import { createFileRoute } from "@tanstack/react-router";
import { grantDevCredits } from "@/lib/server-fns/billing-native";

/** Native /api/billing/dev-grant — dev-only demo credit grant (off the worker). */
export const Route = createFileRoute("/api/billing/dev-grant")({
  server: {
    handlers: {
      POST: async () => {
        const r = await grantDevCredits();
        if (r.status === "forbidden") return Response.json({ error: "Forbidden" }, { status: 403 });
        if (r.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
        return Response.json({ credits: r.credits, ok: true });
      },
    },
  },
});
