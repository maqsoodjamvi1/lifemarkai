import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { auditProject } from "@/lib/seo/audit";

// GET /api/projects/[id]/seo-audit
// Static on-page SEO audit over the project's files. Owner or collaborator only.
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  if (user.id !== project.user_id) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: collab } = await (supabase as any)
      .from("collaborators")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .single();
    if (!collab) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: files } = await (supabase as any)
    .from("project_files")
    .select("path, content")
    .eq("project_id", projectId);

  const result = auditProject((files ?? []) as Array<{ path: string; content: string }>);
  return NextResponse.json({
    scannedAt: new Date().toISOString(),
    fileCount: (files ?? []).length,
    ...result,
  });
}
