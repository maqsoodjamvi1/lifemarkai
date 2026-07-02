// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { runHealthScan } from "@/lib/ai/self-healing";

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

export const maxDuration = 300;

export async function GET(req: NextRequest) {
  // Auth: cron secret or Vercel cron auto-header (same check as /api/cloud/daily-backups)
  const provided = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createAdminClient();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const { data: projects, error: projErr } = await supabase
    .from("projects")
    .select("id, user_id, name")
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(MAX_PROJECTS_PER_RUN);
  if (projErr) return NextResponse.json({ error: projErr.message }, { status: 500 });

  const results: Array<{ project: string; status: string; findings?: number; note?: string }> = [];

  for (const project of (projects ?? [])) {
    try {
      const { findings } = await runHealthScan({
        supabase,
        projectId: project.id,
        userId: project.user_id,
      });
      results.push({ project: project.name, status: "ok", findings });
    } catch (err) {
      results.push({
        project: project.name,
        status: "failed",
        note: err instanceof Error ? err.message : "scan failed",
      });
    }
  }

  return NextResponse.json({
    ok: true,
    since,
    processed: results.length,
    results,
  });
}
