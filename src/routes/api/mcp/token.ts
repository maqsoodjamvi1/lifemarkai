import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

/** Native /api/mcp/token — get (GET) or rotate (POST) the user's MCP API token. */
export const Route = createFileRoute("/api/mcp/token")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const admin = createAdminClient();
        const { data } = await admin
          .from("profiles").select("mcp_api_token").eq("id", user.id).single();

        return Response.json({ token: data?.mcp_api_token ?? null });
      },

      POST: async () => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const admin = createAdminClient();
        const newToken = Array.from(crypto.getRandomValues(new Uint8Array(32)))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        await admin.from("profiles").update({ mcp_api_token: newToken }).eq("id", user.id);

        return Response.json({ token: newToken });
      },
    },
  },
});
