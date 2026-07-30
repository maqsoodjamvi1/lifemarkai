// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { reserveCredits, settleCreditReservation, cancelCreditReservation } from "@/lib/credits";
import { runDeepScan, estimateDeepScanBatches } from "@/lib/security/deep-scan";
import { logger } from "@/lib/logger";

/**
 * /api/security/deep-scan — the agentic DEEP profile.
 *
 * Distinct from /api/security/scan, which dispatches to Aikido or Wiz. This is
 * first-party: it reads the project's own code looking for missing authorisation,
 * absent RLS, unsafe input handling and client-side secret use — the class of
 * weakness the regex-based BASIC profile is structurally unable to see.
 *
 * GET  → a quote. How many batches, what it will cost, what will be reviewed.
 *        Never spends anything, so the UI can show the price before the button.
 * POST → run it. Reserves credits first, settles on success, cancels on failure.
 *
 * Findings are written to `health_findings` for triage rather than returned as a
 * publish blocker. A model reviewing authorisation logic will occasionally be
 * wrong, and a false critical that stops a deploy teaches people to bypass the
 * gate — which costs more security than the finding was worth. The publish gate
 * stays deterministic (lib/security/publish-gate.ts); this feeds the queue a human
 * works through.
 */

const CREDITS_PER_BATCH = 1;

export const Route = createFileRoute("/api/security/deep-scan")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const projectId = new URL(request.url).searchParams.get("projectId");
        if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 });

        const { data: project } = await supabase
          .from("projects")
          .select("id, project_files(path)")
          .eq("id", projectId)
          .eq("user_id", user.id)
          .single();
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

        const batches = estimateDeepScanBatches(project.project_files ?? []);
        return Response.json({
          profile: "deep",
          batches,
          estimatedCredits: batches * CREDITS_PER_BATCH,
          note:
            batches === 0
              ? "No reviewable source files in this project yet."
              : "Deep scan reads your code with a review model. Findings go to the Security panel for triage; they do not block publishing.",
        });
      },

      POST: async ({ request }) => {
        const ip = request.headers.get("x-forwarded-for") ?? "local";
        const rl = await rateLimitAsync(ip, RATE_LIMITS.ai);
        if (!rl.success) return Response.json({ error: "Rate limit exceeded" }, { status: 429 });

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { projectId } = await request.json().catch(() => ({}));
        if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 });

        const { data: project } = await supabase
          .from("projects")
          .select("id, project_files(path, content)")
          .eq("id", projectId)
          .eq("user_id", user.id)
          .single();
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

        const files = (project.project_files ?? []).map((f: { path: string; content: string | null }) => ({
          path: f.path,
          content: f.content ?? "",
        }));

        const batches = estimateDeepScanBatches(files);
        if (batches === 0) {
          return Response.json({ error: "No reviewable source files in this project" }, { status: 400 });
        }

        const cost = batches * CREDITS_PER_BATCH;
        let reservation: Awaited<ReturnType<typeof reserveCredits>> = null;
        try {
          reservation = await reserveCredits(supabase, {
            userId: user.id,
            amount: cost,
            action: "security_deep_scan",
            projectId,
          });
        } catch (e) {
          logger.error("security.deep_scan.reserve_failed", { projectId, error: String(e) });
          return Response.json({ error: "Unable to reserve credits" }, { status: 500 });
        }
        if (!reservation) {
          return Response.json(
            { error: `Insufficient credits — a deep scan of this project costs ${cost}.` },
            { status: 402 },
          );
        }

        try {
          const result = await runDeepScan(files, { projectId, userId: user.id });

          // Persist for triage. Reuses the same table the self-healing scans write
          // to, so deep findings appear in one queue with everything else rather
          // than in a parallel list nobody checks.
          //
          // The column set and severity vocabulary are NOT the scanner's. Migration
          // 075 defines severity as info|warning|error|critical, has no `source` or
          // `line_number` column, and requires user_id — so the scanner's
          // low|medium|high|critical has to be mapped and the line number folded
          // into `detail`. Writing the scanner's own shape here would have failed
          // the check constraint at runtime, on the first real deep scan.
          const SEVERITY_TO_HEALTH: Record<string, string> = {
            critical: "critical",
            high: "error",
            medium: "warning",
            low: "info",
          };

          // Insert only what is not already open, mirroring self-healing's
          // reconcile: re-running a scan should not duplicate a finding the user is
          // already looking at. There is no unique constraint to upsert against.
          const { data: existing } = await supabase
            .from("health_findings")
            .select("title, file_path")
            .eq("project_id", projectId)
            .eq("category", "security")
            .in("status", ["open", "fix_proposed"]);

          const seenKeys = new Set(
            (existing ?? []).map(
              (r: { title: string; file_path: string | null }) => `${r.title}|${r.file_path ?? ""}`,
            ),
          );

          const toInsert = result.findings
            .filter((f) => !seenKeys.has(`${f.title}|${f.file}`))
            .map((f) => ({
              project_id: projectId,
              user_id: user.id,
              category: "security",
              severity: SEVERITY_TO_HEALTH[f.severity] ?? "warning",
              title: f.title,
              file_path: f.file,
              detail: [
                `Line ${f.line}`,
                f.snippet ? `Evidence: ${f.snippet}` : "",
                f.recommendation,
                `(deep scan, rule ${f.rule})`,
              ]
                .filter(Boolean)
                .join("\n\n"),
              status: "open",
            }));

          if (toInsert.length > 0) {
            await supabase.from("health_findings").insert(toInsert);
          }

          await settleCreditReservation(supabase, reservation.id, cost);

          logger.info("security.deep_scan.completed", {
            projectId,
            batches: result.batches,
            findings: result.findings.length,
            errors: result.errors.length,
          });

          return Response.json({
            profile: "deep",
            findings: result.findings,
            batches: result.batches,
            creditsCharged: cost,
            newFindingsRecorded: toInsert.length,
            filesReviewed: result.filesReviewed.length,
            // Named explicitly: a scan that silently covered 48 of 90 files and
            // reported "no issues" would be the same lie as a synthetic metric.
            filesSkipped: result.filesSkipped,
            partial: result.filesSkipped.length > 0 || result.errors.length > 0,
            errors: result.errors,
            note: "Deep findings are for triage in the Security panel. They do not block publishing.",
          });
        } catch (e) {
          try {
            await cancelCreditReservation(supabase, reservation.id);
          } catch { /* reservation cleanup is best-effort */ }
          logger.error("security.deep_scan.failed", { projectId, error: String(e) });
          return Response.json(
            { error: "The deep scan failed and you were not charged." },
            { status: 500 },
          );
        }
      },
    },
  },
});
