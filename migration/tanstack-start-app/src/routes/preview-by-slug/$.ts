// @ts-nocheck
import { createFileRoute } from "@tanstack/react-router";
import { createAdminClient, createClient } from "@/lib/supabase/server";
import { servePreviewHtml } from "@/lib/preview/serve-preview";

/**
 * Native /preview-by-slug/$ — TRUE NATIVE (no worker).
 * Resolves app_slug -> project id, enforces visibility, renders inline so the
 * clean slug host keeps its URL. Ported from app/preview-by-slug/[slug].
 */
function notFoundHtml(): Response {
  return new Response(
    `<!DOCTYPE html><html><body><p style="padding:2rem;font-family:system-ui">App not found.</p></body></html>`,
    { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

async function handleGET(_req: Request, params: any) {
  const splat = String(params?._splat ?? "").replace(/^\/+/, "");
  const slug = splat.split("/").filter(Boolean)[0];
  if (!slug) return notFoundHtml();

  const admin = createAdminClient();
  const { data: project } = await (admin as any)
    .from("projects")
    .select("id, user_id, is_public, visibility")
    .eq("app_slug", slug)
    .maybeSingle();

  if (!project) return notFoundHtml();

  const visibility: "public" | "workspace" | "private" =
    project.visibility ?? (project.is_public ? "public" : "workspace");

  if (visibility !== "public") {
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

export const Route = createFileRoute("/preview-by-slug/$")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleGET(request, params),
      HEAD: async ({ request, params }) => handleGET(request, params),
    },
  },
});
