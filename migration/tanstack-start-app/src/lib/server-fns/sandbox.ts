/**
 * Sandbox status / keep-alive — flags at import time; Modal SDK on demand.
 */
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { canReadProjectFiles, getProjectAccess } from "@/lib/project/access";
import {
  getSandboxProviderId,
  isSandboxEnabled,
} from "@/lib/sandbox/flags";
import { debugLog } from "@/lib/debug-log";

export async function getSandboxStatus() {
  const enabled = isSandboxEnabled();
  return {
    status: "ok" as const,
    enabled,
    provider: enabled ? getSandboxProviderId() : null,
  };
}

export async function keepAliveSandbox(data: any) {
    if (!isSandboxEnabled()) {
      return { status: "disabled" as const, enabled: false, alive: false };
    }

    const supabase = await createClient();
    const { user } = await getServerUser(supabase);
    if (!user) return { status: "unauthorized" as const };

    const access = await getProjectAccess(supabase, data.projectId, user.id);
    if (!canReadProjectFiles(access)) return { status: "not_found" as const };

    let sandboxId = data.sandboxId ?? "";
    let previewUrl = data.previewUrl;

    if (!sandboxId || !previewUrl) {
      const { data: project } = await (supabase as any)
        .from("projects")
        .select("preview_url, metadata")
        .eq("id", data.projectId)
        .maybeSingle();
      const meta =
        project?.metadata && typeof project.metadata === "object"
          ? (project.metadata as Record<string, unknown>)
          : {};
      if (!sandboxId && typeof meta.sandbox_id === "string") sandboxId = meta.sandbox_id;
      // preview_url is a column on projects (not metadata) — without it the
      // tunnel-health probe is skipped and zombie Modal tunnels stay blank.
      if (!previewUrl && typeof project?.preview_url === "string") {
        previewUrl = project.preview_url;
      }
    }

    if (!sandboxId) {
      return { status: "ok" as const, enabled: true, alive: false };
    }

    const { getSandboxProvider } = await import("@/lib/sandbox");
    const provider = getSandboxProvider();
    if (typeof provider.keepAlive !== "function") {
      return { status: "ok" as const, enabled: true, alive: true, unsupported: true };
    }

    try {
      const res = await provider.keepAlive(
        sandboxId,
        previewUrl ? { previewUrl } : undefined,
      );
      // #region agent log
      debugLog({
        hypothesisId: "H3",
        location: "src/lib/server-fns/sandbox.ts:keepAlive",
        message: "sandbox keep-alive result",
        data: {
          projectId: data.projectId,
          hadPreviewUrl: Boolean(previewUrl),
          alive: res.alive,
          tunnelHealthy: (res as { tunnelHealthy?: boolean }).tunnelHealthy,
          restarted: (res as { restarted?: boolean }).restarted,
        },
        runId: "tanstack-preview-fix",
      });
      // #endregion
      return { status: "ok" as const, enabled: true, ...res };
    } catch (err) {
      // #region agent log
      debugLog({
        hypothesisId: "H3",
        location: "src/lib/server-fns/sandbox.ts:keepAlive-error",
        message: "sandbox keep-alive threw",
        data: {
          projectId: data.projectId,
          error: err instanceof Error ? err.message : String(err),
        },
        runId: "tanstack-preview-fix",
      });
      // #endregion
      return {
        status: "ok" as const,
        enabled: true,
        alive: false,
        error: err instanceof Error ? err.message : "keep-alive failed",
      };
    }
}
