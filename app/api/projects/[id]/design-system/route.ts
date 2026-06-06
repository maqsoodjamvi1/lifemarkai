import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { cssContent } = await req.json();
  if (!cssContent || typeof cssContent !== "string") {
    return NextResponse.json({ error: "Missing cssContent" }, { status: 400 });
  }

  const projectId = id;

  // Verify user has access to this project (owner or collaborator).
  // Note: the previous version filtered on `owner_id` (column doesn't exist —
  // projects uses `user_id`) and embedded a SQL subquery inside .or(), which
  // PostgREST doesn't support. Check ownership and collaboration separately.
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .single();

  if (!project) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const isOwner = project.user_id === user.id;
  const isCollaborator =
    !isOwner &&
    (await (supabase as any)
      .from("collaborators")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle()
    ).data != null;

  if (!isOwner && !isCollaborator) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const path = "src/styles/tokens.css";

  // Upsert the tokens.css file
  const { data: file, error } = await (supabase as any)
    .from("project_files")
    .upsert(
      {
        project_id: projectId,
        path,
        content: cssContent,
        language: "css",
      },
      { onConflict: "project_id,path" }
    )
    .select()
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ file });
}
