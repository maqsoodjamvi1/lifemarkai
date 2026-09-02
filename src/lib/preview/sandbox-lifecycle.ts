/**
 * Product preview lifecycle — one state machine for hook, waiting pane, and chat wait.
 *
 * Boot phases from Docker (`creating` / `writing` / `installing` / `starting` /
 * `ready`) are implementation detail. The UI and chat wait only on these states.
 */

export const SANDBOX_LIFECYCLES = [
  "unavailable",
  "booting",
  "ready",
  "paused",
  "resuming",
  "failed",
] as const;

export type SandboxLifecycle = (typeof SANDBOX_LIFECYCLES)[number];

/** After a pause, at most one full cold POST. Warm reconnect first. */
export const MAX_RESUME_COLD_BOOTS = 1;

export type SandboxLifecycleInput = {
  enabled: boolean;
  loading: boolean;
  previewUrl: string | null;
  phase: string | null;
  error: string | null;
  phaseDetail?: string | null;
  /** Idle reclaim detected — origin gone, files unchanged. */
  paused?: boolean;
  /** User or auto resume in flight. */
  resuming?: boolean;
};

const BOOT_PHASES = new Set(["creating", "writing", "installing", "starting"]);

export function isIdleReclaimText(text: string | null | undefined): boolean {
  if (!text?.trim()) return false;
  return /already finished|already completed|already shut down|FAILED_PRECONDITION|expired|idle|no longer exists|no longer responding|terminated|unreachable|container no longer|sandbox .*not found|container .*not found/i.test(
    text,
  );
}

export function isDeadSandboxPhase(phase: string | null | undefined, detail?: string | null): boolean {
  if (phase === "unreachable") return true;
  if (phase === "error" && isIdleReclaimText(detail)) return true;
  return isIdleReclaimText(`${phase ?? ""} ${detail ?? ""}`);
}

/** App failed to build — not idle reclaim; do not pause/resume-loop. */
export function isAppBuildFailure(phase: string | null | undefined): boolean {
  return phase === "app_error";
}

export function deriveSandboxLifecycle(input: SandboxLifecycleInput): SandboxLifecycle {
  if (input.resuming) return "resuming";
  if (input.paused) return "paused";
  if (!input.enabled && !input.loading) {
    if (input.error) return "failed";
    return "unavailable";
  }
  if (isAppBuildFailure(input.phase)) return "failed";
  if (input.previewUrl && input.phase === "ready") return "ready";

  const blob = `${input.error ?? ""} ${input.phaseDetail ?? ""} ${input.phase ?? ""}`;
  if (isIdleReclaimText(blob) && !input.loading && !input.previewUrl) return "paused";

  if (input.loading || (input.phase && BOOT_PHASES.has(input.phase))) return "booting";
  if (input.error) return "failed";
  if (!input.enabled) return "unavailable";
  if (input.previewUrl) return "ready";
  return "booting";
}

export type ResumePlan = "reconnect" | "cold" | "failed";

/**
 * After pause: reconnect (warm) first. If that did not yield a URL and we have
 * not used the cold-boot budget, one POST. Otherwise failed.
 */
export function planResumeAfterPause(opts: {
  reconnectHasUrl: boolean;
  reconnectWaking: boolean;
  coldBootsUsed: number;
}): ResumePlan {
  if (opts.reconnectHasUrl || opts.reconnectWaking) return "reconnect";
  if (opts.coldBootsUsed < MAX_RESUME_COLD_BOOTS) return "cold";
  return "failed";
}

export function announcePreviewLifecycle(
  lifecycle: SandboxLifecycle,
  host: Pick<EventTarget, "dispatchEvent"> | null | undefined =
    typeof window === "undefined" ? null : window,
): void {
  host?.dispatchEvent(
    new CustomEvent("lifemark-preview-lifecycle", { detail: { lifecycle } }),
  );
}
