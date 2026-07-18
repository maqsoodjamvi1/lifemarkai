import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { getProjectAccess, canWriteProjectFiles } from "@/lib/project/access";

interface Params { params: Promise<{ id: string }> }

/**
 * Project monitoring settings (Lovable parity: "Project monitoring (Beta)").
 * Stored in projects.metadata.monitoring = { enabled, cadence, last_run_at }.
 * The nightly /api/health-scan cron runs due checks and emails the owner
 * about high/critical findings.
 */
export async function GET(_: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canWriteProjectFiles(access)) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: project } = await (supabase as any)
    .from("projects").select("metadata").eq("id", projectId).single();
  const monitoring = ((project?.metadata ?? {}) as { monitoring?: unknown }).monitoring ?? { enabled: false, cadence: "daily" };
  return NextResponse.json({ monitoring });
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canWriteProjectFiles(access)) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const { enabled, cadence } = (await req.json().catch(() => ({}))) as { enabled?: boolean; cadence?: string };
  if (typeof enabled !== "boolean") return NextResponse.json({ error: "enabled (boolean) required" }, { status: 400 });
  const safeCadence = cadence === "weekly" ? "weekly" : "daily";

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: project } = await (supabase as any)
    .from("projects").select("metadata").eq("id", projectId).single();
  const meta = (project?.metadata ?? {}) as Record<string, unknown>;
  const prev = (meta.monitoring ?? {}) as Record<string, unknown>;

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any)
    .from("projects")
    .update({ metadata: { ...meta, monitoring: { ...prev, enabled, cadence: safeCadence } } })
    .eq("id", projectId);

  return NextResponse.json({ ok: true, monitoring: { enabled, cadence: safeCadence } });
}
