import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { requireFeature } from "@/lib/plans/gating";

/**
 * GET /api/security/findings
 * Workspace roll-up of persisted security findings (from the scheduled scan,
 * migration 075 health_findings, category = 'security'). Returns a map keyed by
 * project id, each value shaped like the on-demand scan result so the Security
 * Center can display last-known findings without re-running a scan.
 *
 * Only the caller's own projects and open findings are returned.
 */
export const runtime = "nodejs";

// health_findings severity → Security Center severity
const SEV_BACK: Record<string, "critical" | "high" | "medium" | "low"> = {
  critical: "critical",
  error: "high",
  warning: "medium",
  info: "low",
};

export async function GET(_req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Security Center is a Team-tier (Lovable "Business") feature.
  const gate = await requireFeature(user.id, "security_center");
  if (!gate.ok) return NextResponse.json({ error: gate.error, requiredPlan: gate.requiredPlan }, { status: gate.status });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: projects } = await (supabase as any)
    .from("projects")
    .select("id")
    .eq("user_id", user.id)
    .limit(200);

  const ids = (projects ?? []).map((p: { id: string }) => p.id);
  if (ids.length === 0) return NextResponse.json({ results: {} });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: findings } = await (supabase as any)
    .from("health_findings")
    .select("project_id, severity, title, detail, file_path, status, created_at")
    .eq("category", "security")
    .eq("status", "open")
    .in("project_id", ids)
    .order("created_at", { ascending: false });

  const results: Record<string, {
    scannedAt: string | null;
    persisted: true;
    findings: Array<{ severity: string; title: string; file?: string; line?: number; description: string; recommendation?: string }>;
    summary: { critical: number; high: number; medium: number; low: number; total: number };
  }> = {};

  for (const f of findings ?? []) {
    const sev = SEV_BACK[f.severity] ?? "low";
    let bucket = results[f.project_id];
    if (!bucket) {
      bucket = results[f.project_id] = {
        scannedAt: f.created_at ?? null,
        persisted: true,
        findings: [],
        summary: { critical: 0, high: 0, medium: 0, low: 0, total: 0 },
      };
    }
    bucket.findings.push({
      severity: sev,
      title: f.title,
      file: f.file_path ?? undefined,
      description: f.detail ?? "",
      recommendation: f.detail ?? undefined,
    });
    bucket.summary[sev]++;
    bucket.summary.total++;
    if (f.created_at && (!bucket.scannedAt || f.created_at > bucket.scannedAt)) bucket.scannedAt = f.created_at;
  }

  return NextResponse.json({ results });
}
