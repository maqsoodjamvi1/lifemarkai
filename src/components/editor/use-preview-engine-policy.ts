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
 *
 * The one exception: a sandbox with a settled, non-transient error
 * (`sandboxError`) falls through to WebContainer instead, PROVIDED
 * WebContainer is actually usable here (explicitly requested, enabled, and
 * the project has the right shape) — never automatically preferring
 * WebContainer over a healthy or still-booting sandbox, only stepping in
 * once the sandbox itself has nothing left to offer. Without a usable
 * WebContainer fallback, this still returns "sandbox" so the existing
 * error/retry UI for that engine stays reachable.
 */
export function selectPreviewEngine(
  input: PreviewEnginePolicyInput,
): Exclude<PreviewEngine, "detecting"> {
  if (!input.hasFiles) return "unavailable";
  const webContainerFallbackUsable =
    input.explicitWebContainerFallback &&
    input.webContainerEnabled &&
    input.webContainerProjectShape;
  if (input.sandboxEnabled && !(input.sandboxError && webContainerFallbackUsable)) {
    return "sandbox";
  }
  if (input.staticRuntime) return "static";
  if (webContainerFallbackUsable) return "webcontainer";
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
