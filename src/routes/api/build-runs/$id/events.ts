/**
 * GET /api/build-runs/:id/events?after=<eventId> — Phase 6 reconnect/replay.
 *
 * The browser lost its SSE stream (laptop closed, network blip, deploy). It
 * comes back with the buildRunId it was watching and the id of the last event
 * it rendered; this returns everything after that cursor plus the run's
 * current status, so the UI can catch up and — if the run is still going —
 * keep polling. Closing the browser never cancels the build; cancellation is
 * an explicit POST to /api/build-runs/:id/cancel.
 *
 * Reads use the CALLER's session: RLS on build_runs/build_run_events already
 * restricts rows to the owner, so a stranger with a guessed run id gets an
 * empty result, not someone else's build.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";

export const Route = createFileRoute("/api/build-runs/$id/events")({
  server: {
    handlers: {
      GET: async ({ request, params }) => {
        const runId = (params as { id: string }).id;
        if (!/^run_[A-Za-z0-9_-]+$/.test(runId)) {
          return Response.json({ error: "Invalid run id" }, { status: 400 });
        }
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const after = Number(new URL(request.url).searchParams.get("after") ?? "0");
        const cursor = Number.isFinite(after) && after >= 0 ? Math.floor(after) : 0;

        // RLS scopes both queries to the caller's own runs.
        const { data: run } = await (supabase
          .from("build_runs")
          .select("id, status, mode, verification_passed, failure_code, started_at, completed_at")
          .eq("id", runId)
          .maybeSingle() as unknown as Promise<{
            data: Record<string, unknown> | null;
          }>);
        if (!run) return Response.json({ error: "Not found" }, { status: 404 });

        const { data: events } = await (supabase
          .from("build_run_events")
          .select("id, payload, created_at")
          .eq("run_id", runId)
          .gt("id", cursor)
          .order("id", { ascending: true })
          .limit(500) as unknown as Promise<{
            data: Array<{ id: number; payload: unknown; created_at: string }> | null;
          }>);

        return Response.json({
          run,
          events: events ?? [],
          nextCursor: events?.length ? events[events.length - 1].id : cursor,
        });
      },
    },
  },
});
