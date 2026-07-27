/**
 * Owner-facing management of a project's App-as-MCP config (migration 153).
 *   GET  /api/projects/:id/mcp  → { enabled, token, actions, endpoint }
 *   PUT  /api/projects/:id/mcp  → { enabled?, actions?, rotateToken? }
 *
 * The public JSON-RPC surface external agents call lives at
 * /api/apps/:id/mcp (token-authed). This route is for the app owner to
 * enable it and declare the tools.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { getProjectAccess, canReadProjectFiles } from "@/lib/project/access";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

function endpointFor(projectId: string): string {
  const base = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ?? "";
  return `${base}/api/apps/${projectId}/mcp`;
}

export async function GET(_req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, id, user.id);
  if (!canReadProjectFiles(access)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const { data } = await (supabase as any)
    .from("app_mcp")
    .select("enabled, token, actions")
    .eq("project_id", id)
    .maybeSingle();

  return NextResponse.json({
    enabled: data?.enabled ?? false,
    token: data?.token ?? null,
    actions: data?.actions ?? [],
    endpoint: endpointFor(id),
  });
}

export async function PUT(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Only project owner/editor may change MCP config.
  const access = await getProjectAccess(supabase, id, user.id);
  if (!canReadProjectFiles(access) || access?.role === "viewer") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  let body: { enabled?: boolean; actions?: unknown; rotateToken?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const patch: Record<string, unknown> = { project_id: id, updated_at: new Date().toISOString() };
  if (typeof body.enabled === "boolean") patch.enabled = body.enabled;
  if (Array.isArray(body.actions)) patch.actions = body.actions;
  if (body.rotateToken) {
    // 24 random bytes → hex, matching the migration default shape.
    const bytes = new Uint8Array(24);
    crypto.getRandomValues(bytes);
    patch.token = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }

  const { data, error } = await (supabase as any)
    .from("app_mcp")
    .upsert(patch, { onConflict: "project_id" })
    .select("enabled, token, actions")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    enabled: data?.enabled ?? false,
    token: data?.token ?? null,
    actions: data?.actions ?? [],
    endpoint: endpointFor(id),
  });
}
