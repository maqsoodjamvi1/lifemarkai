/**
 * POST /api/projects/:id/sandbox-preview
 *
 * Runs the project's files in a Modal sandbox (Lovable parity) and returns a
 * LIVE preview tunnel URL. When Modal isn't configured, responds with
 * `{ enabled: false }` so the editor shows "Modal preview required"
 * (not WebContainer / srcdoc / esbuild).
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

  // Not configured → client shows "Modal preview required".
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

  const rawFiles: SandboxFile[] = rows
    .filter((r: { path?: string; content?: string }) => typeof r.path === "string")
    .map((r: { path: string; content: string | null }) => ({
      path: r.path,
      content: r.content ?? "",
    }));

  // Cold-boot dependency reconciliation: a project whose persisted package.json
  // already omits an imported package (class-variance-authority, @radix-ui/*,
  // tailwind-merge, …) would crash on first mount before any sync could fix it.
  // Repair package.json BEFORE the sandbox boots + npm-installs.
  try {
    const pkgRow = rawFiles.find((f) => f.path.replace(/\\/g, "/") === "package.json");
    if (pkgRow?.content) {
      const { syncPackageJsonDeps } = await import("@/lib/ai/npm-auto-install");
      const sync = syncPackageJsonDeps(rawFiles, pkgRow.content);
      if (sync && sync.addedPackages.length > 0) {
        pkgRow.content = sync.updated;
        await (supabase as any)
          .from("project_files")
          .update({ content: sync.updated, updated_at: new Date().toISOString() })
          .eq("project_id", projectId)
          .eq("path", "package.json");
      }
    }
  } catch { /* non-fatal */ }

  const files: SandboxFile[] = patchSandboxPreviewFiles(rawFiles, patchOpts);

  const { port, startCommand } = detectSandboxStart(files);

  const { data: existing } = await (supabase as any)
    .from("projects")
    .select("metadata")
    .eq("id", projectId)
    .maybeSingle();
  const prevMeta = (existing?.metadata && typeof existing.metadata === "object")
    ? (existing.metadata as Record<string, unknown>)
    : {};

  const persistPhase = (phase: string, detail?: string) => {
    void (supabase as any)
      .from("projects")
      .update({
        metadata: {
          ...prevMeta,
          sandbox_phase: phase,
          sandbox_phase_detail: detail ?? null,
          sandbox_provider: getSandboxProviderId(),
          sandbox_updated_at: new Date().toISOString(),
        },
      })
      .eq("id", projectId)
      .then(() => {})
      .catch(() => {});
  };

  const provider = getSandboxProvider();
  // Modal-first cloud preview (Lovable parity). Do not pass E2B templates here.
  const result = await provider.runProject({
    files,
    port,
    startCommand,
    projectId,
    onProgress: (phase, detail) => persistPhase(phase, detail),
  });

  if (!result.ok) {
    persistPhase("error", result.error);
    return NextResponse.json({ enabled: true, ok: false, error: result.error, logs: result.logs });
  }

  // Persist the live preview URL + sandbox id for reconnects (Lovable warm-session parity).
  const { error: previewUrlErr } = await (supabase as any)
    .from("projects")
    .update({
      preview_url: result.previewUrl,
      metadata: {
        ...prevMeta,
        sandbox_id: result.sandboxId,
        sandbox_port: port,
        sandbox_provider: getSandboxProviderId(),
        sandbox_phase: "ready",
        sandbox_phase_detail: null,
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
    phase: "ready",
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
  const phaseOnly = req.nextUrl.searchParams.get("phaseOnly") === "1";
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

  // Lightweight boot-progress poll — never mark ok on a stale preview_url alone
  // (dead Modal tunnels were blanking the iframe while phase stuck at "writing").
  if (phaseOnly) {
    const phase = typeof meta.sandbox_phase === "string" ? meta.sandbox_phase : null;
    const phaseDetail =
      typeof meta.sandbox_phase_detail === "string" ? meta.sandbox_phase_detail : null;
    const ready = phase === "ready" && Boolean(project?.preview_url);
    return NextResponse.json({
      enabled: true,
      ok: ready,
      previewUrl: ready ? project?.preview_url ?? null : null,
      sandboxId,
      phase,
      phaseDetail,
      provider: getSandboxProviderId(),
    });
  }

  const phaseFromMeta =
    typeof meta.sandbox_phase === "string" ? meta.sandbox_phase : null;
  const phaseDetailFromMeta =
    typeof meta.sandbox_phase_detail === "string" ? meta.sandbox_phase_detail : null;

  if (!sandboxId) {
    const provider = getSandboxProvider();
    if (provider.reconnectByProject) {
      const storedPort = typeof meta.sandbox_port === "number" ? meta.sandbox_port : undefined;
      const { port } = detectSandboxStart([]);
      const byProject = await provider.reconnectByProject(projectId, storedPort ?? port);
      if (byProject.ok && byProject.previewUrl) {
        await (supabase as any)
          .from("projects")
          .update({
            preview_url: byProject.previewUrl,
            metadata: {
              ...meta,
              sandbox_id: byProject.sandboxId,
              sandbox_port: storedPort ?? port,
              sandbox_provider: getSandboxProviderId(),
              sandbox_phase: "ready",
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
          phase: "ready",
        });
      }
    }
    return NextResponse.json({
      enabled: true,
      ok: false,
      reason: "no_sandbox_id",
      phase: phaseFromMeta,
      phaseDetail: phaseDetailFromMeta,
      provider: getSandboxProviderId(),
    });
  }

  const provider = getSandboxProvider();
  const storedPort = typeof meta.sandbox_port === "number" ? meta.sandbox_port : undefined;
  const port = storedPort ?? detectSandboxStart([]).port;
  const result = await provider.reconnect(sandboxId, port);
  if (result.ok && result.previewUrl) {
    // Persist the EFFECTIVE sandbox id too — updating only preview_url leaves
    // metadata.sandbox_id stale, and phaseOnly polls hand that stale id back to
    // the client, whose later syncs then hit a dead sandbox forever.
    await (supabase as any)
      .from("projects")
      .update({
        preview_url: result.previewUrl,
        metadata: {
          ...meta,
          sandbox_id: result.sandboxId ?? sandboxId,
          sandbox_updated_at: new Date().toISOString(),
        },
      })
      .eq("id", projectId);

    return NextResponse.json({
      enabled: true,
      ok: true,
      previewUrl: result.previewUrl,
      sandboxId: result.sandboxId ?? sandboxId,
      reconnected: true,
      provider: getSandboxProviderId(),
      phase: typeof meta.sandbox_phase === "string" ? meta.sandbox_phase : "ready",
      phaseDetail:
        typeof meta.sandbox_phase_detail === "string" ? meta.sandbox_phase_detail : null,
    });
  }

  // Stale client/session sandboxId is common after reclaim — fall back to the
  // project-named Modal sandbox so the iframe is not left on a dead tunnel.
  if (provider.reconnectByProject) {
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
            sandbox_phase: "ready",
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
        recoveredFromStaleId: true,
        provider: getSandboxProviderId(),
        phase: "ready",
      });
    }
  }

  // Clear stale URL + sandbox id so the client cold-boots instead of framing a
  // dead tunnel / retrying reconnect against a terminated Modal sandbox.
  await (supabase as any)
    .from("projects")
    .update({
      preview_url: null,
      metadata: {
        ...meta,
        sandbox_id: null,
        sandbox_phase: "error",
        sandbox_phase_detail: result.error ?? "Sandbox expired",
        sandbox_updated_at: new Date().toISOString(),
      },
    })
    .eq("id", projectId);

  // #region agent log
  fetch("http://127.0.0.1:7580/ingest/4eab943a-2827-4583-b27a-87e40bad58c8", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Debug-Session-Id": "32a6e2" },
    body: JSON.stringify({
      sessionId: "32a6e2",
      runId: "preview-fix",
      hypothesisId: "C",
      location: "sandbox-preview/route.ts:GET",
      message: "cleared terminated sandbox",
      data: { projectId, sandboxId, error: result.error ?? "Sandbox expired" },
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion

  return NextResponse.json({
    enabled: true,
    ok: false,
    error: result.error ?? "Sandbox expired",
    sandboxId: null,
    phase: "error",
    phaseDetail: result.error ?? "Sandbox expired",
  });
}
