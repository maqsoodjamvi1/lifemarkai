/**
 * POST /api/projects/:id/sandbox-preview/stop
 *
 * Tears down a running E2B sandbox (they bill per running minute). Called when
 * the preview panel unmounts / the user closes the preview. No-ops gracefully
 * when the sandbox backend isn't configured.
 *
 * Body: { sandboxId: string }
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canReadProjectFiles, getProjectAccess } from "@/lib/project/access";
import { getSandboxProvider, isSandboxEnabled } from "@/lib/sandbox";

export const runtime = "nodejs";

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
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

  let sandboxId = "";
  try {
    const body = (await req.json()) as { sandboxId?: string };
    sandboxId = body.sandboxId ?? "";
  } catch {
    /* empty body */
  }
  if (!sandboxId) {
    return NextResponse.json({ error: "sandboxId required" }, { status: 400 });
  }

  // Teardown is best-effort — a provider hiccup must not block the rest of cleanup.
  try {
    await getSandboxProvider().kill(sandboxId);
  } catch (e) {
    console.warn("[sandbox-preview/stop] kill failed:", e instanceof Error ? e.message : e);
  }

  // Clear the stale ephemeral preview URL so nothing points at the dead sandbox.
  const { error: clearErr } = await (supabase as any)
    .from("projects")
    .update({ preview_url: null })
    .eq("id", projectId);
  if (clearErr) {
    console.warn("[sandbox-preview/stop] failed to clear preview_url:", clearErr.message);
  }

  return NextResponse.json({ ok: true });
}
