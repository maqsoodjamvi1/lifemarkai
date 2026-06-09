import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import {
  canReadProjectFiles,
  canWriteProjectFiles,
  getProjectAccess,
} from "@/lib/project/access";

interface Params { params: Promise<{ id: string }> }

export async function GET(req: NextRequest, { params }: Params) {
  const { id } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, id, user.id);
  if (!canReadProjectFiles(access)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const url = new URL(req.url);
  const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "30"), 100);
  const offset = parseInt(url.searchParams.get("offset") ?? "0");

  // Build a unified activity feed from multiple tables
  const events: {
    id: string;
    type: string;
    title: string;
    detail?: string;
    actor?: string;
    created_at: string;
    meta?: Record<string, unknown>;
  }[] = [];

  // AI chat messages (assistant messages only)
  const { data: messages } = await (supabase as any)
    .from("messages")
    .select("id, role, content, created_at, model")
    .eq("project_id", id)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(50);

  for (const m of (messages ?? [])) {
    const content = typeof m.content === "string" ? m.content : "";
    events.push({
      id: `msg_${m.id}`,
      type: "ai_chat",
      title: "AI response generated",
      detail: content.slice(0, 120) + (content.length > 120 ? "…" : ""),
      created_at: m.created_at,
      meta: m.model ? { model: m.model } : undefined,
    });
  }

  // Deployments
  const { data: deploys } = await (supabase as any)
    .from("deployments")
    .select("id, status, deploy_url, created_at, provider")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  for (const d of (deploys ?? [])) {
    events.push({
      id: `deploy_${d.id}`,
      type: "deploy",
      title: `Deployed — ${d.status}`,
      detail: (d as any).deploy_url ?? undefined,
      created_at: d.created_at,
      meta: { provider: (d as any).provider ?? "netlify", status: d.status },
    });
  }

  // Snapshots / version history
  const { data: snapshots } = await (supabase as any)
    .from("project_snapshots")
    .select("id, label, created_at")
    .eq("project_id", id)
    .order("created_at", { ascending: false })
    .limit(20);

  for (const s of (snapshots ?? [])) {
    events.push({
      id: `snap_${s.id}`,
      type: "snapshot",
      title: `Snapshot saved${s.label ? `: ${s.label}` : ""}`,
      created_at: s.created_at,
    });
  }

  // File changes (recent project_files updates)
  const { data: files } = await (supabase as any)
    .from("project_files")
    .select("id, path, created_at, updated_at")
    .eq("project_id", id)
    .order("updated_at", { ascending: false })
    .limit(30);

  for (const f of (files ?? [])) {
    const isNew = f.created_at === f.updated_at;
    events.push({
      id: `file_${f.id}_${isNew ? "create" : "edit"}`,
      type: isNew ? "file_create" : "file_edit",
      title: isNew ? `File created: ${f.path}` : `File modified: ${f.path}`,
      detail: f.path,
      created_at: f.updated_at ?? f.created_at,
      meta: { path: f.path },
    });
  }

  // Sort all events newest-first, paginate
  events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  const page = events.slice(offset, offset + limit);

  return NextResponse.json({ events: page, total: events.length });
}

export async function POST(req: NextRequest, { params }: Params) {
  // Allow external event ingestion (e.g. from webhook handlers)
  const { id } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, id, user.id);
  if (!canWriteProjectFiles(access)) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json() as { type: string; title: string; detail?: string; meta?: Record<string, unknown> };
  if (!body.type || !body.title) return NextResponse.json({ error: "Missing fields" }, { status: 400 });

  // Store in audit_logs table if available, otherwise return synthetic event
  await (supabase as any).from("audit_logs").insert({
    user_id: user.id,
    project_id: id,
    action: body.type,
    resource_type: "project",
    resource_id: id,
    metadata: { title: body.title, detail: body.detail, ...body.meta },
  }).maybeSingle();

  return NextResponse.json({ ok: true });
}
