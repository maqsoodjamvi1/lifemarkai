import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";

/**
 * Native /api/projects/:id/app-errors — read and triage visitor errors from a
 * PUBLISHED app (migration 158).
 *
 * Deliberately uses the request-scoped client, NOT the admin client: RLS on
 * app_error_events already encodes exactly who may see a project's errors (owner,
 * or accepted collaborator). Re-implementing that check here would be a second
 * copy of an access rule, and the two copies drift - the class of bug that made
 * `member_group_members` deny every group grant earlier in this project. Letting
 * RLS decide means an unauthorised caller simply sees an empty list.
 *
 * GET   → { errors: [...], total, unresolved }
 * PATCH → { id, resolved } marks one group resolved / unresolved
 * DELETE ?errorId= → removes a group permanently
 */
export const Route = createFileRoute("/api/projects/$id/app-errors")({
  server: {
    handlers: {
      GET: async ({ params, request }) => {
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const sp = new URL(request.url).searchParams;
        const includeResolved = sp.get("includeResolved") === "true";

        let q = supabase
          .from("app_error_events")
          .select("id, message, stack, path, browser, occurrences, first_seen, last_seen, resolved_at")
          .eq("project_id", params.id)
          .order("last_seen", { ascending: false })
          .limit(200);

        if (!includeResolved) q = q.is("resolved_at", null);

        const { data, error } = await q;
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const errors = data ?? [];
        return Response.json({
          errors,
          total: errors.length,
          unresolved: errors.filter((e) => !e.resolved_at).length,
          // Occurrences matter more than group count: 3 groups seen 900 times is a
          // very different situation from 3 groups seen 3 times, and the summary
          // line should not flatten that.
          occurrences: errors.reduce((n, e) => n + (e.occurrences ?? 0), 0),
        });
      },

      PATCH: async ({ params, request }) => {
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        let body: Record<string, unknown> = {};
        try {
          body = (await request.json()) as Record<string, unknown>;
        } catch {
          return Response.json({ error: "Invalid JSON" }, { status: 400 });
        }

        const errorId = typeof body.errorId === "string" ? body.errorId : null;
        if (!errorId) return Response.json({ error: "errorId required" }, { status: 400 });
        const resolved = body.resolved !== false;

        const { error } = await supabase
          .from("app_error_events")
          .update({ resolved_at: resolved ? new Date().toISOString() : null })
          .eq("id", errorId)
          .eq("project_id", params.id);

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true, resolved });
      },

      DELETE: async ({ params, request }) => {
        const supabase = await createClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const errorId = new URL(request.url).searchParams.get("errorId");
        if (!errorId) return Response.json({ error: "errorId required" }, { status: 400 });

        const { error } = await supabase
          .from("app_error_events")
          .delete()
          .eq("id", errorId)
          .eq("project_id", params.id);

        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ ok: true });
      },
    },
  },
});
