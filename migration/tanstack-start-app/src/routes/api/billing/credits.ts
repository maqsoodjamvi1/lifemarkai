import { createFileRoute } from "@tanstack/react-router";
import { getCredits } from "@/lib/server-fns/billing";
import { createCreditPackCheckout } from "@/lib/server-fns/billing-native";

/**
 * GET credits — native Start.
 * POST (Stripe pack checkout) — native via ported lib/stripe.
 */
export const Route = createFileRoute("/api/billing/credits")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const debugZeroCredits =
          request.headers.get("x-debug-zero-credits") === "1" ||
          (request.headers.get("referer") ?? "").includes("debugZeroCredits=1");
        const result = await getCredits({ debugZeroCredits });
        if (result.status === "unauthorized") {
          return Response.json({ error: "Unauthorized" }, { status: 401 });
        }
        return Response.json({
          credits: result.credits,
          plan: result.plan,
          teams: result.teams,
        });
      },
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { packKey?: string; teamId?: string };
        const appUrl = new URL(request.url).origin;
        const r = await createCreditPackCheckout({
          data: { packKey: body.packKey ?? "", teamId: body.teamId, appUrl },
        });
        if (r.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (r.status === "bad_request") return Response.json({ error: r.message }, { status: 400 });
        return Response.json({ url: r.url });
      },
    },
  },
});
