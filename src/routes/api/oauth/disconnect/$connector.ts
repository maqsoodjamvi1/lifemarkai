import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/**
 * Native /api/oauth/disconnect/:connector — removes the signed-in user's
 * stored "connector gateway" token (src/routes/api/gateway/$connector/$.ts
 * reads the same oauth_tokens row this deletes).
 */
export const Route = createFileRoute("/api/oauth/disconnect/$connector")({
  server: {
    handlers: {
      DELETE: async ({ params }) => {
        const { connector } = params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        await supabase.from("oauth_tokens").delete().eq("user_id", user.id).eq("connector", connector);
        return Response.json({ ok: true });
      },
    },
  },
});
