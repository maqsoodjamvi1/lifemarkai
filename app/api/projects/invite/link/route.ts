/**
 * POST /api/projects/invite/link
 *   Body: { projectId, role?, maxUses?, expiresInDays? }
 *   Returns: { token, link, expiresAt }
 *
 * DELETE /api/projects/invite/link?id=<tokenId>
 *   Revokes an invite token.
 *
 * GET /api/projects/invite/link?projectId=<id>
 *   Lists active tokens for a project.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/server";

// ── POST — create a new invite link ──────────────────────────────────────────
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, role = "viewer", maxUses, expiresInDays = 7 } =
    await req.json() as { projectId: string; role?: string; maxUses?: number; expiresInDays?: number };

  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  // Verify ownership or admin role
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id")
    .eq("id", projectId)
    .single();

  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const isOwner = project.user_id === user.id;
  if (!isOwner) {
    const { data: collab } = await (supabase as any)
      .from("collaborators")
      .select("role")
      .eq("project_id", projectId)
      .eq("user_id", user.id)
      .single();
    if (!collab || collab.role !== "admin") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const expiresAt = new Date(Date.now() + expiresInDays * 86_400_000).toISOString();

  const admin = await createAdminClient();
  const { data: tokenRow, error } = await (admin as any)
    .from("project_invite_tokens")
    .insert({
      project_id:  projectId,
      created_by:  user.id,
      role,
      expires_at:  expiresAt,
      ...(maxUses != null ? { max_uses: maxUses } : {}),
    })
    .select("id, token, expires_at, role, used_count, max_uses")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const link = `${process.env.NEXT_PUBLIC_APP_URL}/invite/${tokenRow.token as string}`;
  return NextResponse.json({ ...tokenRow, link }, { status: 201 });
}

// ── GET — list active tokens for a project ────────────────────────────────────
export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const { data } = await (supabase as any)
    .from("project_invite_tokens")
    .select("id, token, role, expires_at, used_count, max_uses, created_at")
    .eq("project_id", projectId)
    .eq("created_by", user.id)
    .gt("expires_at", new Date().toISOString())
    .order("created_at", { ascending: false });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "";
  const rows = (data ?? []).map((r: { token: string; [key: string]: unknown }) => ({
    ...r,
    link: `${appUrl}/invite/${r.token}`,
  }));
  return NextResponse.json(rows);
}

// ── DELETE — revoke a token ───────────────────────────────────────────────────
export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  await (supabase as any)
    .from("project_invite_tokens")
    .delete()
    .eq("id", id)
    .eq("created_by", user.id);

  return NextResponse.json({ ok: true });
}
