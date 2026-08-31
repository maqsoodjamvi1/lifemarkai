import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/**
 * Native /api/oauth/status — which "connector gateway" accounts (see
 * src/routes/api/oauth/{start,callback}/$connector.ts and
 * src/routes/api/gateway/$connector/$.ts) the signed-in user has connected.
 *
 * This is account-level, not project-scoped (unlike the rest of the
 * connectors panel, which checks a project's own env vars) — there's no
 * project-scoped equivalent to check against, so the panel calls this
 * separately and merges the result in.
 */
export const Route = createFileRoute("/api/oauth/status")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data } = await supabase
          .from("oauth_tokens")
          .select("connector")
          .eq("user_id", user.id);

        return Response.json({ connectors: (data ?? []).map((r: { connector: string }) => r.connector) });
      },
    },
  },
});
