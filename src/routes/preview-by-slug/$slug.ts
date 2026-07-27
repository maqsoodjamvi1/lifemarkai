// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { servePreviewHtml } from "@/lib/preview/serve-preview";

/**
 * Public serve endpoint for the CLEAN slug host. The next.config rewrite maps
 * `{app_slug}.apps.lifemarkai.com/*` → `/preview-by-slug/[slug]/*`, and this
 * resolves the slug → project id, enforces visibility, then renders the app
 * inline (URL stays clean; no redirect to an id-based URL).
 *
 * Assets resolve via `/preview/{id}/…` (absolute; excluded from the slug rewrite).
 */

function notFoundHtml(): Response {
  return new Response(
    `<!DOCTYPE html><html><body><p style="padding:2rem;font-family:system-ui">App not found.</p></body></html>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function handleGET(_req: Request, params: any) {
  const { slug } = params;
  const admin = await createAdminClient();

  const { data: project } = await (admin as any)
    .from("projects")
    .select("id, user_id, is_public, visibility")
    .eq("app_slug", slug)
    .maybeSingle();

  if (!project) return notFoundHtml();

  // New `visibility` field wins; fall back to the is_public boolean.
  const visibility: "public" | "workspace" | "private" =
    project.visibility ?? (project.is_public ? "public" : "workspace");

  if (visibility !== "public") {
    // Non-public apps require the owner / a collaborator to be signed in.
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return notFoundHtml();
    if (user.id !== project.user_id) {
      if (visibility === "private") return notFoundHtml();
      const { data: collab } = await (admin as any)
        .from("collaborators")
        .select("id")
        .eq("project_id", project.id)
        .eq("user_id", user.id)
        .maybeSingle();
      if (!collab) return notFoundHtml();
    }
  }

  return servePreviewHtml(project.id as string);
}


export const Route = createFileRoute("/preview-by-slug/$slug")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleGET(request, params),
    },
  },
});
