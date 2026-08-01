/**
 * Native projects/[id]/activity — plain helpers for API route handlers.
 * (createServerFn from route handlers 500s in production — see project-files.ts)
 */
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canReadProjectFiles, canWriteProjectFiles, getProjectAccess } from "@/lib/project/access";

interface ActivityItem {
  id: string;
  type: string;
  title: string;
  detail?: string;
  actor?: string;
  created_at: string;
  meta?: Record<string, unknown>;
}

export async function getProjectActivity(input: {
  projectId: string;
  limit?: number;
  offset?: number;
}) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const access = await getProjectAccess(supabase, input.projectId, user.id);
  if (!canReadProjectFiles(access)) return { status: "not_found" as const };

  const limit = Math.min(input.limit ?? 30, 100);
  const offset = input.offset ?? 0;
  const events: ActivityItem[] = [];

  const { data: messages } = await (supabase as any)
    .from("messages")
    .select("id, role, content, created_at, model")
    .eq("project_id", input.projectId)
    .eq("role", "assistant")
    .order("created_at", { ascending: false })
    .limit(50);
  for (const m of messages ?? []) {
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

  const { data: deploys } = await (supabase as any)
    .from("deployments")
    // The deployments table's column is `url`. `deploy_url` does not exist, so this
    // select errored and the activity feed silently showed no deployments at all.
    .select("id, status, url, created_at, provider")
    .eq("project_id", input.projectId)
    .order("created_at", { ascending: false })
    .limit(20);
  for (const d of deploys ?? []) {
    events.push({
      id: `deploy_${d.id}`,
      type: "deploy",
      title: `Deployed — ${d.status}`,
      detail: d.url ?? undefined,
      created_at: d.created_at,
      meta: { provider: d.provider ?? "netlify", status: d.status },
    });
  }

  const { data: snapshots } = await (supabase as any)
    .from("project_snapshots")
    .select("id, label, created_at")
    .eq("project_id", input.projectId)
    .order("created_at", { ascending: false })
    .limit(20);
  for (const s of snapshots ?? []) {
    events.push({
      id: `snap_${s.id}`,
      type: "snapshot",
      title: `Snapshot saved${s.label ? `: ${s.label}` : ""}`,
      created_at: s.created_at,
    });
  }

  const { data: files } = await (supabase as any)
    .from("project_files")
    .select("id, path, created_at, updated_at")
    .eq("project_id", input.projectId)
    .order("updated_at", { ascending: false })
    .limit(30);
  for (const f of files ?? []) {
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

  events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  return { status: "ok" as const, events: events.slice(offset, offset + limit), total: events.length };
}

export async function ingestProjectActivity(input: {
  projectId: string;
  type: string;
  title: string;
  detail?: string;
  meta?: Record<string, unknown>;
}) {
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return { status: "unauthorized" as const };

  const access = await getProjectAccess(supabase, input.projectId, user.id);
  if (!canWriteProjectFiles(access)) return { status: "not_found" as const };
  if (!input.type || !input.title) return { status: "bad_request" as const };

  await (supabase as any)
    .from("audit_logs")
    .insert({
      user_id: user.id,
      project_id: input.projectId,
      action: input.type,
      resource_type: "project",
      resource_id: input.projectId,
      metadata: { title: input.title, detail: input.detail, ...input.meta },
    })
    .maybeSingle();
  return { status: "ok" as const };
}
