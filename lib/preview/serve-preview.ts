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
