// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/server";

const MIME: Record<string, string> = {
  css:  "text/css; charset=utf-8",
  js:   "application/javascript; charset=utf-8",
  ts:   "application/javascript; charset=utf-8",
  jsx:  "application/javascript; charset=utf-8",
  tsx:  "application/javascript; charset=utf-8",
  json: "application/json; charset=utf-8",
  svg:  "image/svg+xml",
  png:  "image/png",
  jpg:  "image/jpeg",
  jpeg: "image/jpeg",
  gif:  "image/gif",
  webp: "image/webp",
  ico:  "image/x-icon",
  html: "text/html; charset=utf-8",
  txt:  "text/plain; charset=utf-8",
  woff: "font/woff",
  woff2:"font/woff2",
  ttf:  "font/ttf",
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ projectId: string; path: string[] }> }
) {
  // params is a Promise in Next 15+ — destructuring without await yields
  // undefined fields and the file lookup silently matches nothing.
  const { projectId, path: segments } = await params;
  const filePath = segments.join("/");

  const supabase = await createAdminClient();

  // Try exact path, path without leading slash, and path with leading slash
  const { data: file } = await (supabase as any)
    .from("project_files")
    .select("content, path")
    .eq("project_id", projectId)
    .in("path", [filePath, `/${filePath}`, filePath.replace(/^\//, "")])
    .maybeSingle();

  if (!file?.content) {
    // 404 with a minimal JSON body so browser DevTools shows something useful
    return new NextResponse(
      JSON.stringify({ error: "file not found", path: filePath }),
      { status: 404, headers: { "Content-Type": "application/json" } }
    );
  }

  const ext = filePath.split(".").pop()?.toLowerCase() ?? "";
  const contentType = MIME[ext] ?? "text/plain; charset=utf-8";

  return new NextResponse(file.content, {
    headers: {
      "Content-Type": contentType,
      // Short cache so edits appear quickly; long enough to avoid waterfall
      "Cache-Control": "public, max-age=5, stale-while-revalidate=30",
      "X-Frame-Options": "SAMEORIGIN",
    },
  });
}
