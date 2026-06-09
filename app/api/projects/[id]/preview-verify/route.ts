import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { buildFallbackHtml } from "@/lib/preview/build-fallback-html";
import { verifyPreviewHtml } from "@/lib/ai/preview-verify";
import { canReadProjectFiles, getProjectAccess } from "@/lib/project/access";

export const runtime = "nodejs";

/** POST — quick preview sanity check after AI builds (no deploy URL required). */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, id, user.id);
  if (!canReadProjectFiles(access)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data: files, error } = await (supabase as any)
    .from("project_files")
    .select("path, content, language, project_id, id, created_at, updated_at")
    .eq("project_id", id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!files?.length) {
    return NextResponse.json({ ok: false, checks: [{ name: "Files", pass: false, detail: "No files" }] });
  }

  const html = buildFallbackHtml(files);
  const result = verifyPreviewHtml(html);
  return NextResponse.json(result);
}
