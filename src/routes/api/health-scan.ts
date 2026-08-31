import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/lib/supabase/admin";
import { runHealthScan } from "@/lib/ai/self-healing";
import { sendEmail } from "@/lib/email/resend";
import { getUserPlan,planAllows } from "@/lib/plans/gating";

/**
 * GET /api/health-scan
 * Header: x-cron-secret: $CRON_SECRET  (or Authorization: Bearer — Vercel cron)
 *
 * Nightly Self-Healing scan (Editor Intelligence P2). Runs the static health
 * analyzers over every project touched in the last 7 days (capped per run) and
 * reconciles `health_findings`. Zero AI cost — fixes are proposed/applied
 * separately, approval-gated, via /api/projects/[id]/health.
 */

const CRON_SECRET = process.env.CRON_SECRET ?? "";
const LOOKBACK_DAYS = 7;
const MAX_PROJECTS_PER_RUN = 50;


async function handleGET(req: Request) {
  // Auth: cron secret or Vercel cron auto-header (same check as /api/cloud/daily-backups)
  const provided = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createAdminClient();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: projects, error: projErr } = await supabase
    .from("projects")
    .select("id, user_id, name, metadata")
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(MAX_PROJECTS_PER_RUN);
  if (projErr) return Response.json({ error: projErr.message }, { status: 500 });

  // Project monitoring (Lovable parity, Jun 30 2026 "Project monitoring
  // (Beta)"): monitored projects are scanned on their schedule even when
  // they haven't been edited within the lookback window.
  const scanList = [...(projects ?? [])];
  try {
    const { data: monitored } = await supabase
      .from("projects")
      .select("id, user_id, name, metadata")
      .eq("metadata->monitoring->>enabled", "true")
      .limit(MAX_PROJECTS_PER_RUN);
    for (const m of monitored ?? []) {
      if (!scanList.some((p) => p.id === m.id)) scanList.push(m);
    }
  } catch { /* monitoring roll-call is best-effort */ }

  const results: Array<{ project: string; status: string; findings?: number; note?: string }> = [];

  for (const project of scanList) {
    try {
      const { findings } = await runHealthScan({
        supabase,
        projectId: project.id,
        userId: project.user_id,
      });
      results.push({ project: project.name, status: "ok", findings });

      // ── Monitoring digest: when due, email the owner about important
      // (high/critical) open findings. Editors already see findings above
      // chat via the security bar; the email covers time-sensitive issues.
      type MonitoringMeta = {
        enabled?: boolean;
        cadence?: string;
        last_run_at?: string;
        last_email_at?: string;
        history?: Array<{ at: string; findings: number; emailed: boolean }>;
      };
      const monitoring = (project.metadata as { monitoring?: MonitoringMeta } | null)?.monitoring;
      if (monitoring?.enabled) {
        // gating.ts declares project monitoring Pro+, enforced on the enable
        // path in /api/projects/[id]/monitoring — but that only stops NEW
        // enables. A project whose owner downgraded (or that was enabled
        // before that gate existed) still has monitoring.enabled: true in
        // its metadata forever, so the cron would otherwise keep scanning
        // and emailing for it indefinitely. Check the plan here too, and
        // turn the setting off (not just skip silently) so the next time the
        // owner opens the Self-Heal panel it honestly shows monitoring as
        // off rather than a toggle stuck "on" that quietly does nothing.
        const allowed = planAllows(await getUserPlan(project.user_id), "project_monitoring");
        if (!allowed) {
          await supabase
            .from("projects")
            .update({
              metadata: {
                ...((project.metadata ?? {}) as Record<string, unknown>),
                monitoring: { ...monitoring, enabled: false },
              },
            })
            .eq("id", project.id);
          continue;
        }
        const cadenceMs = monitoring.cadence === "weekly" ? 7 * 86_400_000 : 86_400_000;
        const lastRun = monitoring.last_run_at ? new Date(monitoring.last_run_at).getTime() : 0;
        if (Date.now() - lastRun >= cadenceMs - 60_000) {
          const { data: important } = await supabase
            .from("health_findings")
            .select("title, severity, category")
            .eq("project_id", project.id)
            .in("status", ["open", "fix_proposed"])
            .in("severity", ["critical", "error"])
            .limit(10);
          let emailed = false;
          const importantFindings = important ?? [];
          if (importantFindings.length > 0) {
            try {
              const { data: owner } = await supabase
                .from("profiles").select("email, full_name").eq("id", project.user_id).single();
              if (owner?.email) {
                const list = importantFindings
                  .map((f) => `<li><strong>[${f.severity}]</strong> ${f.title} <em>(${f.category})</em></li>`)
                  .join("");
                await sendEmail({
                  to: owner.email,
                  subject: `⚠️ ${project.name}: ${importantFindings.length} important finding${importantFindings.length === 1 ? "" : "s"} from project monitoring`,
                  html: `<p>Hi ${owner.full_name ?? "there"},</p>
<p>LifemarkAI's scheduled monitoring checked <strong>${project.name}</strong> and found ${importantFindings.length} important issue${importantFindings.length === 1 ? "" : "s"}:</p>
<ul>${list}</ul>
<p>Open the project's Self-Heal panel to review proposed fixes, or ask the AI in chat to fix them.</p>
<p style="color:#888;font-size:12px">You get this email because project monitoring is enabled (${monitoring.cadence ?? "daily"}). Turn it off in the Self-Heal panel.</p>`,
                });
                emailed = true;
              }
            } catch (mailErr) {
              console.warn("[health-scan] monitoring email failed:", mailErr instanceof Error ? mailErr.message : mailErr);
            }
          }
          const nowIso = new Date().toISOString();
          const prevHistory = Array.isArray(monitoring.history) ? monitoring.history : [];
          const history = [
            { at: nowIso, findings: findings ?? 0, emailed },
            ...prevHistory,
          ].slice(0, 10);
          await supabase
            .from("projects")
            .update({
              metadata: {
                ...((project.metadata ?? {}) as Record<string, unknown>),
                monitoring: {
                  ...monitoring,
                  last_run_at: nowIso,
                  ...(emailed ? { last_email_at: nowIso } : {}),
                  history,
                },
              },
            })
            .eq("id", project.id);
        }
      }
    } catch (err) {
      results.push({
        project: project.name,
        status: "failed",
        note: err instanceof Error ? err.message : "scan failed",
      });
    }
  }

  return Response.json({
    ok: true,
    since,
    processed: results.length,
    results,
  });
}


export const Route = createFileRoute("/api/health-scan")({
  server: {
    handlers: {
      GET: async ({ request }) => handleGET(request),
    },
  },
});
