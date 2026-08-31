import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { getProjectAccess,canWriteProjectFiles } from "@/lib/project/access";
import { requireFeature,requiredPlanLabel } from "@/lib/plans/gating";

/**
 * Native /api/projects/:id/monitoring — project monitoring settings (Beta).
 * Stored in projects.metadata.monitoring = { enabled, cadence, last_run_at }.
 * Actually checked and emailed by the /api/health-scan cron.
 *
 * gating.ts declares this feature Pro+ (FEATURE_MIN_PLAN.project_monitoring),
 * but nothing here or in the settings UI ever enforced it — a free-plan user
 * could turn monitoring on the same as anyone else. Enforced below only on
 * the enable path; turning monitoring OFF is always allowed regardless of
 * plan, so a downgraded user is never stuck unable to change a setting they
 * can see.
 */
export const Route = createFileRoute("/api/projects/$id/monitoring")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const projectId = params.id;
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const access = await getProjectAccess(supabase, projectId, user.id);
        if (!canWriteProjectFiles(access)) return Response.json({ error: "Project not found" }, { status: 404 });

        const { data: project } = await supabase
          .from("projects").select("metadata").eq("id", projectId).single();
        const monitoring = ((project?.metadata ?? {}) as { monitoring?: unknown }).monitoring ?? { enabled: false, cadence: "daily" };

        const gate = await requireFeature(user.id, "project_monitoring");
        return Response.json({
          monitoring,
          // requiredPlan is a display label ("Pro"), not the raw PlanId, so
          // the client can show it directly without importing gating.ts.
          gate: { allowed: gate.ok, requiredPlan: gate.ok ? null : requiredPlanLabel("project_monitoring") },
        });
      },

      POST: async ({ request, params }) => {
        const projectId = params.id;
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const access = await getProjectAccess(supabase, projectId, user.id);
        if (!canWriteProjectFiles(access)) return Response.json({ error: "Project not found" }, { status: 404 });

        const { enabled, cadence } = (await request.json().catch(() => ({}))) as { enabled?: boolean; cadence?: string };
        if (typeof enabled !== "boolean") return Response.json({ error: "enabled (boolean) required" }, { status: 400 });
        const safeCadence = cadence === "weekly" ? "weekly" : "daily";

        if (enabled) {
          const gate = await requireFeature(user.id, "project_monitoring");
          if (!gate.ok) {
            return Response.json(
              { error: `Project monitoring requires the ${requiredPlanLabel("project_monitoring")} plan.`, requiredPlan: gate.requiredPlan },
              { status: 402 },
            );
          }
        }

        const { data: project } = await supabase
          .from("projects").select("metadata").eq("id", projectId).single();
        const meta = (project?.metadata ?? {}) as Record<string, unknown>;
        const prev = (meta.monitoring ?? {}) as Record<string, unknown>;

        const nextMonitoring = { ...prev, enabled, cadence: safeCadence };
        await supabase
          .from("projects")
          .update({ metadata: { ...meta, monitoring: nextMonitoring } })
          .eq("id", projectId);

        return Response.json({ ok: true, monitoring: nextMonitoring });
      },
    },
  },
});
