// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient } from "@/lib/supabase/admin";
import { scanProject, type Severity } from "@/lib/security/scan";

/**
 * Scheduled security scan (enterprise Security Center — persistent scans).
 * GET or POST, guarded by CRON_SECRET (x-cron-secret header or Bearer token —
 * Vercel cron sends `Authorization: Bearer $CRON_SECRET`).
 *
 * For each recently-updated project it runs the static scanner
 * (lib/security/scan.ts) and reconciles results into `health_findings`
 * (migration 075) under category = 'security':
 *   - new findings  → inserted status 'open'
 *   - resolved ones → prior open findings not seen this run → status 'fixed'
 *   - unchanged     → left as-is (idempotent; safe to run daily)
 *
 * Findings are never auto-fixed here — remediation stays approval-gated via the
 * health_findings.status / proposed_fix flow.
 */


const CRON_SECRET = process.env.CRON_SECRET ?? "";
const LOOKBACK_DAYS = 30;
const MAX_PROJECTS = 300;

// scan Severity → health_findings severity
const SEV_MAP: Record<Severity, "critical" | "error" | "warning" | "info"> = {
  critical: "critical",
  high: "error",
  medium: "warning",
  low: "info",
};

const sig = (title: string, file: string | null) => `${title}||${file ?? ""}`;

async function run(req: Request) {
  const provided = req.headers.get("x-cron-secret") ?? req.headers.get("authorization")?.replace("Bearer ", "");
  if (!CRON_SECRET || provided !== CRON_SECRET) {
    return Response.json({ error: "Forbidden" }, { status: 403 });
  }

  const supabase = await createAdminClient();
  const since = new Date(Date.now() - LOOKBACK_DAYS * 86400_000).toISOString();

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, user_id")
    .gte("updated_at", since)
    .order("updated_at", { ascending: false })
    .limit(MAX_PROJECTS);

  if (error) return Response.json({ error: error.message }, { status: 500 });

  let scanned = 0;
  let inserted = 0;
  let resolved = 0;

  for (const project of projects ?? []) {
    const { data: files } = await supabase
      .from("project_files")
      .select("path, content")
      .eq("project_id", project.id);

    const { findings } = scanProject((files ?? []) as Array<{ path: string; content: string }>);
    scanned++;

    // Existing open security findings for this project.
    const { data: existing } = await supabase
      .from("health_findings")
      .select("id, title, file_path")
      .eq("project_id", project.id)
      .eq("category", "security")
      .eq("status", "open");

    const existingSet = new Map<string, string>(); // signature → finding id
    for (const e of existing ?? []) existingSet.set(sig(e.title, e.file_path), e.id);

    const seen = new Set<string>();
    const toInsert: Array<Record<string, unknown>> = [];
    for (const f of findings) {
      const s = sig(f.title, f.file);
      if (seen.has(s)) continue;
      seen.add(s);
      if (existingSet.has(s)) continue; // already recorded and open
      toInsert.push({
        project_id: project.id,
        user_id: project.user_id,
        category: "security",
        severity: SEV_MAP[f.severity],
        title: f.title,
        detail: `${f.recommendation} (${f.kind}, rule: ${f.rule})`,
        file_path: f.file,
        status: "open",
      });
    }

    if (toInsert.length > 0) {
      const { error: insErr } = await supabase.from("health_findings").insert(toInsert);
      if (!insErr) inserted += toInsert.length;
    }

    // Findings that were open but no longer detected → mark fixed.
    const staleIds: string[] = [];
    for (const [s, id] of existingSet) if (!seen.has(s)) staleIds.push(id);
    if (staleIds.length > 0) {
      const { error: updErr } = await supabase
        .from("health_findings")
        .update({ status: "fixed" })
        .in("id", staleIds);
      if (!updErr) resolved += staleIds.length;
    }
  }

  return Response.json({ ok: true, scanned, inserted, resolved });
}

async function handleGET(req: Request) { return run(req); }
async function handlePOST(req: Request) { return run(req); }


export const Route = createFileRoute("/api/security/scheduled-scan")({
  server: {
    handlers: {
      GET: async ({ request }) => handleGET(request),
      POST: async ({ request }) => handlePOST(request),
    },
  },
});
