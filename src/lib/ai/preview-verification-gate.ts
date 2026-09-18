/**
 * Independent preview-verification gate.
 *
 * Combines EnvGraph classification, a single targeted repair, RETRACE-style
 * independent verification, and CI-Repair-Bench's real-workflow accept rule:
 * install → type-check → production build → health check → Playwright page-load.
 * A skipped step is a failure, not a pass.
 */
import { recordEvent } from "../observability/events.ts";
import type { CandidateBuildResult } from "../sandbox/candidate-build.ts";
import {
  classifyPreviewFailureLayer,
  type PreviewFailureLayer,
} from "./env-graph.ts";
import {
  computeFileDiffs,
  verifyRepairIndependently,
  type FileDiff,
  type RepairVerifierVerdict,
} from "./repair-verifier.ts";

export type PreviewWorkflowStep = "install" | "typecheck" | "build" | "boot" | "smoke";

export const PREVIEW_WORKFLOW_STEPS: PreviewWorkflowStep[] = [
  "install",
  "typecheck",
  "build",
  "boot",
  "smoke",
];

/** Candidate verification cannot Playwright the live (old) app. */
export const CANDIDATE_WORKFLOW_STEPS: PreviewWorkflowStep[] = [
  "install",
  "typecheck",
  "build",
  "boot",
];

export interface WorkflowStepEvidence {
  ran: boolean;
  passed: boolean;
  errors: string[];
}

export type PreviewGateEvidence = Record<PreviewWorkflowStep, WorkflowStepEvidence>;

export interface PreviewGateSummary {
  accepted: boolean;
  layer: PreviewFailureLayer | null;
  repairAccepted: boolean | null;
  falseGreen: boolean;
  incompleteWorkflow: boolean;
  mismatch: string | null;
}

export interface PreviewGateVerdict {
  accepted: boolean;
  layer: PreviewFailureLayer | null;
  workflow: PreviewGateEvidence;
  incompleteWorkflow: boolean;
  verifier: RepairVerifierVerdict | null;
  rejectionReasons: string[];
  summary: PreviewGateSummary;
}

export function skippedStep(reason: string): WorkflowStepEvidence {
  return { ran: false, passed: false, errors: [reason] };
}

export function passedStep(): WorkflowStepEvidence {
  return { ran: true, passed: true, errors: [] };
}

export function failedStep(errors: string[]): WorkflowStepEvidence {
  return { ran: true, passed: false, errors: errors.length > 0 ? errors : ["step failed"] };
}

export function emptyPreviewGateEvidence(): PreviewGateEvidence {
  return {
    install: skippedStep("install did not run"),
    typecheck: skippedStep("type-check did not run"),
    build: skippedStep("production build did not run"),
    boot: skippedStep("health check did not run"),
    smoke: skippedStep("Playwright page-load did not run"),
  };
}

export function evidenceFromCandidateBuild(build: CandidateBuildResult): Partial<PreviewGateEvidence> {
  const installFailed = build.errors.some((message) => /npm install|eresolve|not on the install allowlist/i.test(message))
    || /dependenc/i.test(build.reason ?? "");
  const typecheckFailed = build.errors.some((message) => /type-check/i.test(message));
  const bootFailed = build.errors.some((message) => /dist artifact/i.test(message));
  const installRan = build.stages?.install != null || build.available || installFailed;
  const typecheckRan = build.stages?.typecheck === true || typecheckFailed;
  const buildRan = build.available || build.stages?.build === true;
  const bootRan = build.stages?.boot === true || bootFailed;
  return {
    install: installRan
      ? (installFailed || build.stages?.install === false
        ? failedStep(build.errors.filter((message) => /npm|dependenc|allowlist|eresolve/i.test(message)))
        : passedStep())
      : skippedStep(build.reason ?? "install did not run"),
    typecheck: typecheckRan
      ? (typecheckFailed ? failedStep(build.errors.filter((message) => /type-check/i.test(message))) : passedStep())
      : skippedStep("candidate type-check did not run on this image"),
    build: buildRan
      ? (build.passed && !installFailed && !typecheckFailed ? passedStep() : failedStep(build.errors))
      : skippedStep(build.reason ?? "production build did not run"),
    boot: bootRan
      ? (bootFailed ? failedStep(build.errors.filter((message) => /dist artifact/i.test(message))) : passedStep())
      : skippedStep("candidate production artifact was not health-checked"),
  };
}

export function mergePreviewGateEvidence(
  ...parts: Array<Partial<PreviewGateEvidence> | undefined>
): PreviewGateEvidence {
  const merged = emptyPreviewGateEvidence();
  for (const part of parts) {
    if (!part) continue;
    for (const step of PREVIEW_WORKFLOW_STEPS) {
      const next = part[step];
      if (!next) continue;
      const current = merged[step];
      if (!current.ran && next.ran) {
        merged[step] = next;
      } else if (current.ran && next.ran && current.passed && !next.passed) {
        merged[step] = next;
      } else if (!current.ran && !next.ran && next.errors[0] && next.errors[0] !== current.errors[0]) {
        merged[step] = next;
      }
    }
  }
  return merged;
}

export function previewWorkflowPassed(
  evidence: PreviewGateEvidence,
  required: PreviewWorkflowStep[] = PREVIEW_WORKFLOW_STEPS,
): { ok: boolean; missing: PreviewWorkflowStep[] } {
  const missing = required.filter((step) => !evidence[step].ran || !evidence[step].passed);
  return { ok: missing.length === 0, missing };
}

export function evaluatePreviewVerificationGate(input: {
  originalFailures: Array<{ type?: string; message: string }>;
  remainingErrors: string[];
  diffs: FileDiff[];
  evidence: PreviewGateEvidence;
  requiredSteps?: PreviewWorkflowStep[];
  repairAgentDiagnosis?: string;
}): PreviewGateVerdict {
  const required = input.requiredSteps ?? PREVIEW_WORKFLOW_STEPS;
  const layer = input.originalFailures.length > 0
    ? classifyPreviewFailureLayer(input.originalFailures)
    : input.remainingErrors.length > 0
      ? classifyPreviewFailureLayer(input.remainingErrors.map((message) => ({ message })))
      : null;
  const workflow = previewWorkflowPassed(input.evidence, required);
  const hadPatch = input.diffs.length > 0;
  const verifier = hadPatch || input.originalFailures.length > 0
    ? verifyRepairIndependently({
      originalFailures: input.originalFailures,
      diffs: input.diffs,
      remainingErrors: input.remainingErrors,
      repairAgentDiagnosis: input.repairAgentDiagnosis,
    })
    : null;

  const rejectionReasons: string[] = [];
  if (!workflow.ok) {
    rejectionReasons.push(`incomplete preview workflow: ${workflow.missing.join(", ")}`);
  }
  if (input.remainingErrors.length > 0) {
    rejectionReasons.push(input.remainingErrors[0]);
  }
  if (verifier && !verifier.accepted) {
    rejectionReasons.push(verifier.mismatch ?? "independent verifier rejected the patch");
  }

  const falseGreen = verifier?.falseGreen === true
    || (workflow.ok && input.remainingErrors.length === 0 && hadPatch && verifier?.accepted === false);

  const accepted = rejectionReasons.length === 0 && (verifier ? verifier.accepted : input.remainingErrors.length === 0 && workflow.ok);

  const verdict: PreviewGateVerdict = {
    accepted,
    layer,
    workflow: input.evidence,
    incompleteWorkflow: !workflow.ok,
    verifier,
    rejectionReasons,
    summary: {
      accepted,
      layer,
      repairAccepted: hadPatch ? verifier?.accepted === true : null,
      falseGreen,
      incompleteWorkflow: !workflow.ok,
      mismatch: verifier?.mismatch ?? null,
    },
  };

  recordEvent("preview_gate_completed", {
    accepted,
    layer: layer ?? "",
    repairAccepted: verdict.summary.repairAccepted === true,
    falseGreen,
    incompleteWorkflow: !workflow.ok,
    missingSteps: workflow.missing.join(","),
  });
  if (verifier) {
    recordEvent("repair_verifier_completed", {
      accepted: verifier.accepted,
      originalLayer: verifier.originalLayer ?? "",
      reconstructedLayer: verifier.reconstructed.layer ?? "",
      falseGreen: verifier.falseGreen,
      remainingOriginal: verifier.remainingOriginal,
    });
  }
  return verdict;
}

export function diffsFromFixedFiles(
  before: Array<{ path: string; content?: string | null }>,
  fixedFiles: Array<{ path: string; content?: string | null }>,
  after?: Array<{ path: string; content?: string | null }>,
): FileDiff[] {
  if (after) return computeFileDiffs(before, after);
  const overlay = new Map(before.map((file) => [file.path, file]));
  for (const file of fixedFiles) overlay.set(file.path, file);
  return computeFileDiffs(before, Array.from(overlay.values()));
}
