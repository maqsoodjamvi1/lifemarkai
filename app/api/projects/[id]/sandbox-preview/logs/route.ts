/**
 * GET /api/projects/:id/sandbox-preview/logs?sandboxId=
 * Tail Modal Vite/Next log for the preview Console tab (Lovable parity).
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canReadProjectFiles, getProjectAccess } from "@/lib/project/access";
import { getSandboxProvider, isSandboxEnabled } from "@/lib/sandbox";

export const runtime = "nodejs";
export const maxDuration = 30;

interface Params {
  params: Promise<{ id: string }>;
}

export async function GET(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;

  if (!isSandboxEnabled()) {
    return NextResponse.json({ enabled: false });
  }

  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canReadProjectFiles(access)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const queryId = req.nextUrl.searchParams.get("sandboxId");
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("metadata")
    .eq("id", projectId)
    .maybeSingle();
  const meta =
    project?.metadata && typeof project.metadata === "object"
      ? (project.metadata as Record<string, unknown>)
      : {};
  const sandboxId =
    queryId || (typeof meta.sandbox_id === "string" ? meta.sandbox_id : null);

  if (!sandboxId) {
    return NextResponse.json({ enabled: true, ok: false, error: "no_sandbox_id" });
  }

  const provider = getSandboxProvider();
  if (!provider.getDevLogs) {
    return NextResponse.json({
      enabled: true,
      ok: false,
      error: "Logs not supported for this sandbox provider",
      provider: provider.id,
    });
  }

  try {
    const lines = Number(req.nextUrl.searchParams.get("lines") ?? 80);
    const text = await provider.getDevLogs(sandboxId, lines);
    return NextResponse.json({
      enabled: true,
      ok: true,
      sandboxId,
      provider: provider.id,
      logs: text,
    });
  } catch (err) {
    return NextResponse.json({
      enabled: true,
      ok: false,
      error: err instanceof Error ? err.message : "Failed to read logs",
    });
  }
}
