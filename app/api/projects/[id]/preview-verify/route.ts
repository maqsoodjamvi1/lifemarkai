import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { buildFallbackHtml } from "@/lib/preview/build-fallback-html";
import { verifyPreviewHtml } from "@/lib/ai/preview-verify";

export const runtime = "nodejs";

/** POST — quick preview sanity check after AI builds (no deploy URL required). */
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

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
