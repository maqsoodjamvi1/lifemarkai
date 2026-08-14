import { useMemo } from "react";
import { isWebContainerPreviewEnabled,type PreviewEngine } from "@/lib/preview/resolve-preview-engine";
import { resolveProjectRuntime,type ProjectRuntime } from "@/lib/project/runtime";
import type { ProjectFile } from "@/types/database";

export type PreviewEnginePolicyInput = {
  hasFiles: boolean;
  staticRuntime: boolean;
  sandboxEnabled: boolean;
  webContainerEnabled: boolean;
  explicitWebContainerFallback: boolean;
};

/**
 * One deterministic preview decision:
 * static projects render statically; Docker-backed sandbox is authoritative;
 * WebContainer is used only when the sandbox is unavailable AND the caller
 * explicitly requests the fallback.
 */
export function selectPreviewEngine(
  input: PreviewEnginePolicyInput,
): Exclude<PreviewEngine, "detecting"> {
  if (!input.hasFiles) return "unavailable";
  if (input.staticRuntime) return "static";
  if (input.sandboxEnabled) return "sandbox";
  if (input.explicitWebContainerFallback && input.webContainerEnabled) {
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

  const engine = useMemo(
    () =>
      selectPreviewEngine({
        hasFiles: options.files.length > 0,
        staticRuntime,
        sandboxEnabled: options.sandboxEnabled,
        webContainerEnabled,
        explicitWebContainerFallback: options.useWebContainers === true,
      }),
    [
      options.files.length,
      options.sandboxEnabled,
      options.useWebContainers,
      staticRuntime,
      webContainerEnabled,
    ],
  );

  return {
    engine,
    staticRuntime,
    webContainerEnabled,
    sandboxAvailable: options.sandboxEnabled,
  };
}
