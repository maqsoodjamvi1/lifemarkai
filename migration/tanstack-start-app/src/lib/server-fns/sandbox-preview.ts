/**
 * Native sandbox-preview GET (phase poll / reconnect), logs, stop.
 * POST boot + PATCH sync stay proxied to Next (full Modal pipeline).
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { zodValidator } from "@tanstack/zod-adapter";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canReadProjectFiles, getProjectAccess } from "@/lib/project/access";
import {
  getSandboxProviderId,
  isSandboxEnabled,
} from "@/lib/sandbox/flags";
import { debugLog } from "@/lib/debug-log";

async function loadSandbox() {
  return import("@/lib/sandbox");
}

export const getSandboxPreview = createServerFn({ method: "GET" })
  .validator(
    zodValidator(
      z.object({
        projectId: z.string().uuid(),
        sandboxId: z.string().optional(),
        phaseOnly: z.boolean().optional(),
      }),
    ),
  )
  .handler(async ({ data }) => {
    if (!isSandboxEnabled()) {
      return { status: "disabled" as const, enabled: false, reason: "sandbox_not_configured" };
    }

    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await getProjectAccess(supabase, data.projectId, user.id);
    if (!canReadProjectFiles(access)) return { status: "not_found" as const };

    const { data: project } = await (supabase as any)
      .from("projects")
      .select("preview_url, metadata")
      .eq("id", data.projectId)
      .maybeSingle();

    const meta =
      project?.metadata && typeof project.metadata === "object"
        ? (project.metadata as Record<string, unknown>)
        : {};
    const sandboxId =
      data.sandboxId || (typeof meta.sandbox_id === "string" ? meta.sandbox_id : null);
    const phase = typeof meta.sandbox_phase === "string" ? meta.sandbox_phase : null;
    const phaseDetail =
      typeof meta.sandbox_phase_detail === "string" ? meta.sandbox_phase_detail : null;

    if (data.phaseOnly) {
      // Ready requires a live sandbox id — a leftover preview_url after Modal
      // reclaim (sandbox_id cleared) must not look "ok" or the client frames a
      // dead tunnel and skips / races the cold POST.
      const ready =
        phase === "ready" &&
        Boolean(project?.preview_url) &&
        Boolean(sandboxId);
      const staleReadyWithoutId =
        Boolean(project?.preview_url) &&
        (phase === "ready" || phase === "error" || !phase) &&
        !sandboxId;
      // #region agent log
      debugLog({
        hypothesisId: "H2",
        location: "src/lib/server-fns/sandbox-preview.ts:phaseOnly",
        message: "phase-only trusted persisted state",
        data: {
          projectId: data.projectId,
          phase,
          hasPreviewUrl: Boolean(project?.preview_url),
          hasSandboxId: Boolean(sandboxId),
          ready,
          staleReadyWithoutId,
        },
      });
      // #endregion
      if (staleReadyWithoutId) {
        // Do NOT mark phase=error here — that races a concurrent cold POST and
        // makes the client discard a just-booted sandbox (observed: POST ok:true
        // with sandboxId, then phaseOnly still missing id → error → reboot loop).
        return {
          status: "ok" as const,
          enabled: true,
          ok: false,
          previewUrl: null,
          sandboxId: null,
          phase: phase === "ready" ? "creating" : phase,
          phaseDetail: "Waiting for sandbox id…",
          provider: getSandboxProviderId(),
        };
      }
      return {
        status: "ok" as const,
        enabled: true,
        ok: ready,
        previewUrl: ready ? (project?.preview_url ?? null) : null,
        sandboxId,
        phase,
        phaseDetail,
        provider: getSandboxProviderId(),
      };
    }

    if (!sandboxId) {
      const { getSandboxProvider, detectSandboxStart } = await loadSandbox();
      const provider = getSandboxProvider();
      if (provider.reconnectByProject) {
        const storedPort = typeof meta.sandbox_port === "number" ? meta.sandbox_port : undefined;
        const { port } = detectSandboxStart([]);
        const byProject = await provider.reconnectByProject(
          data.projectId,
          storedPort ?? port,
        );
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
            .eq("id", data.projectId);
          return {
            status: "ok" as const,
            enabled: true,
            ok: true,
            previewUrl: byProject.previewUrl,
            sandboxId: byProject.sandboxId,
            reconnected: true,
            provider: getSandboxProviderId(),
            phase: "ready",
          };
        }
      }

      // Do not clear preview_url/metadata here — a concurrent cold POST (proxied
      // to Next) can lose its sandbox_id write to this metadata overwrite.
      // phaseOnly already refuses to serve a ready URL without sandbox_id.
      return {
        status: "ok" as const,
        enabled: true,
        ok: false,
        reason: "no_sandbox_id",
        sandboxId: null,
        phase: phase === "ready" ? "creating" : phase,
        phaseDetail: phaseDetail ?? "Cold start required",
        provider: getSandboxProviderId(),
      };
    }

    const { getSandboxProvider, detectSandboxStart } = await loadSandbox();
    const provider = getSandboxProvider();
    const storedPort = typeof meta.sandbox_port === "number" ? meta.sandbox_port : undefined;
    const port = storedPort ?? detectSandboxStart([]).port;
    const result = await provider.reconnect(sandboxId, port);
    // #region agent log
    debugLog({
      hypothesisId: "H1",
      location: "src/lib/server-fns/sandbox-preview.ts:reconnect",
      message: "sandbox reconnect result",
      data: {
        projectId: data.projectId,
        ok: result.ok,
        hasPreviewUrl: Boolean(result.previewUrl),
        error: result.error ?? null,
      },
    });
    // #endregion
    if (result.ok && result.previewUrl) {
      await (supabase as any)
        .from("projects")
        .update({
          preview_url: result.previewUrl,
          metadata: {
            ...meta,
            sandbox_id: result.sandboxId ?? sandboxId,
            sandbox_phase: "ready",
            sandbox_phase_detail: null,
            sandbox_updated_at: new Date().toISOString(),
          },
        })
        .eq("id", data.projectId);
      return {
        status: "ok" as const,
        enabled: true,
        ok: true,
        previewUrl: result.previewUrl,
        sandboxId: result.sandboxId ?? sandboxId,
        reconnected: true,
        provider: getSandboxProviderId(),
        phase: "ready",
        phaseDetail: null,
      };
    }

    // Stale client/session sandboxId is common after reclaim — fall back to the
    // project-named Modal sandbox so the iframe is not left on a dead tunnel.
    if (provider.reconnectByProject) {
      const byProject = await provider.reconnectByProject(data.projectId, port);
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
              sandbox_phase_detail: null,
              sandbox_updated_at: new Date().toISOString(),
            },
          })
          .eq("id", data.projectId);
        // #region agent log
        debugLog({
          hypothesisId: "H1",
          location: "src/lib/server-fns/sandbox-preview.ts:recovered-from-stale",
          message: "recovered via reconnectByProject",
          data: { projectId: data.projectId, sandboxId: byProject.sandboxId },
        });
        // #endregion
        return {
          status: "ok" as const,
          enabled: true,
          ok: true,
          previewUrl: byProject.previewUrl,
          sandboxId: byProject.sandboxId,
          reconnected: true,
          recoveredFromStaleId: true,
          provider: getSandboxProviderId(),
          phase: "ready",
          phaseDetail: null,
        };
      }
    }

    // Clear stale URL + sandbox id so the client cold-boots instead of framing
    // a dead tunnel / retrying reconnect against a terminated Modal sandbox.
    const expireDetail = result.error ?? "Sandbox expired";
    await (supabase as any)
      .from("projects")
      .update({
        preview_url: null,
        metadata: {
          ...meta,
          sandbox_id: null,
          sandbox_phase: "error",
          sandbox_phase_detail: expireDetail,
          sandbox_updated_at: new Date().toISOString(),
        },
      })
      .eq("id", data.projectId);

    // #region agent log
    debugLog({
      hypothesisId: "H1",
      location: "src/lib/server-fns/sandbox-preview.ts:cleared-terminated",
      message: "cleared terminated sandbox for cold reboot",
      data: {
        projectId: data.projectId,
        priorSandboxId: sandboxId,
        error: expireDetail,
      },
      runId: "tanstack-preview-fix",
    });
    // #endregion
    return {
      status: "ok" as const,
      enabled: true,
      ok: false,
      reason: "reconnect_failed",
      sandboxId: null,
      phase: "error",
      phaseDetail: expireDetail,
      provider: getSandboxProviderId(),
      error: expireDetail,
    };
  });

/**
 * Native cold POST — avoids Vite SSR OOM from loading the Next route adapter
 * (observed: FATAL heap OOM mid-POST while dispatching app/api sandbox-preview).
 */
export const createSandboxPreview = createServerFn({ method: "POST" })
  .validator(zodValidator(z.object({ projectId: z.string().uuid() })))
  .handler(async ({ data }) => {
    if (!isSandboxEnabled()) {
      return {
        status: "disabled" as const,
        enabled: false,
        reason: "sandbox_not_configured",
      };
    }

    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await getProjectAccess(supabase, data.projectId, user.id);
    if (!canReadProjectFiles(access)) return { status: "not_found" as const };

    // #region agent log
    debugLog({
      hypothesisId: "H3",
      location: "src/lib/server-fns/sandbox-preview.ts:create-start",
      message: "native cold POST start",
      data: { projectId: data.projectId },
      runId: "tanstack-preview-fix",
    });
    // #endregion

    const { data: rows, error } = await (supabase as any)
      .from("project_files")
      .select("path, content")
      .eq("project_id", data.projectId);

    if (error) {
      return { status: "ok" as const, enabled: true, ok: false, error: error.message };
    }
    if (!rows?.length) {
      return {
        status: "ok" as const,
        enabled: true,
        ok: false,
        error: "Project has no files.",
      };
    }

    const { data: projectRow } = await (supabase as any)
      .from("projects")
      .select("is_public, metadata")
      .eq("id", data.projectId)
      .maybeSingle();

    const prevMeta =
      projectRow?.metadata && typeof projectRow.metadata === "object"
        ? (projectRow.metadata as Record<string, unknown>)
        : {};

    type SandboxFile = { path: string; content: string };
    const rawFiles: SandboxFile[] = rows
      .filter((r: { path?: string }) => typeof r.path === "string")
      .map((r: { path: string; content: string | null }) => ({
        path: r.path,
        content: r.content ?? "",
      }));

    try {
      const pkgRow = rawFiles.find((f) => f.path.replace(/\\/g, "/") === "package.json");
      if (pkgRow?.content) {
        const { syncPackageJsonDeps } = await import(
          "@/lib/ai/npm-auto-install"
        );
        const sync = syncPackageJsonDeps(rawFiles, pkgRow.content);
        if (sync && sync.addedPackages.length > 0) {
          pkgRow.content = sync.updated;
          await (supabase as any)
            .from("project_files")
            .update({ content: sync.updated, updated_at: new Date().toISOString() })
            .eq("project_id", data.projectId)
            .eq("path", "package.json");
        }
      }
    } catch {
      /* non-fatal */
    }

    const { patchSandboxPreviewFiles } = await import(
      "@/lib/preview/patch-sandbox-preview-files"
    );
    const files = patchSandboxPreviewFiles(rawFiles, {
      projectId: data.projectId,
      isPublic: !!projectRow?.is_public,
      appOrigin: process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, ""),
    });

    const {
      getSandboxProvider,
      detectSandboxStart,
      sandboxNameForProject,
    } = await loadSandbox();
    const { port, startCommand } = detectSandboxStart(files);

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
        .eq("id", data.projectId)
        .then(() => {})
        .catch(() => {});
    };

    const provider = getSandboxProvider();
    const result = await provider.runProject({
      files,
      port,
      startCommand,
      projectId: data.projectId,
      onProgress: (phase, detail) => persistPhase(phase, detail),
    });

    if (!result.ok) {
      persistPhase("error", result.error);
      // #region agent log
      debugLog({
        hypothesisId: "H3",
        location: "src/lib/server-fns/sandbox-preview.ts:create-fail",
        message: "native cold POST failed",
        data: {
          projectId: data.projectId,
          error: (result.error ?? "").slice(0, 240),
        },
        runId: "tanstack-preview-fix",
      });
      // #endregion
      return {
        status: "ok" as const,
        enabled: true,
        ok: false,
        error: result.error,
        logs: result.logs,
        phase: "error",
        phaseDetail: result.error ?? null,
        provider: getSandboxProviderId(),
      };
    }

    await (supabase as any)
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
      .eq("id", data.projectId);

    // #region agent log
    debugLog({
      hypothesisId: "H3",
      location: "src/lib/server-fns/sandbox-preview.ts:create-ok",
      message: "native cold POST ready",
      data: {
        projectId: data.projectId,
        hasPreviewUrl: Boolean(result.previewUrl),
        hasSandboxId: Boolean(result.sandboxId),
      },
      runId: "tanstack-preview-fix",
    });
    // #endregion

    return {
      status: "ok" as const,
      enabled: true,
      ok: true,
      previewUrl: result.previewUrl,
      sandboxId: result.sandboxId,
      logs: result.logs,
      provider: getSandboxProviderId(),
      phase: "ready",
      sandboxName: sandboxNameForProject(data.projectId),
    };
  });

export const getSandboxLogs = createServerFn({ method: "GET" })
  .validator(
    zodValidator(
      z.object({
        projectId: z.string().uuid(),
        sandboxId: z.string().optional(),
        lines: z.coerce.number().int().min(1).max(500).optional(),
      }),
    ),
  )
  .handler(async ({ data }) => {
    if (!isSandboxEnabled()) {
      return { status: "disabled" as const, enabled: false };
    }

    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await getProjectAccess(supabase, data.projectId, user.id);
    if (!canReadProjectFiles(access)) return { status: "not_found" as const };

    const { data: project } = await (supabase as any)
      .from("projects")
      .select("metadata")
      .eq("id", data.projectId)
      .maybeSingle();
    const meta =
      project?.metadata && typeof project.metadata === "object"
        ? (project.metadata as Record<string, unknown>)
        : {};
    const sandboxId =
      data.sandboxId || (typeof meta.sandbox_id === "string" ? meta.sandbox_id : null);

    if (!sandboxId) {
      return { status: "ok" as const, enabled: true, ok: false, error: "no_sandbox_id" };
    }

    const { getSandboxProvider } = await loadSandbox();
    const provider = getSandboxProvider();
    if (!provider.getDevLogs) {
      return {
        status: "ok" as const,
        enabled: true,
        ok: false,
        error: "Logs not supported for this sandbox provider",
        provider: provider.id,
      };
    }

    try {
      const text = await provider.getDevLogs(sandboxId, data.lines ?? 80);
      return {
        status: "ok" as const,
        enabled: true,
        ok: true,
        sandboxId,
        provider: provider.id,
        logs: text,
      };
    } catch (err) {
      return {
        status: "ok" as const,
        enabled: true,
        ok: false,
        error: err instanceof Error ? err.message : "Failed to read logs",
      };
    }
  });

export const stopSandbox = createServerFn({ method: "POST" })
  .validator(
    zodValidator(
      z.object({
        projectId: z.string().uuid(),
        sandboxId: z.string().min(1),
      }),
    ),
  )
  .handler(async ({ data }) => {
    if (!isSandboxEnabled()) {
      return { status: "disabled" as const, enabled: false };
    }

    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await getProjectAccess(supabase, data.projectId, user.id);
    if (!canReadProjectFiles(access)) return { status: "not_found" as const };

    try {
      const { getSandboxProvider } = await loadSandbox();
      await getSandboxProvider().kill(data.sandboxId);
    } catch (e) {
      console.warn(
        "[sandbox-preview/stop] kill failed:",
        e instanceof Error ? e.message : e,
      );
    }

    await (supabase as any)
      .from("projects")
      .update({ preview_url: null })
      .eq("id", data.projectId);

    return { status: "ok" as const, ok: true };
  });
