export type PreviewVerificationStepName = "install" | "typecheck" | "build" | "health" | "browser";
export type PreviewVerificationStatus = "passed" | "failed" | "skipped";
export type PreviewVerificationSource =
  | "sandbox-runner"
  | "typecheck-worker"
  | "build-worker"
  | "health-probe"
  | "playwright-worker";

export type PreviewVerificationStep = {
  name: PreviewVerificationStepName;
  status: PreviewVerificationStatus;
  detail?: string;
  /** Correlates every observation to one immutable verification attempt. */
  runId: string;
  /** Prevents mixing evidence produced by different sandbox images. */
  sandboxImage: string;
  /** The component that observed the result; the repair agent is never valid. */
  source: PreviewVerificationSource;
  observedAt: string;
};
export type PreviewVerificationMode = "candidate" | "preview";

export interface PreviewVerificationVerdict {
  passed: boolean;
  required: PreviewVerificationStepName[];
  failures: PreviewVerificationStep[];
  runId: string | null;
  sandboxImage: string | null;
}

const ORDER: PreviewVerificationStepName[] = ["install", "typecheck", "build", "health", "browser"];

/** Fail-closed aggregation: absent and skipped checks are failures. */
export function evaluatePreviewVerificationGate(input: {
  mode: PreviewVerificationMode;
  steps: PreviewVerificationStep[];
  /** Defaults to now; injectable so freshness is deterministic in tests. */
  evaluatedAt?: string;
  maxEvidenceAgeMs?: number;
}): PreviewVerificationVerdict {
  const required = input.mode === "preview" ? ORDER : ORDER.slice(0, 4);
  const byName = new Map(input.steps.map((step) => [step.name, step]));
  const runIds = new Set(input.steps.map((step) => step.runId).filter(Boolean));
  const images = new Set(input.steps.map((step) => step.sandboxImage).filter(Boolean));
  const runId = runIds.size === 1 ? [...runIds][0]! : null;
  const sandboxImage = images.size === 1 ? [...images][0]! : null;
  const evaluatedAt = Date.parse(input.evaluatedAt ?? new Date().toISOString());
  const maxAge = input.maxEvidenceAgeMs ?? 10 * 60_000;
  const failures = required.flatMap((name) => {
    const step = byName.get(name);
    if (!step) {
      return [{
        name,
        status: "skipped" as const,
        detail: "Required step produced no evidence",
        runId: runId ?? "",
        sandboxImage: sandboxImage ?? "",
        source: sourceFor(name),
        observedAt: input.evaluatedAt ?? new Date().toISOString(),
      }];
    }
    const observedAt = Date.parse(step.observedAt);
    const wrongSource = step.source !== sourceFor(name);
    const stale = !Number.isFinite(observedAt) || observedAt > evaluatedAt || evaluatedAt - observedAt > maxAge;
    const previous = required.slice(0, required.indexOf(name)).map((prior) => byName.get(prior));
    const outOfOrder = previous.some((prior) => prior && Date.parse(prior.observedAt) > observedAt);
    if (step.status === "passed" && !wrongSource && !stale && !outOfOrder) return [];
    return [{
      ...step,
      status: step.status === "passed" ? "failed" as const : step.status,
      detail: wrongSource
        ? `Evidence source ${step.source} cannot attest ${name}`
        : stale
          ? "Evidence is missing a valid fresh timestamp"
          : outOfOrder
            ? "Evidence was produced out of workflow order"
            : step.detail,
    }];
  });
  if (!runId || !sandboxImage) {
    const name = required[0]!;
    failures.unshift({
      name,
      status: "failed",
      detail: !runId ? "Evidence spans multiple or missing run IDs" : "Evidence spans multiple or missing sandbox images",
      runId: "",
      sandboxImage: "",
      source: sourceFor(name),
      observedAt: input.evaluatedAt ?? new Date().toISOString(),
    });
  }
  return { passed: failures.length === 0, required, failures, runId, sandboxImage };
}

function sourceFor(name: PreviewVerificationStepName): PreviewVerificationSource {
  if (name === "install") return "sandbox-runner";
  if (name === "typecheck") return "typecheck-worker";
  if (name === "build") return "build-worker";
  if (name === "health") return "health-probe";
  return "playwright-worker";
}
