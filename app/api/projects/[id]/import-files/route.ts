import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

/**
 * POST /api/projects/[id]/import-files
 * Body: { sourceProjectId: string, filePaths: string[] }
 * Copies selected files from sourceProjectId into the target project [id].
 * Requires the caller to own (or collaborate on) both projects.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { sourceProjectId, filePaths } = body;

  if (!sourceProjectId || typeof sourceProjectId !== "string") {
    return NextResponse.json({ error: "sourceProjectId required" }, { status: 400 });
  }
  if (!Array.isArray(filePaths) || filePaths.length === 0) {
    return NextResponse.json({ error: "filePaths must be a non-empty array" }, { status: 400 });
  }
  if (filePaths.length > 20) {
    return NextResponse.json({ error: "Max 20 files per import" }, { status: 400 });
  }

  const targetProjectId = id;

  // Verify user has write access to the target project
  const { data: targetProject } = await (supabase as any)
    .from("projects")
    .select("id, user_id")
    .eq("id", targetProjectId)
    .single();

  if (!targetProject) {
    return NextResponse.json({ error: "Target project not found" }, { status: 404 });
  }
  const canWriteTarget =
    targetProject.user_id === user.id ||
    (await (supabase as any)
      .from("collaborators")
      .select("role")
      .eq("project_id", targetProjectId)
      .eq("user_id", user.id)
      .in("role", ["owner", "editor"])
      .maybeSingle()
    ).data != null;

  if (!canWriteTarget) {
    return NextResponse.json({ error: "No write access to target project" }, { status: 403 });
  }

  // Verify user can read the source project
  const { data: sourceProject } = await (supabase as any)
    .from("projects")
    .select("id, user_id, is_public")
    .eq("id", sourceProjectId)
    .single();

  if (!sourceProject) {
    return NextResponse.json({ error: "Source project not found" }, { status: 404 });
  }
  const canReadSource =
    sourceProject.user_id === user.id ||
    sourceProject.is_public === true ||
    (await (supabase as any)
      .from("collaborators")
      .select("id")
      .eq("project_id", sourceProjectId)
      .eq("user_id", user.id)
      .maybeSingle()
    ).data != null;

  if (!canReadSource) {
    return NextResponse.json({ error: "No read access to source project" }, { status: 403 });
  }

  // Fetch the requested files from the source project
  const { data: sourceFiles, error: fetchErr } = await (supabase as any)
    .from("project_files")
    .select("path, content, language")
    .eq("project_id", sourceProjectId)
    .in("path", filePaths);

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 });
  if (!sourceFiles || sourceFiles.length === 0) {
    return NextResponse.json({ error: "No matching files found in source project" }, { status: 404 });
  }

  // Upsert into target project
  const toInsert = sourceFiles.map((f: { path: string; content: string; language: string }) => ({
    project_id: targetProjectId,
    path: f.path,
    content: f.content,
    language: f.language,
  }));

  const { data: imported, error: upsertErr } = await (supabase as any)
    .from("project_files")
    .upsert(toInsert, { onConflict: "project_id,path" })
    .select();

  if (upsertErr) return NextResponse.json({ error: upsertErr.message }, { status: 500 });

  return NextResponse.json({ imported, count: imported?.length ?? 0 });
}
