import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/**
 * Native /api/projects/:id/db-query — SQL playground, DISABLED.
 *
 * CRITICAL SECURITY ISSUE (see supabase/migrations/20260828020000_181_lockdown_exec_sql.sql
 * for the full writeup): `exec_sql` is SECURITY DEFINER and runs arbitrary
 * caller-supplied SQL against this project's actual shared Postgres
 * database — the same instance holding `profiles`, `auth.users`,
 * `project_files`, `messages`, `project_secrets`, etc. across every
 * LifemarkAI user. The only "ownership" check ever done was that the
 * caller owned the `projectId` in the request body; the SQL text itself
 * was never scoped to that project's own tables, so any signed-in user
 * could (and the panel's own EXAMPLE_QUERIES demonstrated how to) read
 * every other user's email, every other project's files, and every
 * chat message on the platform. Worse, the RPC grant was to the
 * `authenticated` Postgres role, so a user's own session JWT could call
 * it directly against Supabase's REST API, bypassing this route (and its
 * BLOCKED-statement check) entirely.
 *
 * The DB-level migration revokes the ability to call exec_sql at all.
 * This route now fails closed rather than erroring confusingly once that
 * grant is gone — re-enabling this feature needs a real per-project data
 * scoping design (e.g. a genuinely isolated per-project schema/database),
 * not a resurrected version of this route.
 */
export const Route = createFileRoute("/api/projects/$id/db-query")({
  server: {
    handlers: {
      POST: async () => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        return Response.json(
          {
            error:
              "The DB query playground is temporarily disabled: it allowed reading data across every project on the platform, not just this one. It will return once it's rebuilt with real per-project scoping.",
          },
          { status: 503 },
        );
      },
    },
  },
});
