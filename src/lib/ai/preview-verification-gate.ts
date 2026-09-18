export type PreviewVerificationStepName = "install" | "typecheck" | "build" | "health" | "browser";
export type PreviewVerificationStatus = "passed" | "failed" | "skipped";
export type PreviewVerificationStep = { name: PreviewVerificationStepName; status: PreviewVerificationStatus; detail?: string };
export type PreviewVerificationMode = "candidate" | "preview";

export interface PreviewVerificationVerdict {
  passed: boolean;
  required: PreviewVerificationStepName[];
  failures: PreviewVerificationStep[];
}

const ORDER: PreviewVerificationStepName[] = ["install", "typecheck", "build", "health", "browser"];

/** Fail-closed aggregation: absent and skipped checks are failures. */
export function evaluatePreviewVerificationGate(input: {
  mode: PreviewVerificationMode;
  steps: PreviewVerificationStep[];
}): PreviewVerificationVerdict {
  const required = input.mode === "preview" ? ORDER : ORDER.slice(0, 4);
  const byName = new Map(input.steps.map((step) => [step.name, step]));
  const failures = required.flatMap((name) => {
    const step = byName.get(name);
    return step?.status === "passed" ? [] : [step ?? { name, status: "skipped" as const, detail: "Required step produced no evidence" }];
  });
  return { passed: failures.length === 0, required, failures };
}
