import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";
import { buildFallbackHtml } from "@/lib/preview/build-fallback-html";
import type { ProjectFile } from "@/types/database";

const PREVIEW_HEADERS: Record<string, string> = {
  "X-Frame-Options": "SAMEORIGIN",
  "Cache-Control": "no-store, must-revalidate",
};

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
      headers: { ...PREVIEW_HEADERS, "Content-Type": "text/html; charset=utf-8" },
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
    headers: { ...PREVIEW_HEADERS, "Content-Type": "text/html; charset=utf-8" },
  });
}
