import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { buildFallbackHtml } from "@/lib/preview/build-fallback-html";
import { verifyPreviewToken } from "@/lib/preview/preview-token";
import type { ProjectFile } from "@/types/database";

/**
 * Framing headers. When a dedicated cross-origin preview host is configured
 * (NEXT_PUBLIC_PREVIEW_ORIGIN), allow the editor origin (NEXT_PUBLIC_APP_URL) to
 * embed the preview via CSP frame-ancestors; otherwise keep SAMEORIGIN.
 */
function previewHeaders(): Record<string, string> {
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

/** 403 page shown when a required/invalid preview token blocks access. */
function forbidden(): NextResponse {
  return new NextResponse(
    `<!DOCTYPE html><html><body><p style="padding:2rem;font-family:system-ui">Preview access denied — invalid or expired token.</p></body></html>`,
    { status: 403, headers: { "Content-Type": "text/html; charset=utf-8" } },
  );
}

function rewriteStaticPaths(html: string, projectId: string): string {
  return html.replace(
    /(src|href)="(?!https?:\/\/|\/\/|#|data:|blob:)([^"]+)"/g,
    (_, attr: string, path: string) => {
      const resolved = path.startsWith("/") ? path : `/${path}`;
      return `${attr}="/preview/${projectId}${resolved}"`;
    }
  );
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const { projectId } = await params;

  // ── Signed-token gate ─────────────────────────────────────────────────────
  // A valid project-scoped token authorizes preview access. Enforced when
  // PREVIEW_REQUIRE_TOKEN=true (recommended in prod) OR whenever a token is
  // supplied. Without either, behaviour is unchanged (local/dev friendly).
  const token = _req.nextUrl.searchParams.get("token");
  const required = process.env.PREVIEW_REQUIRE_TOKEN === "true";
  if (required || token) {
    if (!token) return forbidden();
    const claims = verifyPreviewToken(token);
    if (!claims || claims.project_id !== projectId) return forbidden();
  }

  const supabase = await createAdminClient();

  type FileRow = { path: string; content: string | null; language: string | null };

  const [{ data: project }, { data: rawFiles }] = await Promise.all([
    supabase.from("projects").select("name").eq("id", projectId).single(),
    supabase.from("project_files").select("path, content, language").eq("project_id", projectId),
  ]);

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
