import { useMemo } from "react";
import { isWebContainerPreviewEnabled,shouldUseWebContainer,type PreviewEngine } from "@/lib/preview/resolve-preview-engine";
import { resolveProjectRuntime,type ProjectRuntime } from "@/lib/project/runtime";
import type { ProjectFile } from "@/types/database";

export type PreviewEnginePolicyInput = {
  hasFiles: boolean;
  staticRuntime: boolean;
  sandboxEnabled: boolean;
  /**
   * True when the sandbox has a real, settled error to show (not just mid-
   * boot). `sandboxEnabled` is a "credentials configured" flag that, per
   * useSandboxPreview's own design, stays true forever once first observed
   * true — even through every subsequent failure — so before this field
   * existed `sandboxEnabled` alone pinned the engine to "sandbox" for the
   * rest of the session no matter how badly or how long it kept failing.
   * By the time a caller's `error` is non-null, useSandboxPreview has
   * already run its own internal one-shot cold retry for a dead-tunnel
   * phase (see coldRetryRef in use-sandbox-preview.ts) — this is not a raw
   * first-attempt blip, it is what's left after that self-heal already ran.
   */
  sandboxError?: boolean;
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
 * Product preview: sandbox origin only (Lovable). No WebContainer, no srcdoc
 * stand-in, no editor-origin /preview HTML as the running app.
 */
export function selectPreviewEngine(
  input: PreviewEnginePolicyInput,
): Exclude<PreviewEngine, "detecting"> {
  if (!input.hasFiles) return "unavailable";
  if (input.sandboxEnabled) return "sandbox";
  return "unavailable";
}

export function usePreviewEnginePolicy(options: {
  files: ProjectFile[];
  framework?: string | null;
  runtime?: ProjectRuntime | null;
  sandboxEnabled: boolean;
  /** A settled (non-transient) sandbox error — see selectPreviewEngine's own doc comment. */
  sandboxError?: boolean;
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
        sandboxError: Boolean(options.sandboxError),
        webContainerEnabled,
        explicitWebContainerFallback: options.useWebContainers === true,
        webContainerProjectShape,
      }),
    [
      options.files.length,
      options.sandboxEnabled,
      options.sandboxError,
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
