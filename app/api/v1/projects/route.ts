// @ts-nocheck
/**
 * Public API v1 — Projects collection.
 *
 *   GET  /api/v1/projects            → list your projects        (scope: projects:read)
 *   POST /api/v1/projects            → create a project          (scope: projects:write)
 *
 * Auth: `Authorization: Bearer lmk_…` (create keys in dashboard → API keys).
 * All access is scoped to the key owner.
 */
import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { authenticateApiRequest } from "@/lib/api/api-key";

export const runtime = "nodejs";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
};

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}

export async function GET(req: NextRequest) {
  const auth = await authenticateApiRequest(req, "projects:read");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: CORS });

  const url = new URL(req.url);
  const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") ?? "50", 10) || 50, 1), 100);

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, description, framework, status, deployed_url, created_at, updated_at")
    .eq("user_id", auth.userId)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  return NextResponse.json({ projects: data ?? [] }, { headers: CORS });
}

export async function POST(req: NextRequest) {
  const auth = await authenticateApiRequest(req, "projects:write");
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: CORS });

  let body: { name?: string; description?: string; framework?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid JSON body" }, { status: 400, headers: CORS }); }

  const name = (body.name ?? "").trim();
  if (!name || name.length > 100) {
    return NextResponse.json({ error: "name is required (max 100 chars)" }, { status: 400, headers: CORS });
  }
  const allowedFrameworks = ["nextjs", "react", "vue", "svelte", "vanilla"];
  const framework = allowedFrameworks.includes(body.framework ?? "") ? body.framework : "nextjs";
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("projects")
    .insert({
      user_id: auth.userId,
      name,
      description: body.description ?? "",
      framework,
      slug: `${slug || "app"}-${Date.now()}`,
    })
    .select("id, name, description, framework, status, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500, headers: CORS });
  return NextResponse.json({ project: data }, { status: 201, headers: CORS });
}
