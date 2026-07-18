/**
 * PATCH /api/projects/:id/sandbox-preview/sync
 *
 * Incrementally writes updated project files into a running E2B sandbox so
 * preview stays live after AI edits (Lovable server-side model). No-ops when
 * sandbox backend isn't configured.
 *
 * Body: { sandboxId: string, files?: Array<{ path: string; content: string }> }
 * When `files` is omitted, all project_files rows are synced.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canReadProjectFiles, getProjectAccess } from "@/lib/project/access";
import { getSandboxProvider, isSandboxEnabled, type SandboxFile } from "@/lib/sandbox";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { patchSandboxPreviewFiles } from "@/lib/preview/patch-sandbox-preview-files";

export const runtime = "nodejs";
export const maxDuration = 120;

interface Params {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: Params) {
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

  const rl = await rateLimitAsync(`sandbox-sync:${user.id}`, RATE_LIMITS.ai);
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  let sandboxId = "";
  let clientFiles: SandboxFile[] | undefined;
  try {
    const body = (await req.json()) as {
      sandboxId?: string;
      files?: Array<{ path?: string; content?: string }>;
    };
    sandboxId = body.sandboxId ?? "";
    if (Array.isArray(body.files)) {
      clientFiles = body.files
        .filter((f) => typeof f.path === "string")
        .map((f) => ({ path: f.path!, content: f.content ?? "" }));
    }
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!sandboxId) {
    return NextResponse.json({ error: "sandboxId required" }, { status: 400 });
  }

  let files = clientFiles;
  if (!files?.length) {
    const { data: rows, error } = await (supabase as any)
      .from("project_files")
      .select("path, content")
      .eq("project_id", projectId);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    files = (rows ?? [])
      .filter((r: { path?: string }) => typeof r.path === "string")
      .map((r: { path: string; content: string | null }) => ({
        path: r.path,
        content: r.content ?? "",
      }));
  }

  if (!files?.length) {
    return NextResponse.json({ ok: false, error: "No files to sync" });
  }

  const { data: projectRow } = await (supabase as any)
    .from("projects")
    .select("is_public")
    .eq("id", projectId)
    .maybeSingle();

  const patchOpts = {
    projectId,
    isPublic: !!projectRow?.is_public,
    appOrigin: process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, ""),
  };

  const syncFiles: SandboxFile[] = patchSandboxPreviewFiles(files, patchOpts);
  const provider = getSandboxProvider();
  try {
    await provider.writeFiles(sandboxId, syncFiles);

    const pkgChanged = syncFiles.some((f) => f.path.replace(/\\/g, "/") === "package.json");
    if (pkgChanged) {
      void provider.exec(sandboxId, "npm install").catch(() => {});
    }

    return NextResponse.json({ enabled: true, ok: true, fileCount: syncFiles.length });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Sync failed";
    return NextResponse.json({ enabled: true, ok: false, error: msg });
  }
}
