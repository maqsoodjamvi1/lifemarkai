import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { signPreviewToken,previewTokenConfigured } from "@/lib/preview/preview-token";
import { buildPreviewUrl } from "@/lib/preview/preview-url";
import { getProjectAccess,canReadProjectFiles } from "@/lib/project/access";

/**
 * Native /api/preview/token — mint a short-lived, project-scoped preview token
 * after verifying the caller may view the project. POST { projectId, sha? }.
 */
export const Route = createFileRoute("/api/preview/token")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        if (!previewTokenConfigured()) {
          return Response.json({ error: "Preview tokens are not configured on this server." }, { status: 501 });
        }

        const body = (await request.json().catch(() => ({}))) as { projectId?: string; sha?: string };
        const projectId = body.projectId;
        if (!projectId) return Response.json({ error: "projectId is required" }, { status: 400 });

        const supabase = await createClient();
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        // Was a hand-rolled ownership/collaborator check that queried
        // `collaborators` without the `accepted_at IS NOT NULL` filter the
        // shared helper (and every other collaborator check in this
        // codebase) applies — so a user merely *invited* to a project, who
        // never accepted, could still mint a signed preview token for it.
        // getProjectAccess is the one place that rule is defined; routing
        // through it here keeps this route in sync with it instead of
        // re-diverging.
        // 404 rather than 403 for "no access," matching the same
        // not-found-vs-forbidden convention getProjectAccess's other
        // callers use (e.g. src/routes/api/projects/$id/monitoring.ts) —
        // it doesn't confirm to an unauthorized caller that the id exists.
        const access = await getProjectAccess(supabase, projectId, user.id);
        if (!canReadProjectFiles(access)) return Response.json({ error: "Not found" }, { status: 404 });

        const signed = signPreviewToken({ projectId, userId: user.id, sha: body.sha });
        if (!signed) return Response.json({ error: "Failed to sign preview token" }, { status: 500 });

        const url = buildPreviewUrl({ projectId, token: signed.token, sha: body.sha });
        return Response.json({ token: signed.token, url, expiresAt: signed.expiresAt });
      },
    },
  },
});
