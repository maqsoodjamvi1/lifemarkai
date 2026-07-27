// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { scanProject, type Severity } from "@/lib/security/scan";
import { auditDependencies } from "@/lib/security/deps";

/** Native /api/projects/:id/security-scan — static security + PII + dep audit. */
export const Route = createFileRoute("/api/projects/$id/security-scan")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const projectId = params.id;
        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const { data: project } = await (supabase as any)
          .from("projects").select("id, user_id").eq("id", projectId).single();
        if (!project) return Response.json({ error: "Project not found" }, { status: 404 });

        if (user.id !== project.user_id) {
          const { data: collab } = await (supabase as any)
            .from("collaborators").select("role").eq("project_id", projectId).eq("user_id", user.id).single();
          if (!collab) return Response.json({ error: "Forbidden" }, { status: 403 });
        }

        const { data: files } = await (supabase as any)
          .from("project_files").select("path, content").eq("project_id", projectId);

        const list = (files ?? []) as Array<{ path: string; content: string }>;
        const result = scanProject(list);

        const depFindings = auditDependencies(list);
        const findings = [...result.findings, ...depFindings];
        const summary = { critical: 0, high: 0, medium: 0, low: 0, total: findings.length } as Record<Severity, number> & { total: number };
        for (const f of findings) summary[f.severity]++;
        const order: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
        findings.sort((a, b) => order[a.severity] - order[b.severity] || a.file.localeCompare(b.file) || a.line - b.line);

        return Response.json({
          scannedAt: new Date().toISOString(),
          fileCount: list.length,
          findings,
          summary,
        });
      },
    },
  },
});
