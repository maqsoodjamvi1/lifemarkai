import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { getProjectAccess,canReadProjectFiles } from "@/lib/project/access";
import type { Database,Json } from "@/types/database";

/**
 * Native /api/projects/:id/mcp — owner-facing App-as-MCP config.
 *   GET → { enabled, token, actions, endpoint } · PUT → { enabled?, actions?, rotateToken? }
 * The public JSON-RPC surface lives at /api/apps/:id/mcp.
 */
function endpointFor(projectId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api/apps/${projectId}/mcp`;
}

export const Route = createFileRoute("/api/projects/$id/mcp")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { id } = params;
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const access = await getProjectAccess(supabase, id, user.id);
        if (!canReadProjectFiles(access)) return Response.json({ error: "Project not found" }, { status: 404 });

        const { data } = await supabase
          .from("app_mcp").select("enabled, token, actions").eq("project_id", id).maybeSingle();

        return Response.json({
          enabled: data?.enabled ?? false,
          token: data?.token ?? null,
          actions: data?.actions ?? [],
          endpoint: endpointFor(id),
        });
      },

      PUT: async ({ request, params }) => {
        const { id } = params;
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const access = await getProjectAccess(supabase, id, user.id);
        if (!canReadProjectFiles(access) || access === "viewer" || access === "public") {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        let body: { enabled?: boolean; actions?: unknown; rotateToken?: boolean };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const patch: Database["public"]["Tables"]["app_mcp"]["Insert"] = {
          project_id: id,
          actions: [],
          updated_at: new Date().toISOString(),
        };
        if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
        if (Array.isArray(body.actions)) patch.actions = body.actions as Json;
        if (body.rotateToken) {
          const bytes = new Uint8Array(24);
          crypto.getRandomValues(bytes);
          patch.token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
        }

        const { data, error } = await supabase
          .from("app_mcp")
          .upsert(patch, { onConflict: "project_id" })
          .select("enabled, token, actions")
          .maybeSingle();

        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json({
          enabled: data?.enabled ?? false,
          token: data?.token ?? null,
          actions: data?.actions ?? [],
          endpoint: endpointFor(id),
        });
      },
    },
  },
});
