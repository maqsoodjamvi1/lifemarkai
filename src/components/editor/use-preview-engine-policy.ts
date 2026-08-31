import { useMemo } from "react";
import { isWebContainerPreviewEnabled,shouldUseWebContainer,type PreviewEngine } from "@/lib/preview/resolve-preview-engine";
import { resolveProjectRuntime,type ProjectRuntime } from "@/lib/project/runtime";
import type { ProjectFile } from "@/types/database";

export type PreviewEnginePolicyInput = {
  hasFiles: boolean;
  staticRuntime: boolean;
  sandboxEnabled: boolean;
  webContainerEnabled: boolean;
  explicitWebContainerFallback: boolean;
  /**
   * True when the project actually looks like a Vite/Node app (has a
   * package.json plus a vite config or Node entry file) — see
   * shouldUseWebContainer in resolve-preview-engine.ts, which the OTHER,
   * unused engine-resolution function already gates on. This one didn't,
   * so a project mid-generation (or one framework-detection missed) could
   * be routed straight into WebContainer with no package.json present,
   * where `npm install` fails immediately with a confusing error instead
   * of the preview falling back gracefully.
   */
  webContainerProjectShape: boolean;
};

/**
 * One deterministic preview decision:
 * a live Docker-backed sandbox is authoritative for EVERY runtime; static
 * projects fall back to the in-page srcdoc renderer only when no sandbox is
 * available; WebContainer is used only when the sandbox is unavailable AND the
 * caller explicitly requests the fallback.
 *
 * Static used to win outright, which meant a vanilla HTML/CSS/JS app rendered
 * through the srcdoc iframe even while its own sandbox was already live and
 * serving the identical document. That path is sandboxed WITHOUT
 * `allow-same-origin` — deliberately, because a srcdoc document inherits the
 * EMBEDDER's origin and generated app code must never reach lifemarkai.com's
 * session. But an opaque origin makes `localStorage` throw outright, and the
 * LifemarkData SDK swallows that (empty read, silent write), so the editor
 * showed a permanently empty app that persisted nothing, while the preview
 * subdomain — a real origin — showed the same app fully populated. Preferring
 * the sandbox when one exists puts the editor on that same real origin, so the
 * two agree and storage works, with no extra sandbox cost: this only picks a
 * sandbox that is already configured or booting.
 */
export function selectPreviewEngine(
  input: PreviewEnginePolicyInput,
): Exclude<PreviewEngine, "detecting"> {
  if (!input.hasFiles) return "unavailable";
  if (input.sandboxEnabled) return "sandbox";
  if (input.staticRuntime) return "static";
  if (
    input.explicitWebContainerFallback &&
    input.webContainerEnabled &&
    input.webContainerProjectShape
  ) {
    return "webcontainer";
  }
  return "unavailable";
}

export function usePreviewEnginePolicy(options: {
  files: ProjectFile[];
  framework?: string | null;
  runtime?: ProjectRuntime | null;
  sandboxEnabled: boolean;
  useWebContainers?: boolean;
}) {
  const staticRuntime =
    resolveProjectRuntime(options.runtime, options.framework, options.files) === "static";
  const webContainerEnabled =
    !staticRuntime && isWebContainerPreviewEnabled();
  const webContainerProjectShape = shouldUseWebContainer(options.files);

  const engine = useMemo(
    () =>
      selectPreviewEngine({
        hasFiles: options.files.length > 0,
        staticRuntime,
        sandboxEnabled: options.sandboxEnabled,
        webContainerEnabled,
        explicitWebContainerFallback: options.useWebContainers === true,
        webContainerProjectShape,
      }),
    [
      options.files.length,
      options.sandboxEnabled,
      options.useWebContainers,
      staticRuntime,
      webContainerEnabled,
      webContainerProjectShape,
    ],
  );

  return {
    engine,
    staticRuntime,
    webContainerEnabled,
    sandboxAvailable: options.sandboxEnabled,
  };
}
