import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { buildFallbackHtml } from "@/lib/preview/build-fallback-html";
import type { ProjectFile } from "@/types/database";

/**
 * Shared preview renderer — used by the editor preview (`/preview/[projectId]`)
 * and the clean-slug public host (`/preview-by-slug/[slug]`). Access control is
 * the CALLER's responsibility; this only builds + returns the HTML.
 *
 * Asset URLs are rewritten to absolute `/preview/{id}/…` paths, which resolve on
 * ANY host — the slug-host rewrite in next.config excludes `preview/`, so those
 * requests fall through to the id-based asset route. No per-host asset handler.
 */

export function previewHeaders(): Record<string, string> {
  const base: Record<string, string> = { "Cache-Control": "no-store, must-revalidate" };
  const crossOrigin = !!process.env.NEXT_PUBLIC_PREVIEW_ORIGIN;
  const appOrigin = process.env.NEXT_PUBLIC_APP_URL;
  if (crossOrigin && appOrigin) {
    base["Content-Security-Policy"] = `frame-ancestors 'self' ${appOrigin}`;
  } else {
    base["X-Frame-Options"] = "SAMEORIGIN";
  }
  return base;
}

export function rewriteStaticPaths(html: string, projectId: string): string {
  return html.replace(
    /(src|href)="(?!https?:\/\/|\/\/|#|data:|blob:)([^"]+)"/g,
    (_, attr: string, path: string) => {
      const resolved = path.startsWith("/") ? path : `/${path}`;
      return `${attr}="/preview/${projectId}${resolved}"`;
    }
  );
}

export async function servePreviewHtml(projectId: string): Promise<NextResponse> {
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
    return NextResponse.redirect(tunnel, 302);
  }

  type FileRow = { path: string; content: string | null; language: string | null };

  const { data: rawFiles } = await supabase
    .from("project_files")
    .select("path, content, language")
    .eq("project_id", projectId);

  const files = (rawFiles ?? []) as FileRow[];

  if (!files || files.length === 0) {
    return new NextResponse(
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
    return new NextResponse(html, {
      headers: { ...previewHeaders(), "Content-Type": "text/html; charset=utf-8" },
    });
  }

  // Vite/Next apps need Modal — do not serve Babel srcdoc as a fake live preview.
  const looksLikeApp = files.some(
    (f) =>
      f.path === "package.json" ||
      /vite\.config\.(t|j)sx?$/.test(f.path) ||
      /^src\/(main|index|App)\.(t|j)sx?$/.test(f.path.replace(/\\/g, "/")),
  );
  if (looksLikeApp) {
    return new NextResponse(
      `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Modal preview required</title></head>
<body style="margin:0;font-family:system-ui,sans-serif;background:#0a0a0a;color:#e5e5e5;display:flex;min-height:100vh;align-items:center;justify-content:center">
  <div style="max-width:28rem;padding:2rem;text-align:center">
    <p style="font-weight:600;margin:0 0 0.5rem">Modal preview required</p>
    <p style="font-size:0.875rem;opacity:0.7;margin:0;line-height:1.5">
      This app needs a live Modal sandbox (same path as Lovable). Open it in the Lifemark editor with
      <code style="opacity:0.9">MODAL_TOKEN_ID</code> / <code style="opacity:0.9">MODAL_TOKEN_SECRET</code> configured.
    </p>
  </div>
</body></html>`,
      {
        status: 503,
        headers: { ...previewHeaders(), "Content-Type": "text/html; charset=utf-8" },
      },
    );
  }

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
  return new NextResponse(html, {
    headers: { ...previewHeaders(), "Content-Type": "text/html; charset=utf-8" },
  });
}
