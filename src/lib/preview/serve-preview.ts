// Ported to TanStack Start: uses the standard Web Response (was next/server NextResponse).
import { createAdminClient } from "../supabase/server.ts";
import { redirectResponse } from "../api/redirect.ts";
import { buildFallbackHtml } from "./build-fallback-html.ts";
import { injectSimplifiedPreviewBanner, previewHeaders, rewriteStaticPaths } from "./preview-html-utils.ts";
import type { ProjectFile } from "../../types/database.ts";

// Re-exported for existing/future callers of this module — the actual
// implementations live in preview-html-utils.ts so they can be unit tested
// without pulling in createAdminClient (which reads a Vite-only
// import.meta.env global at module load time and throws immediately under
// the plain node:test runner this codebase's tests use).
export { injectSimplifiedPreviewBanner, previewHeaders, rewriteStaticPaths };

/**
 * Shared preview renderer — used by the editor preview (`/preview/[projectId]`)
 * and the clean-slug public host (`/preview-by-slug/[slug]`). Access control is
 * the CALLER's responsibility; this only builds + returns the HTML.
 *
 * Asset URLs are rewritten to absolute `/preview/{id}/…` paths, which resolve on
 * ANY host — the slug-host rewrite in next.config excludes `preview/`, so those
 * requests fall through to the id-based asset route. No per-host asset handler.
 */

export async function servePreviewHtml(projectId: string): Promise<Response> {
  const supabase = await createAdminClient();

  // Lovable parity: if a warm Modal tunnel is stored, redirect there instead of Babel srcdoc.
  type ProjectRow = {
    preview_url: string | null;
    metadata: Record<string, unknown> | null;
  };
  const { data: projectRow } = await supabase
    .from("projects")
    .select("preview_url, metadata")
    .eq("id", projectId)
    .maybeSingle();
  const project = projectRow as ProjectRow | null;
  const tunnel = project?.preview_url?.trim() || "";
  const meta = project?.metadata && typeof project.metadata === "object" ? project.metadata : {};
  const sandboxReady =
    meta.sandbox_phase === "ready" ||
    (typeof meta.sandbox_id === "string" && meta.sandbox_id.length > 0);
  if (
    sandboxReady &&
    /^https?:\/\//i.test(tunnel) &&
    !tunnel.startsWith("data:")
  ) {
    return redirectResponse(tunnel);
  }

  type FileRow = { path: string; content: string | null; language: string | null };

  const { data: rawFiles } = await supabase
    .from("project_files")
    .select("path, content, language")
    .eq("project_id", projectId);

  const files = (rawFiles ?? []) as FileRow[];

  if (!files || files.length === 0) {
    return new Response(
      `<!DOCTYPE html><html><body><p style="padding:2rem;font-family:system-ui">Project not found or has no files.</p></body></html>`,
      { status: 404, headers: { "Content-Type": "text/html; charset=utf-8" } }
    );
  }

  const indexHtml = files.find((f) => f.path === "index.html" || f.path === "public/index.html");
  if (
    indexHtml?.content &&
    !indexHtml.content.includes("src/main.tsx") &&
    !indexHtml.content.includes('type="module"')
  ) {
    const html = rewriteStaticPaths(indexHtml.content, projectId);
    return new Response(html, {
      headers: { ...previewHeaders(), "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Vite/Next apps normally need a live sandbox — this branch used to hard
  // 503 here rather than "serve Babel srcdoc as a fake live preview." That
  // was a real tradeoff (the fallback render can't run real backend calls or
  // npm packages) but it meant whoever this link was shared with — often a
  // non-technical stakeholder, not an editor user who understands the
  // distinction — got a dead page naming internal vendor/backend details
  // (MODAL_TOKEN_ID, "Modal sandbox") instead of any view of the app at all.
  // buildFallbackHtml below is the same renderer this route already falls
  // back to for a non-app project, and that self-verify/agent-browser use
  // elsewhere in this codebase; the disclosure banner (baked into the HTML
  // itself, since this route has no chrome to float a card over the render)
  // is what keeps this honest instead of silently passing off a degraded
  // render as the live app.
  const looksLikeApp = files.some(
    (f) =>
      f.path === "package.json" ||
      /vite\.config\.(t|j)sx?$/.test(f.path) ||
      /^src\/(main|index|App)\.(t|j)sx?$/.test(f.path.replace(/\\/g, "/")),
  );

  const projectFiles: ProjectFile[] = files.map((f) => ({
    id: f.path,
    project_id: projectId,
    path: f.path,
    content: f.content ?? "",
    language: f.language ?? "text",
    created_at: "",
    updated_at: "",
  }));

  const html = buildFallbackHtml(projectFiles);
  return new Response(looksLikeApp ? injectSimplifiedPreviewBanner(html) : html, {
    headers: { ...previewHeaders(), "Content-Type": "text/html; charset=utf-8" },
  });
}
