/**
 * POST /api/build-runs/:id/cancel — Phase 6 explicit cancellation.
 *
 * Closing the browser must NOT cancel a durable build; this endpoint is the
 * one deliberate way to stop one. It marks the run 'cancelled' (the terminal
 * transition is conditional on status='running', so it cannot overwrite a
 * completed/failed state that landed first) and appends a cancellation event
 * for any client that replays later.
 *
 * The in-request pilot cannot abort mid-flight work synchronously; the running
 * handler observes the terminal status at its next step boundary. What this
 * guarantees today is the CONSISTENT TERMINAL STATE the plan requires.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getServerUser } from "@/lib/supabase/server-user";

export const Route = createFileRoute("/api/build-runs/$id/cancel")({
  server: {
    handlers: {
      POST: async ({ params }) => {
        const runId = (params as { id: string }).id;
        if (!/^run_[A-Za-z0-9_-]+$/.test(runId)) {
          return Response.json({ error: "Invalid run id" }, { status: 400 });
        }
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        // Ownership via the user's own session + RLS.
        const { data: runData } = await supabase
          .from("build_runs")
          .select("id, status")
          .eq("id", runId)
          .maybeSingle();
        // Migration 175 is newer than the checked-in generated PostgREST
        // contract. Keep the boundary cast local until database types are
        // regenerated against an environment containing that migration.
        const run = runData as { id: string; status: "running" | "completed" | "failed" | "cancelled" } | null;
        if (!run) return Response.json({ error: "Not found" }, { status: 404 });
        if (run.status !== "running") {
          return Response.json({ ok: true, status: run.status, alreadyTerminal: true });
        }

        // Writes need the service role (RLS allows owners SELECT only).
        const admin = createAdminClient();
        await (admin.from("build_runs") as any)
          .update({ status: "cancelled", completed_at: new Date().toISOString(), failure_code: "user_cancelled" })
          .eq("id", runId)
          .eq("status", "running");
        await (admin.from("build_run_events") as any).insert({
          run_id: runId,
          payload: { cancelled: true, by: "user" },
        });
        return Response.json({ ok: true, status: "cancelled" });
      },
    },
  },
});
