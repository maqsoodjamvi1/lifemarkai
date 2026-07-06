// @ts-nocheck
/**
 * Public API v1 — project files.
 *   GET /api/v1/projects/:id/files            → list files (path, language, size)
 *   GET /api/v1/projects/:id/files?path=x.tsx → single file with full content
 *   Scope: projects:read
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateApiRequest } from "@/lib/api/api-key";

export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await authenticateApiRequest(req, "projects:read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: CORS });

  const { id } = await params;
  const supabase = await createAdminClient();

  // Ownership check (admin client bypasses RLS, so verify explicitly).
  const { data: project } = await supabase
    .from("projects").select("id").eq("id", id).eq("user_id", auth.userId).single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404, headers: CORS });

  const wantPath = new URL(req.url).searchParams.get("path");

  if (wantPath) {
    const { data: file } = await supabase
      .from("project_files")
      .select("path, content, language")
      .eq("project_id", id)
      .eq("path", wantPath)
      .single();
    if (!file) return NextResponse.json({ error: "File not found" }, { status: 404, headers: CORS });
    return NextResponse.json({ file }, { headers: CORS });
  }

  const { data: files, error } = await supabase
    .from("project_files")
    .select("path, language, content")
    .eq("project_id", id)
    .order("path");
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });

  // List view returns metadata + size, not full content (keep payloads small).
  const list = (files ?? []).map((f: { path: string; language: string | null; content: string | null }) => ({
    path: f.path,
    language: f.language,
    size: (f.content ?? "").length,
  }));
  return NextResponse.json({ files: list, count: list.length }, { headers: CORS });
}
