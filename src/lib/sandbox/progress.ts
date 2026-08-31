export type SandboxPhase =
  | "cleanup"
  | "creating"
  | "writing"
  | "installing"
  | "starting"
  | "ready"
  | "app_error"
  | "unreachable"
  | "backend_unreachable"
  | "error";

export type SandboxProgressState = "running" | "ready" | "error";

/** Provider-neutral progress contract consumed by API and editor layers. */
export interface SandboxProgressEvent {
  type: "sandbox_progress";
  phase: SandboxPhase;
  state: SandboxProgressState;
  detail?: string;
}

export function createSandboxProgress(phase: SandboxPhase, detail?: string): SandboxProgressEvent {
  const failed = phase === "error" || phase === "app_error" || phase === "unreachable" || phase === "backend_unreachable";
  return {
    type: "sandbox_progress",
    phase,
    state: phase === "ready" ? "ready" : failed ? "error" : "running",
    ...(detail ? { detail } : {}),
  };
}
