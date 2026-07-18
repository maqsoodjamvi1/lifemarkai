/**
 * POST /api/projects/:id/sandbox-preview
 *
 * Runs the project's files in a real isolated sandbox (Modal — Lovable parity;
 * E2B fallback) and returns a LIVE preview URL. When no sandbox backend is
 * configured, responds with { enabled: false } so the client falls back to
 * WebContainer / srcdoc preview.
 */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canReadProjectFiles, getProjectAccess } from "@/lib/project/access";
import {
  detectSandboxStart,
  getSandboxProvider,
  getSandboxProviderId,
  isSandboxEnabled,
  sandboxNameForProject,
  type SandboxFile,
} from "@/lib/sandbox";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import { patchSandboxPreviewFiles } from "@/lib/preview/patch-sandbox-preview-files";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Params {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;

  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Not configured → tell the client to use the in-browser preview engine.
  if (!isSandboxEnabled()) {
    return NextResponse.json({ enabled: false, reason: "sandbox_not_configured" });
  }

  const access = await getProjectAccess(supabase, projectId, user.id);
  if (!canReadProjectFiles(access)) {
    return NextResponse.json({ error: "Project not found" }, { status: 404 });
  }

  const rl = await rateLimitAsync(`sandbox-preview:${user.id}`, RATE_LIMITS.ai);
  if (!rl.success) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  const { data: rows, error } = await (supabase as any)
    .from("project_files")
    .select("path, content")
    .eq("project_id", projectId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!rows?.length) {
    return NextResponse.json({ enabled: true, ok: false, error: "Project has no files." });
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

  const files: SandboxFile[] = patchSandboxPreviewFiles(
    rows
      .filter((r: { path?: string; content?: string }) => typeof r.path === "string")
      .map((r: { path: string; content: string | null }) => ({
        path: r.path,
        content: r.content ?? "",
      })),
    patchOpts,
  );

  const { port, startCommand } = detectSandboxStart(files);

  const provider = getSandboxProvider();
  const result = await provider.runProject({
    files,
    port,
    startCommand,
    projectId,
    template: process.env.E2B_TEMPLATE,
  });

  if (!result.ok) {
    return NextResponse.json({ enabled: true, ok: false, error: result.error, logs: result.logs });
  }

  // Persist the live preview URL + sandbox id for reconnects (Lovable warm-session parity).
  const { data: existing } = await (supabase as any)
    .from("projects")
    .select("metadata")
    .eq("id", projectId)
    .maybeSingle();
  const prevMeta = (existing?.metadata && typeof existing.metadata === "object")
    ? (existing.metadata as Record<string, unknown>)
    : {};
  const { error: previewUrlErr } = await (supabase as any)
    .from("projects")
    .update({
      preview_url: result.previewUrl,
      metadata: {
        ...prevMeta,
        sandbox_id: result.sandboxId,
        sandbox_port: port,
        sandbox_provider: getSandboxProviderId(),
        sandbox_updated_at: new Date().toISOString(),
      },
    })
    .eq("id", projectId);
  if (previewUrlErr) {
    console.warn("[sandbox-preview] failed to persist preview_url:", previewUrlErr.message);
  }

  return NextResponse.json({
    enabled: true,
    ok: true,
    previewUrl: result.previewUrl,
    sandboxId: result.sandboxId,
    logs: result.logs,
    provider: getSandboxProviderId(),
    sandboxName: sandboxNameForProject(projectId),
  });
}

/** GET — reconnect to a warm sandbox when possible (Lovable parity). */
export async function GET(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;

  if (!isSandboxEnabled()) {
    return NextResponse.json({ enabled: false, reason: "sandbox_not_configured" });
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
    .select("preview_url, metadata")
    .eq("id", projectId)
    .maybeSingle();

  const meta = (project?.metadata && typeof project.metadata === "object")
    ? (project.metadata as Record<string, unknown>)
    : {};
  const sandboxId =
    queryId ||
    (typeof meta.sandbox_id === "string" ? meta.sandbox_id : null);

  if (!sandboxId) {
    const provider = getSandboxProvider();
    if (provider.reconnectByProject) {
      const { port } = detectSandboxStart([]);
      const byProject = await provider.reconnectByProject(projectId, port);
      if (byProject.ok && byProject.previewUrl) {
        await (supabase as any)
          .from("projects")
          .update({
            preview_url: byProject.previewUrl,
            metadata: {
              ...meta,
              sandbox_id: byProject.sandboxId,
              sandbox_port: port,
              sandbox_provider: getSandboxProviderId(),
              sandbox_updated_at: new Date().toISOString(),
            },
          })
          .eq("id", projectId);
        return NextResponse.json({
          enabled: true,
          ok: true,
          previewUrl: byProject.previewUrl,
          sandboxId: byProject.sandboxId,
          reconnected: true,
          provider: getSandboxProviderId(),
        });
      }
    }
    return NextResponse.json({ enabled: true, ok: false, reason: "no_sandbox_id" });
  }

  const provider = getSandboxProvider();
  const storedPort = typeof meta.sandbox_port === "number" ? meta.sandbox_port : undefined;
  const port = storedPort ?? detectSandboxStart([]).port;
  const result = await provider.reconnect(sandboxId, port);
  if (!result.ok || !result.previewUrl) {
    return NextResponse.json({
      enabled: true,
      ok: false,
      error: result.error ?? "Sandbox expired",
      sandboxId,
    });
  }

  await (supabase as any)
    .from("projects")
    .update({ preview_url: result.previewUrl })
    .eq("id", projectId);

  return NextResponse.json({
    enabled: true,
    ok: true,
    previewUrl: result.previewUrl,
    sandboxId: result.sandboxId ?? sandboxId,
    reconnected: true,
    provider: getSandboxProviderId(),
  });
}
