// @ts-nocheck
/**
 * Public API v1 — single project.
 *   GET /api/v1/projects/:id   → project metadata + file count   (scope: projects:read)
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

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, description, framework, status, deployed_url, preview_url, cloud_enabled, cloud_status, created_at, updated_at")
    .eq("id", id)
    .eq("user_id", auth.userId)
    .single();

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404, headers: CORS });

  const { count } = await supabase
    .from("project_files")
    .select("id", { count: "exact", head: true })
    .eq("project_id", id);

  return NextResponse.json({ project: { ...project, file_count: count ?? 0 } }, { headers: CORS });
}
