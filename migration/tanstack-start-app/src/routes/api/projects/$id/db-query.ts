// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/** Native /api/projects/:id/db-query — owner-only SQL playground via exec_sql RPC. */
const BLOCKED = /^\s*(drop|truncate|delete\s+from\s+auth|alter\s+table|create\s+user|grant|revoke|pg_terminate_backend)\b/i;

export const Route = createFileRoute("/api/projects/$id/db-query")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const { id } = params;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data: project } = await (supabase as any)
          .from("projects").select("id, user_id").eq("id", id).single();
        if (!project || (project as any).user_id !== user.id) {
          return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        const body = (await request.json()) as { sql?: string };
        const sql = body.sql?.trim();
        if (!sql) return Response.json({ error: "No SQL provided" }, { status: 400 });
        if (BLOCKED.test(sql)) {
          return Response.json({ error: "This statement type is not allowed in the playground." }, { status: 400 });
        }

        try {
          const { data, error } = await (supabase as any).rpc("exec_sql", { query: sql });
          if (error) return Response.json({ error: error.message }, { status: 400 });
          const rows = Array.isArray(data) ? data : (data ? [data] : []);
          return Response.json({ rows });
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Query failed";
          return Response.json({ error: message }, { status: 500 });
        }
      },
    },
  },
});
