/**
 * Vendor-neutral generation-attempt trace.
 *
 * One attempt is one user request's trip through plan → contract → generate →
 * validate → repair → verify. Step ids are stable so a worker restart can
 * resume instead of minting a duplicate sandbox. Payloads never include
 * prompts, file contents, or secrets — those are blocked by recordEvent.
 */
import { correlationFields, newCorrelationId, setCorrelation } from "../observability/correlation.ts";
import { recordEvent, type ObservabilityEvent } from "../observability/events.ts";
import {
  applyStepEvidence,
  coreLoopClientFields,
  createCoreLoopMachine,
  noteRepairRound,
  type CoreLoopMachine,
} from "../reliability/core-loop-machine.ts";
import { attemptClusterFields } from "./failure-cluster.ts";

export type GenerationAttemptStepName =
  | "plan"
  | "contract"
  | "generate"
  | "install"
  | "validate"
  | "boot"
  | "smoke"
  | "repair"
  | "publish";

export interface GenerationAttemptStep {
  step: GenerationAttemptStepName;
  idempotencyKey: string;
  startedAt: number;
  endedAt?: number;
  ok?: boolean;
  error?: string;
  tokensUsed?: number;
  repairRound?: number;
}

export interface GenerationAttempt {
  attemptId: string;
  requestId?: string;
  buildRunId?: string;
  sandboxSessionId?: string;
  deploymentId?: string;
  projectId?: string;
  steps: GenerationAttemptStep[];
  firstBootSuccess?: boolean;
  repairCount: number;
  durationMs?: number;
  tokensUsed: number;
  startedAt: number;
  /** Set once by finalizeGenerationAttempt — a second call is a no-op. */
  finalized?: boolean;
  topFamily?: string | null;
  familyCount?: number;
  families?: string;
  repairAccepted?: boolean | null;
  falseGreen?: boolean;
  costCredits?: number;
  gateLayer?: string | null;
  /** Evidence-gated core-loop states. The attempt cannot self-report "done". */
  coreLoop: CoreLoopMachine;
}

/** Fields the editor and done SSE can show without pulling prompts or file trees. */
export interface GenerationAttemptClientFields {
  attemptId: string;
  firstBootSuccess: boolean;
  repairCount: number;
  durationMs: number;
  topFamily: string | null;
  familyCount: number;
  families: string;
  repairAccepted: boolean | null;
  falseGreen: boolean;
  gateLayer: string | null;
  coreLoopState: ReturnType<typeof coreLoopClientFields>["coreLoopState"];
  boundedFailure: boolean;
  coreLoopEvidenceCount: number;
}

export function newGenerationAttemptId(): string {
  return newCorrelationId("att");
}

export function createGenerationAttempt(projectId?: string): GenerationAttempt {
  const correlation = correlationFields();
  const attempt: GenerationAttempt = {
    attemptId: newGenerationAttemptId(),
    requestId: correlation.requestId,
    buildRunId: correlation.buildRunId,
    sandboxSessionId: correlation.sandboxSessionId,
    deploymentId: correlation.deploymentId,
    projectId,
    steps: [],
    repairCount: 0,
    tokensUsed: 0,
    startedAt: Date.now(),
    coreLoop: createCoreLoopMachine(),
  };
  bindGenerationAttempt(attempt);
  return attempt;
}

/** Stamp the attempt onto the request ALS so LLM/tool spans share the same IDs. */
export function bindGenerationAttempt(attempt: GenerationAttempt): void {
  setCorrelation({ attemptId: attempt.attemptId });
  const correlation = correlationFields();
  if (correlation.requestId) attempt.requestId = correlation.requestId;
  if (correlation.buildRunId) attempt.buildRunId = correlation.buildRunId;
  if (correlation.sandboxSessionId) attempt.sandboxSessionId = correlation.sandboxSessionId;
  if (correlation.deploymentId) attempt.deploymentId = correlation.deploymentId;
}

export function snapshotAttemptIds(attempt: GenerationAttempt): void {
  const correlation = correlationFields();
  if (correlation.sandboxSessionId) attempt.sandboxSessionId = correlation.sandboxSessionId;
  if (correlation.deploymentId) attempt.deploymentId = correlation.deploymentId;
  if (correlation.buildRunId) attempt.buildRunId = correlation.buildRunId;
}

export function beginGenerationStep(
  attempt: GenerationAttempt,
  step: GenerationAttemptStepName,
  extras: { repairRound?: number } = {},
): GenerationAttemptStep {
  const record: GenerationAttemptStep = {
    step,
    idempotencyKey: `${attempt.attemptId}:${step}${extras.repairRound != null ? `:${extras.repairRound}` : ""}`,
    startedAt: Date.now(),
    repairRound: extras.repairRound,
  };
  attempt.steps.push(record);
  if (step === "repair") {
    attempt.repairCount += 1;
    attempt.coreLoop = noteRepairRound(attempt.coreLoop);
  }
  return record;
}

export function hasGenerationStep(
  attempt: GenerationAttempt | undefined,
  step: GenerationAttemptStepName,
): boolean {
  return Boolean(attempt?.steps.some((record) => record.step === step));
}

export function finishGenerationStep(
  step: GenerationAttemptStep,
  result: { ok: boolean; tokensUsed?: number; error?: string },
  attempt?: GenerationAttempt,
): void {
  step.endedAt = Date.now();
  step.ok = result.ok;
  if (result.tokensUsed != null) step.tokensUsed = result.tokensUsed;
  if (result.error) step.error = result.error.slice(0, 256);
  const durationMs = (step.endedAt ?? Date.now()) - step.startedAt;
  recordEvent("generation_step_completed", {
    step: step.step,
    ok: result.ok,
    durationMs,
    tokensUsed: result.tokensUsed ?? 0,
    repairRound: step.repairRound ?? 0,
  });
  if (attempt?.coreLoop && step.step !== "repair") {
    attempt.coreLoop = applyStepEvidence(attempt.coreLoop, step.step, {
      ok: result.ok,
      error: result.error,
      durationMs,
    });
  }
}

export function finalizeGenerationAttempt(
  attempt: GenerationAttempt,
  result: {
    firstBootSuccess: boolean;
    tokensUsed?: number;
    topFamily?: string | null;
    familyCount?: number;
    families?: string;
    repairAccepted?: boolean | null;
    falseGreen?: boolean;
    costCredits?: number;
    gateLayer?: string | null;
  },
): GenerationAttempt {
  if (attempt.finalized) return attempt;
  attempt.finalized = true;
  snapshotAttemptIds(attempt);
  attempt.firstBootSuccess = result.firstBootSuccess;
  attempt.tokensUsed += result.tokensUsed ?? 0;
  attempt.durationMs = Date.now() - attempt.startedAt;
  attempt.topFamily = result.topFamily ?? null;
  attempt.familyCount = result.familyCount ?? 0;
  attempt.families = result.families ?? "";
  attempt.repairAccepted = result.repairAccepted ?? null;
  attempt.falseGreen = result.falseGreen === true;
  attempt.costCredits = result.costCredits ?? 0;
  attempt.gateLayer = result.gateLayer ?? null;
  const event: ObservabilityEvent = "generation_attempt_completed";
  recordEvent(event, {
    attemptId: attempt.attemptId,
    firstBootSuccess: result.firstBootSuccess,
    repairCount: attempt.repairCount,
    durationMs: attempt.durationMs,
    tokensUsed: attempt.tokensUsed,
    stepCount: attempt.steps.length,
    topFamily: attempt.topFamily,
    familyCount: attempt.familyCount,
    families: attempt.families,
    repairAccepted: attempt.repairAccepted === true,
    falseGreen: attempt.falseGreen,
    costCredits: attempt.costCredits,
    gateLayer: attempt.gateLayer ?? "",
    sandboxSessionId: attempt.sandboxSessionId ?? "",
    deploymentId: attempt.deploymentId ?? "",
  });
  return attempt;
}

/**
 * Close an attempt from a terminal path (success, cancel, stream error).
 * Safe to call twice — finalize is idempotent.
 */
export function closeGenerationAttempt(
  attempt: GenerationAttempt,
  result: {
    firstBootSuccess: boolean;
    tokensUsed?: number;
    error?: string;
    errors?: Array<{ type?: string; message: string; file?: string | null }>;
    repairAccepted?: boolean | null;
    falseGreen?: boolean;
    costCredits?: number;
    gateLayer?: string | null;
  },
): GenerationAttempt {
  const errors = [...(result.errors ?? [])];
  if (result.error) errors.push({ message: result.error });
  return finalizeGenerationAttempt(attempt, {
    firstBootSuccess: result.firstBootSuccess,
    tokensUsed: result.tokensUsed,
    repairAccepted: result.repairAccepted,
    falseGreen: result.falseGreen,
    costCredits: result.costCredits,
    gateLayer: result.gateLayer,
    ...attemptClusterFields(errors),
  });
}

export function attemptClientFields(attempt: GenerationAttempt): GenerationAttemptClientFields {
  return {
    attemptId: attempt.attemptId,
    firstBootSuccess: attempt.firstBootSuccess === true,
    repairCount: attempt.repairCount,
    durationMs: attempt.durationMs ?? 0,
    topFamily: attempt.topFamily ?? null,
    familyCount: attempt.familyCount ?? 0,
    families: attempt.families ?? "",
    repairAccepted: attempt.repairAccepted ?? null,
    falseGreen: attempt.falseGreen === true,
    gateLayer: attempt.gateLayer ?? null,
    ...coreLoopClientFields(attempt.coreLoop),
  };
}
