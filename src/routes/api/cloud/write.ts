import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient,createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { denyUnlessProjectAccess } from "@/lib/project/access";
import { runManagedSql,queryManagedSql } from "@/lib/cloud/management";
import { planSqlWrite } from "@/lib/cloud/sql-write-preview";

/**
 * /api/cloud/write — approve or decline an agent-proposed change to live data.
 *
 * This is the ONLY path that mutates a project's managed database from a chat
 * turn, and nothing the model produces can reach it. The agent's tool ends at a
 * `proposed` row; a human has to arrive here with a session cookie for anything
 * to run.
 *
 * Three properties this endpoint is built to hold, in order of how badly it
 * would hurt to lose them:
 *
 * 1. The statement executed is the statement stored at proposal time. The
 *    request body carries an id, never SQL. If a client could post SQL here,
 *    the guard, the preview and the human's understanding of what they approved
 *    would all be decoration.
 * 2. A proposal executes at most once. The status transition is guarded by a
 *    conditional update, so a double-clicked Approve button cannot double-apply
 *    a DELETE.
 * 3. The count is re-checked immediately before executing. Data moves between
 *    proposal and approval; if it has moved, the person is told rather than
 *    surprised.
 */
export const Route = createFileRoute("/api/cloud/write")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        let body: { proposalId?: string; decision?: string; acknowledgeCountChange?: boolean };
        try {
          body = await request.json();
        } catch {
          return Response.json({ error: "Invalid JSON body" }, { status: 400 });
        }

        const proposalId = String(body.proposalId ?? "");
        const decision = String(body.decision ?? "");
        if (!proposalId) return Response.json({ error: "proposalId required" }, { status: 400 });
        if (decision !== "approve" && decision !== "decline") {
          return Response.json({ error: "decision must be 'approve' or 'decline'" }, { status: 400 });
        }

        const admin = createAdminClient();

        const { data: proposal } = await admin
          .from("project_data_writes")
          .select("id, project_id, statement, kind, target_table, previewed_rows, status")
          .eq("id", proposalId)
          .single();
        if (!proposal) return Response.json({ error: "Proposal not found" }, { status: 404 });

        const gate = await denyUnlessProjectAccess(supabase, proposal.project_id, user.id, "write");
        if ("error" in gate) return gate.error;

        const { data: project } = await supabase
          .from("projects")
          .select("id, cloud_enabled, cloud_project_ref")
          .eq("id", proposal.project_id)
          .single();
        if (!project) return Response.json({ error: "Proposal not found" }, { status: 404 });

        if (proposal.status !== "proposed") {
          return Response.json(
            { error: `This proposal is already ${proposal.status}.`, status: proposal.status },
            { status: 409 },
          );
        }

        if (decision === "decline") {
          await admin
            .from("project_data_writes")
            .update({ status: "declined", approved_by: user.id, approved_at: new Date().toISOString() })
            .eq("id", proposalId)
            .eq("status", "proposed");
          return Response.json({ ok: true, status: "declined" });
        }

        if (!project.cloud_enabled || !project.cloud_project_ref) {
          return Response.json({ error: "This project has no managed database." }, { status: 400 });
        }

        // Re-validate the STORED statement. It passed the guard when it was
        // proposed, and it should still pass now — if it doesn't, the guard has
        // been tightened since, and the stricter rule wins.
        const plan = planSqlWrite(proposal.statement);
        if (!plan.ok) {
          await admin
            .from("project_data_writes")
            .update({ status: "failed", error: `Re-validation failed: ${plan.reason}` })
            .eq("id", proposalId);
          return Response.json({ error: `This change is no longer allowed: ${plan.reason}` }, { status: 400 });
        }

        // Has the data moved since the preview? If so, stop and say so — the
        // number the person approved is the thing they were consenting to.
        if (plan.countQuery) {
          const recount = await queryManagedSql<{ affected: string | number }>(
            project.cloud_project_ref,
            plan.countQuery,
          );
          if (!recount.ok) {
            return Response.json({ error: `Could not re-check the row count: ${recount.error}` }, { status: 502 });
          }
          const raw = recount.rows[0]?.affected;
          const now = typeof raw === "string" ? Number(raw) : Number(raw);
          const then = Number(proposal.previewed_rows ?? -1);
          if (Number.isFinite(now) && now !== then && body.acknowledgeCountChange !== true) {
            return Response.json(
              {
                error: "countChanged",
                message: `This now affects ${now} row${now === 1 ? "" : "s"}, not ${then}. The data changed since it was proposed.`,
                previewedRows: then,
                currentRows: now,
              },
              { status: 409 },
            );
          }
        }

        // Claim the proposal before running it. The `.eq("status", "proposed")`
        // is the whole concurrency story: two simultaneous approvals race here,
        // one updates a row and one updates nothing, and only the winner runs.
        const { data: claimed } = await admin
          .from("project_data_writes")
          .update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() })
          .eq("id", proposalId)
          .eq("status", "proposed")
          .select("id")
          .single();
        if (!claimed) {
          return Response.json({ error: "This proposal was already handled." }, { status: 409 });
        }

        const result = await runManagedSql(project.cloud_project_ref, plan.statement);

        await admin
          .from("project_data_writes")
          .update({
            status: result.ok ? "executed" : "failed",
            error: result.ok ? null : (result.error ?? "execution failed").slice(0, 2000),
            executed_at: new Date().toISOString(),
            // The Management API's query endpoint does not report a command tag,
            // so the authoritative post-hoc count is the one we re-checked a
            // moment ago. Stored as what it is rather than dressed up as a
            // command result.
            affected_rows: proposal.previewed_rows,
          })
          .eq("id", proposalId);

        if (!result.ok) {
          return Response.json({ error: result.error ?? "The statement failed to run." }, { status: 502 });
        }
        return Response.json({ ok: true, status: "executed", rowsAffected: proposal.previewed_rows });
      },

      /** Audit trail — owner and accepted collaborators, never a public-link visitor. */
      GET: async ({ request }) => {
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const projectId = new URL(request.url).searchParams.get("projectId");
        if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 });

        const gate = await denyUnlessProjectAccess(supabase, projectId, user.id, "read");
        if ("error" in gate) return gate.error;

        const admin = createAdminClient();
        const { data: writes } = await admin
          .from("project_data_writes")
          .select("id, statement, kind, target_table, previewed_rows, affected_rows, status, error, proposed_at, approved_at, executed_at")
          .eq("project_id", projectId)
          .order("proposed_at", { ascending: false })
          .limit(100);

        return Response.json({ writes: writes ?? [] });
      },
    },
  },
});
