// @ts-nocheck
/**
 * Anonymous ("no account needed") preview comments — Lovable parity.
 *
 *   GET  /api/embed/comments?projectId=&pagePath=  → list comments for a PUBLIC project
 *   POST /api/embed/comments                       → post a guest comment on a PUBLIC project
 *
 * Guest writes go through the service role after validating the project is
 * public, so no permissive anonymous RLS policy is needed. CORS-open so the
 * comment widget works from a deployed app on any domain.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};
export function OPTIONS() { return new NextResponse(null, { status: 204, headers: CORS }); }

async function assertPublic(supabase: any, projectId: string) {
  const { data } = await supabase.from("projects").select("id, is_public").eq("id", projectId).single();
  return Boolean(data?.is_public);
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");
  const pagePath = url.searchParams.get("pagePath");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400, headers: CORS });

  const supabase = await createAdminClient();
  if (!(await assertPublic(supabase, projectId))) {
    return NextResponse.json({ error: "Project is not public" }, { status: 403, headers: CORS });
  }

  let q = supabase
    .from("project_comments")
    .select("id, content, guest_name, is_guest, page_path, element_xpath, element_preview, resolved, created_at")
    .eq("project_id", projectId)
    .order("created_at", { ascending: true })
    .limit(500);
  if (pagePath) q = q.eq("page_path", pagePath);

  const { data, error } = await q;
  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });

  // Never expose a real user's identity to anonymous viewers.
  const comments = (data ?? []).map((c: any) => ({
    ...c,
    author: c.is_guest ? (c.guest_name || "Guest") : "Team",
    guest_name: undefined,
  }));
  return NextResponse.json({ comments }, { headers: CORS });
}

export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON" }, { status: 400, headers: CORS }); }

  const projectId = body.projectId;
  const content = String(body.content ?? "").trim();
  const guestName = String(body.guestName ?? "").trim().slice(0, 60);
  if (!projectId || !content) return NextResponse.json({ error: "projectId and content required" }, { status: 400, headers: CORS });
  if (content.length > 4000) return NextResponse.json({ error: "Comment too long (max 4000)" }, { status: 400, headers: CORS });
  if (!guestName) return NextResponse.json({ error: "guestName required" }, { status: 400, headers: CORS });

  const supabase = await createAdminClient();
  if (!(await assertPublic(supabase, projectId))) {
    return NextResponse.json({ error: "Comments are only open on public projects" }, { status: 403, headers: CORS });
  }

  const { data, error } = await supabase
    .from("project_comments")
    .insert({
      project_id: projectId,
      user_id: null,
      is_guest: true,
      guest_name: guestName,
      content,
      page_path: body.pagePath ?? null,
      element_xpath: body.elementXpath ?? null,
      element_tag: body.elementTag ?? null,
      element_preview: body.elementPreview ?? null,
    })
    .select("id, content, page_path, element_xpath, element_preview, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  return NextResponse.json({ comment: { ...data, author: guestName, is_guest: true } }, { status: 201, headers: CORS });
}
