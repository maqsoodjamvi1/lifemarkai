import { createFileRoute } from "@tanstack/react-router";
import { searchDomains } from "@/lib/server-fns/domains";

/** Native /api/domains/search — registrar availability + price. */
export const Route = createFileRoute("/api/domains/search")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as { query?: string; years?: number };
        const r = await searchDomains({ query: body.query ?? "", years: body.years });
        if (r.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (r.status === "bad_request") return Response.json({ error: r.message }, { status: 400 });
        return Response.json(r.payload);
      },
    },
  },
});
