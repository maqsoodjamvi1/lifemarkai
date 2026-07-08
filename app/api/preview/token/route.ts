import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { signPreviewToken, previewTokenConfigured } from "@/lib/preview/preview-token";
import { buildPreviewUrl } from "@/lib/preview/preview-url";

export const runtime = "nodejs";

/**
 * POST /api/preview/token
 * Body: { projectId: string, sha?: string }
 *
 * Mints a short-lived, project-scoped preview token after verifying the caller
 * may view the project (owner, public project, or collaborator). Returns the
 * token plus a ready-to-use signed preview URL.
 */
export async function POST(req: NextRequest) {
  if (!previewTokenConfigured()) {
    return NextResponse.json(
      { error: "Preview tokens are not configured on this server." },
      { status: 501 },
    );
  }

  const body = (await req.json().catch(() => ({}))) as { projectId?: string; sha?: string };
  const projectId = body.projectId;
  if (!projectId) {
    return NextResponse.json({ error: "projectId is required" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const sb = supabase as any;
  const { data: project } = await sb
    .from("projects")
    .select("id, user_id, is_public")
    .eq("id", projectId)
    .single();

  if (!project) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let allowed = project.user_id === user.id || project.is_public === true;

  // Fall back to a collaborator check (project sharing).
  if (!allowed) {
    const { data: collab } = await sb
      .from("collaborators")
      .select("id")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .maybeSingle();
    allowed = !!collab;
  }

  if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const signed = signPreviewToken({ projectId, userId: user.id, sha: body.sha });
  if (!signed) {
    return NextResponse.json({ error: "Failed to sign preview token" }, { status: 500 });
  }

  const url = buildPreviewUrl({ projectId, token: signed.token, sha: body.sha });
  return NextResponse.json({ token: signed.token, url, expiresAt: signed.expiresAt });
}
