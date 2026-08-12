import { createFileRoute } from "@tanstack/react-router";
import { getPrivacy,updatePrivacy } from "@/lib/server-fns/account-privacy";

/** Native /api/account/privacy — GET prefs, PATCH updates. */
export const Route = createFileRoute("/api/account/privacy")({
  server: {
    handlers: {
      GET: async () => {
        const r = await getPrivacy();
        if (r.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
        return Response.json({
          training_opt_out: r.training_opt_out,
          analytics_opt_out: r.analytics_opt_out,
          marketing_emails: r.marketing_emails,
        });
      },
      PATCH: async ({ request }) => {
        const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
        const r = await updatePrivacy(body);
        if (r.status === "unauthorized") return Response.json({ error: "Unauthorized" }, { status: 401 });
        if (r.status === "noop") return Response.json({ error: "Nothing to update" }, { status: 400 });
        if (r.status === "error") return Response.json({ error: r.message }, { status: 500 });
        return Response.json(r.profile);
      },
    },
  },
});
