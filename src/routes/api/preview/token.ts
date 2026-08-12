import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { signPreviewToken,previewTokenConfigured } from "@/lib/preview/preview-token";
import { buildPreviewUrl } from "@/lib/preview/preview-url";

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

        const sb = supabase as any;
        const { data: project } = await sb
          .from("projects").select("id, user_id, is_public").eq("id", projectId).single();
        if (!project) return Response.json({ error: "Not found" }, { status: 404 });

        let allowed = project.user_id === user.id || project.is_public === true;
        if (!allowed) {
          const { data: collab } = await sb
            .from("collaborators")
            .select("id")
            .eq("project_id", projectId)
            .eq("user_id", user.id)
            .maybeSingle();
          allowed = !!collab;
        }
        if (!allowed) return Response.json({ error: "Forbidden" }, { status: 403 });

        const signed = signPreviewToken({ projectId, userId: user.id, sha: body.sha });
        if (!signed) return Response.json({ error: "Failed to sign preview token" }, { status: 500 });

        const url = buildPreviewUrl({ projectId, token: signed.token, sha: body.sha });
        return Response.json({ token: signed.token, url, expiresAt: signed.expiresAt });
      },
    },
  },
});
