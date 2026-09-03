import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { denyUnlessProjectAccess } from "@/lib/project/access";
import { resolveAppBackend } from "@/lib/cloud/project-backend";
import { queryManagedSql } from "@/lib/cloud/management";
import { getOrRefreshGatewayToken } from "@/lib/oauth/gateway-tokens";
import { queryUserSupabaseSql, supabaseRefFromProjectUrl } from "@/lib/cloud/user-supabase";

/**
 * POST /api/projects/:id/db-query — SQL against THIS project's backend only.
 *
 * The old playground called platform `exec_sql` (revoked in migration 181).
 * This route is the rebuilt per-project path: same runner as Cloud → Database.
 */
const BLOCKED_SQL_RE = /^\s*(drop\s+database|truncate\s+auth|delete\s+from\s+auth)/i;

export const Route = createFileRoute("/api/projects/$id/db-query")({
  server: {
    handlers: {
      POST: async ({ request, params }) => {
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const gate = await denyUnlessProjectAccess(supabase, params.id, user.id, "write");
        if ("error" in gate) return gate.error;

        const { data: project } = await supabase
          .from("projects")
          .select("id, user_id, environment, cloud_enabled, cloud_project_ref")
          .eq("id", params.id)
          .single();
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
        if (project.environment === "live") {
          return Response.json(
            { environment_locked: true, error: "Project is Live — switch to Test to run SQL." },
            { status: 423 },
          );
        }

        const body = (await request.json().catch(() => ({}))) as { sql?: string; query?: string };
        const sql = String(body.sql ?? body.query ?? "").trim();
        if (!sql) return Response.json({ error: "sql is required" }, { status: 400 });
        if (BLOCKED_SQL_RE.test(sql)) {
          return Response.json({ error: "This statement is blocked for safety." }, { status: 400 });
        }

        const backend = await resolveAppBackend(supabase, project);
        if (backend.kind === "none") {
          return Response.json({ error: "No backend connected. Enable Cloud or connect Supabase first." }, { status: 400 });
        }
        if (backend.kind === "cloud") {
          const res = await queryManagedSql(backend.ref, sql);
          if (!res.ok) return Response.json({ error: res.error }, { status: 502 });
          return Response.json({ ok: true, rows: res.rows ?? [] });
        }
        const ref = supabaseRefFromProjectUrl(backend.url);
        if (!ref) {
          return Response.json(
            { error: "Could not read a Supabase project ref from VITE_SUPABASE_URL." },
            { status: 400 },
          );
        }
        const token = await getOrRefreshGatewayToken(supabase, user.id, "supabase");
        if (!token) {
          return Response.json(
            { error: "Connect your Supabase account (Cloud → Connect existing) to run SQL on this project." },
            { status: 400 },
          );
        }
        const res = await queryUserSupabaseSql(token, ref, sql);
        if (!res.ok) return Response.json({ error: res.error }, { status: 502 });
        return Response.json({ ok: true, rows: res.rows ?? [] });
      },
    },
  },
});
