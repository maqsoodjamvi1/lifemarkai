// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import {
  isManagementConfigured,
  pauseManagedProject,
  restoreManagedProject,
} from "@/lib/cloud/management";

/**
 * POST /api/cloud/pause — manually pause or wake a project's Cloud backend.
 * Body: { projectId: string, action: "pause" | "wake" }
 *
 * Lovable parity (Jul 8 2026): "Pause a Lovable Cloud project" — stops
 * compute usage while keeping data; fully reversible with Wake up.
 * With the Management API configured this pauses the REAL Supabase project;
 * in local mode it flips the status flag (billing cron skips paused rows).
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, action } = (await req.json().catch(() => ({}))) as {
    projectId?: string; action?: "pause" | "wake";
  };
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });
  if (action !== "pause" && action !== "wake") {
    return NextResponse.json({ error: 'action must be "pause" or "wake"' }, { status: 400 });
  }

  const { data: project } = await supabase
    .from("projects")
    .select("id, cloud_enabled, cloud_status, cloud_project_ref, metadata")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.cloud_enabled) {
    return NextResponse.json({ error: "Cloud is not enabled for this project" }, { status: 400 });
  }

  if (action === "pause" && project.cloud_status === "paused") {
    return NextResponse.json({ ok: true, status: "paused", message: "Already paused" });
  }
  if (action === "wake" && project.cloud_status !== "paused") {
    return NextResponse.json({ ok: true, status: project.cloud_status, message: "Not paused" });
  }

  // Real infrastructure pause/restore when a managed project exists
  let infraNote: string | undefined;
  if (project.cloud_project_ref && isManagementConfigured()) {
    const res = action === "pause"
      ? await pauseManagedProject(project.cloud_project_ref)
      : await restoreManagedProject(project.cloud_project_ref);
    if (!res.ok) infraNote = res.error; // flag still flips — billing stops either way
  }

  const meta = (project.metadata ?? {}) as Record<string, unknown>;
  await supabase
    .from("projects")
    .update({
      cloud_status: action === "pause" ? "paused" : "active",
      metadata: {
        ...meta,
        cloud_paused_manually: action === "pause",
        cloud_paused_idle: action === "pause" ? (meta.cloud_paused_idle ?? false) : false,
        cloud_paused_at: action === "pause" ? new Date().toISOString() : null,
      },
    })
    .eq("id", projectId);

  return NextResponse.json({
    ok: true,
    status: action === "pause" ? "paused" : "active",
    ...(infraNote ? { note: `Infrastructure call: ${infraNote}` } : {}),
  });
}
