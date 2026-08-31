import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getOrRefreshGatewayToken } from "@/lib/oauth/gateway-tokens";
import { listUserSupabaseProjects } from "@/lib/cloud/user-supabase";

/**
 * Native /api/supabase-connect/projects — lists the signed-in user's own
 * Supabase projects (via their connected "supabase" gateway OAuth token, see
 * /api/oauth/start/$connector), so they can pick one to link to a Lifemark
 * project instead of provisioning a new one through Lifemark Cloud.
 */
export const Route = createFileRoute("/api/supabase-connect/projects")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const token = await getOrRefreshGatewayToken(supabase, user.id, "supabase");
        if (!token) {
          return Response.json(
            { error: "Not connected. Connect your Supabase account first." },
            { status: 403 },
          );
        }

        const result = await listUserSupabaseProjects(token);
        if (!result.ok) {
          return Response.json({ error: result.error ?? "Failed to list Supabase projects" }, { status: 502 });
        }
        return Response.json({ projects: result.projects });
      },
    },
  },
});
