// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { scanDependenciesForCves } from "@/lib/security/cve-feed";
import { auditDependencies } from "@/lib/security/deps";
import { logger } from "@/lib/logger";

/**
 * /api/security/dependencies — live CVE lookup with per-advisory suppression.
 *
 * GET    → run the scan. Static audit (deps.ts) merged with live OSV.dev advisories,
 *          minus anything the owner has suppressed.
 * POST   → suppress one (package, advisory) pair, with a required reason.
 * DELETE → un-suppress.
 *
 * The static audit is kept, not replaced. It catches things a CVE feed does not —
 * a missing lockfile, a git-URL dependency, unpinned ranges — and it works offline.
 * The feed catches what the static list structurally cannot: anything disclosed
 * after the list was written.
 *
 * `feedAvailable: false` is reported distinctly from "no vulnerabilities". They are
 * different claims, and collapsing them into a green tick is how a scanner starts
 * lying: "we found nothing" and "we could not look" must never render the same.
 */
export const Route = createFileRoute("/api/security/dependencies")({
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
          .select("id, project_files(path, content)")
          .eq("id", projectId)
          .eq("user_id", user.id)
          .single();
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

        const files = (project.project_files ?? []).map(
          (f: { path: string; content: string | null }) => ({ path: f.path, content: f.content ?? "" }),
        );

        const { data: suppressionRows } = await supabase
          .from("dependency_cve_suppressions")
          .select("package_name, advisory_id, reason, created_at")
          .eq("project_id", projectId);

        const suppressions = (suppressionRows ?? []).map(
          (r: { package_name: string; advisory_id: string }) => ({
            packageName: r.package_name,
            advisoryId: r.advisory_id,
          }),
        );

        const [staticFindings, cve] = await Promise.all([
          Promise.resolve(auditDependencies(files)),
          scanDependenciesForCves(files, suppressions),
        ]);

        logger.info("security.dependencies.scanned", {
          projectId,
          feedAvailable: cve.feedAvailable,
          packagesChecked: cve.packagesChecked,
          cveFindings: cve.findings.length,
          suppressed: suppressions.length,
        });

        return Response.json({
          // Kept separate so the UI can say "3 advisories, 2 policy issues" rather
          // than one undifferentiated number.
          cve: {
            available: cve.feedAvailable,
            findings: cve.findings,
            packagesChecked: cve.packagesChecked,
            error: cve.error ?? null,
          },
          policy: { findings: staticFindings },
          suppressions: suppressionRows ?? [],
          summary: !cve.feedAvailable
            ? "Could not reach the vulnerability feed — advisory results are unknown, not clear."
            : cve.findings.length === 0
              ? `No known advisories affect the ${cve.packagesChecked} package${cve.packagesChecked === 1 ? "" : "s"} checked.`
              : `${cve.findings.length} advisor${cve.findings.length === 1 ? "y" : "ies"} affect this project.`,
        });
      },

      POST: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { projectId, packageName, advisoryId, reason } = await request
          .json()
          .catch(() => ({}));

        if (!projectId || !packageName || !advisoryId) {
          return Response.json(
            { error: "projectId, packageName and advisoryId are required" },
            { status: 400 },
          );
        }
        // A reason is required by the table too; check here so the user gets a
        // readable error instead of a constraint violation.
        if (typeof reason !== "string" || reason.trim().length < 10) {
          return Response.json(
            {
              error:
                "Give a reason of at least 10 characters. A suppression with no stated reason is indistinguishable from silencing an alert nobody understood.",
            },
            { status: 400 },
          );
        }

        const { data: project } = await supabase
          .from("projects")
          .select("id")
          .eq("id", projectId)
          .eq("user_id", user.id)
          .single();
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

        const { error } = await supabase.from("dependency_cve_suppressions").upsert(
          {
            project_id: projectId,
            package_name: packageName,
            advisory_id: advisoryId,
            reason: reason.trim(),
            suppressed_by: user.id,
          },
          { onConflict: "project_id,package_name,advisory_id" },
        );
        if (error) {
          return Response.json({ error: error.message }, { status: 500 });
        }

        logger.info("security.dependencies.suppressed", { projectId, packageName, advisoryId });
        return Response.json({ ok: true, suppressed: { packageName, advisoryId } });
      },

      DELETE: async ({ request }) => {
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const url = new URL(request.url);
        const projectId = url.searchParams.get("projectId");
        const packageName = url.searchParams.get("packageName");
        const advisoryId = url.searchParams.get("advisoryId");
        if (!projectId || !packageName || !advisoryId) {
          return Response.json(
            { error: "projectId, packageName and advisoryId are required" },
            { status: 400 },
          );
        }

        const { data: project } = await supabase
          .from("projects")
          .select("id")
          .eq("id", projectId)
          .eq("user_id", user.id)
          .single();
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

        await supabase
          .from("dependency_cve_suppressions")
          .delete()
          .eq("project_id", projectId)
          .eq("package_name", packageName)
          .eq("advisory_id", advisoryId);

        return Response.json({ ok: true, restored: { packageName, advisoryId } });
      },
    },
  },
});
