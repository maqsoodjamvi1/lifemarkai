import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { NextRequest, NextResponse } from "next/server";
import { canWriteProjectFiles, getProjectAccess } from "@/lib/project/access";

export const runtime = "nodejs";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { cssContent } = await req.json();
  if (!cssContent || typeof cssContent !== "string") {
    return NextResponse.json({ error: "Missing cssContent" }, { status: 400 });
  }

  const projectId = id;
  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canWriteProjectFiles(access)) {
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
