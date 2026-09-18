/**
 * Evidence-gated core-loop state machine.
 *
 * Generation cannot mark itself "done". Each transition requires stored,
 * machine-verifiable evidence. Exhausted repair attempts terminate in
 * FAILED_BOUNDED — a preview must not keep retrying forever.
 *
 *   GENERATED → VALIDATED → PREVIEW_BOOTED → BROWSER_VERIFIED
 *     → PUBLISHED → PUBLIC_URL_VERIFIED
 */
import { recordEvent } from "../observability/events.ts";

export const CORE_LOOP_STATES = [
  "GENERATED",
  "VALIDATED",
  "PREVIEW_BOOTED",
  "BROWSER_VERIFIED",
  "PUBLISHED",
  "PUBLIC_URL_VERIFIED",
] as const;

export type CoreLoopState = (typeof CORE_LOOP_STATES)[number];
export type CoreLoopTerminalState = "PENDING" | CoreLoopState | "FAILED_BOUNDED";

export type CoreLoopEvidenceKind =
  | "file_manifest"
  | "typecheck"
  | "sandbox_boot"
  | "browser_smoke"
  | "deploy_url"
  | "public_health"
  | "repair_budget";

export interface CoreLoopEvidence {
  kind: CoreLoopEvidenceKind;
  ok: boolean;
  recordedAt: string;
  summary: string;
  durationMs?: number;
  artifact?: Record<string, string | number | boolean | null>;
}

export interface CoreLoopMachine {
  state: CoreLoopTerminalState;
  evidence: readonly CoreLoopEvidence[];
  repairRounds: number;
  maxRepairRounds: number;
}

export const CORE_LOOP_EVIDENCE_FOR_STATE: Record<CoreLoopState, CoreLoopEvidenceKind> = {
  GENERATED: "file_manifest",
  VALIDATED: "typecheck",
  PREVIEW_BOOTED: "sandbox_boot",
  BROWSER_VERIFIED: "browser_smoke",
  PUBLISHED: "deploy_url",
  PUBLIC_URL_VERIFIED: "public_health",
};

const NEXT_STATE: Record<Exclude<CoreLoopTerminalState, "FAILED_BOUNDED">, CoreLoopState | null> = {
  PENDING: "GENERATED",
  GENERATED: "VALIDATED",
  VALIDATED: "PREVIEW_BOOTED",
  PREVIEW_BOOTED: "BROWSER_VERIFIED",
  BROWSER_VERIFIED: "PUBLISHED",
  PUBLISHED: "PUBLIC_URL_VERIFIED",
  PUBLIC_URL_VERIFIED: null,
};

function nowIso(): string {
  return new Date().toISOString();
}

function clipSummary(value: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed.length > 240 ? `${trimmed.slice(0, 240)}…` : trimmed;
}

export function sanitizeCoreLoopEvidence(input: CoreLoopEvidence): CoreLoopEvidence {
  const artifact: Record<string, string | number | boolean | null> = {};
  if (input.artifact) {
    for (const [key, value] of Object.entries(input.artifact)) {
      if (value === null || typeof value === "number" || typeof value === "boolean") {
        artifact[key] = value;
      } else if (typeof value === "string") {
        artifact[key] = value.length > 120 ? `${value.slice(0, 120)}…` : value;
      }
    }
  }
  return {
    kind: input.kind,
    ok: input.ok,
    recordedAt: input.recordedAt || nowIso(),
    summary: clipSummary(input.summary || ""),
    durationMs: input.durationMs,
    artifact: Object.keys(artifact).length > 0 ? artifact : undefined,
  };
}

export function createCoreLoopMachine(opts?: { maxRepairRounds?: number }): CoreLoopMachine {
  const max = opts?.maxRepairRounds;
  return {
    state: "PENDING",
    evidence: [],
    repairRounds: 0,
    maxRepairRounds: Number.isFinite(max) && (max ?? 0) >= 0 ? Math.floor(max as number) : 2,
  };
}

export function isFailedBounded(machine: CoreLoopMachine | undefined): boolean {
  return machine?.state === "FAILED_BOUNDED";
}

export function isReleaseReady(machine: CoreLoopMachine | undefined): boolean {
  return machine?.state === "PUBLIC_URL_VERIFIED";
}

/** Preview is allowed to claim success only with stored browser evidence. */
export function isPreviewVerified(machine: CoreLoopMachine | undefined): boolean {
  if (!machine || machine.state === "FAILED_BOUNDED") return false;
  const rank = CORE_LOOP_STATES.indexOf(machine.state as CoreLoopState);
  return rank >= CORE_LOOP_STATES.indexOf("BROWSER_VERIFIED");
}

export function nextCoreLoopState(state: CoreLoopTerminalState): CoreLoopState | null {
  if (state === "FAILED_BOUNDED") return null;
  return NEXT_STATE[state];
}

export function canAdvance(
  machine: CoreLoopMachine,
  to: CoreLoopState,
  evidence: CoreLoopEvidence,
): { ok: true } | { ok: false; reason: string } {
  if (machine.state === "FAILED_BOUNDED") {
    return { ok: false, reason: "core loop already terminated as FAILED_BOUNDED" };
  }
  if (machine.state === to) {
    return { ok: false, reason: `already at ${to}` };
  }
  const expected = nextCoreLoopState(machine.state);
  if (expected !== to) {
    return { ok: false, reason: `cannot skip from ${machine.state} to ${to}` };
  }
  const requiredKind = CORE_LOOP_EVIDENCE_FOR_STATE[to];
  if (evidence.kind !== requiredKind) {
    return { ok: false, reason: `${to} requires ${requiredKind} evidence` };
  }
  if (!evidence.ok) {
    return { ok: false, reason: `${to} requires passing evidence` };
  }
  return { ok: true };
}

function emitTransition(machine: CoreLoopMachine, from: CoreLoopTerminalState): void {
  recordEvent("core_loop_state_changed", {
    from,
    to: machine.state,
    evidenceCount: machine.evidence.length,
    repairRounds: machine.repairRounds,
  });
}

/**
 * Advance one state. Evidence is always appended (immutable history) even when
 * the transition is rejected — callers can see why the gate refused.
 */
export type CoreLoopAdvanceResult =
  | CoreLoopMachine
  | { ok: false; reason: string; machine: CoreLoopMachine };

export function isAdvanceRejected(
  result: CoreLoopAdvanceResult,
): result is { ok: false; reason: string; machine: CoreLoopMachine } {
  return "ok" in result && result.ok === false;
}

export function advanceCoreLoop(
  machine: CoreLoopMachine,
  to: CoreLoopState,
  evidence: CoreLoopEvidence,
): CoreLoopAdvanceResult {
  const stored = sanitizeCoreLoopEvidence(evidence);
  const nextEvidence = [...machine.evidence, stored];
  const check = canAdvance(machine, to, stored);
  if (!check.ok) {
    return { ok: false, reason: check.reason, machine: { ...machine, evidence: nextEvidence } };
  }
  const next: CoreLoopMachine = { ...machine, state: to, evidence: nextEvidence };
  emitTransition(next, machine.state);
  return next;
}

export function failBounded(
  machine: CoreLoopMachine,
  evidence: {
    kind?: CoreLoopEvidenceKind;
    summary: string;
    recordedAt?: string;
    durationMs?: number;
    artifact?: Record<string, string | number | boolean | null>;
  },
): CoreLoopMachine {
  if (machine.state === "FAILED_BOUNDED") return machine;
  const stored = sanitizeCoreLoopEvidence({
    kind: evidence.kind ?? "repair_budget",
    ok: false,
    recordedAt: evidence.recordedAt || nowIso(),
    summary: evidence.summary || "Repair budget exhausted",
    durationMs: evidence.durationMs,
    artifact: evidence.artifact,
  });
  const next: CoreLoopMachine = {
    ...machine,
    state: "FAILED_BOUNDED",
    evidence: [...machine.evidence, stored],
  };
  emitTransition(next, machine.state);
  return next;
}

export function noteRepairRound(machine: CoreLoopMachine): CoreLoopMachine {
  return { ...machine, repairRounds: machine.repairRounds + 1 };
}

export function repairBudgetExhausted(machine: CoreLoopMachine): boolean {
  return machine.repairRounds >= machine.maxRepairRounds;
}

/** Map a generation-attempt step onto the evidence-gated state, if any. */
export const GENERATION_STEP_TO_CORE_LOOP: Partial<
  Record<
    "generate" | "validate" | "boot" | "smoke" | "publish",
    { state: CoreLoopState; kind: CoreLoopEvidenceKind }
  >
> = {
  generate: { state: "GENERATED", kind: "file_manifest" },
  validate: { state: "VALIDATED", kind: "typecheck" },
  boot: { state: "PREVIEW_BOOTED", kind: "sandbox_boot" },
  smoke: { state: "BROWSER_VERIFIED", kind: "browser_smoke" },
  publish: { state: "PUBLISHED", kind: "deploy_url" },
};

export function applyStepEvidence(
  machine: CoreLoopMachine,
  step: string,
  result: { ok: boolean; error?: string; durationMs?: number },
): CoreLoopMachine {
  const mapped = GENERATION_STEP_TO_CORE_LOOP[step as keyof typeof GENERATION_STEP_TO_CORE_LOOP];
  if (!mapped) return machine;
  const evidence: CoreLoopEvidence = {
    kind: mapped.kind,
    ok: result.ok,
    recordedAt: nowIso(),
    summary: result.ok ? `${mapped.state} evidence recorded` : clipSummary(result.error || `${step} failed`),
    durationMs: result.durationMs,
  };
  if (!result.ok) return { ...machine, evidence: [...machine.evidence, sanitizeCoreLoopEvidence(evidence)] };
  const advanced = advanceCoreLoop(machine, mapped.state, evidence);
  return isAdvanceRejected(advanced) ? advanced.machine : advanced;
}

export function coreLoopClientFields(machine: CoreLoopMachine | undefined): {
  coreLoopState: CoreLoopTerminalState | null;
  boundedFailure: boolean;
  coreLoopEvidenceCount: number;
} {
  if (!machine) {
    return { coreLoopState: null, boundedFailure: false, coreLoopEvidenceCount: 0 };
  }
  return {
    coreLoopState: machine.state,
    boundedFailure: machine.state === "FAILED_BOUNDED",
    coreLoopEvidenceCount: machine.evidence.length,
  };
}

export function coreLoopRunTerminal(
  machine: CoreLoopMachine | undefined,
  verificationPassed: boolean | undefined,
): {
  status: "completed" | "failed";
  failureCode?: string;
  verificationPassed: boolean | undefined;
} {
  if (machine?.state === "FAILED_BOUNDED") {
    return {
      status: "failed",
      failureCode: "FAILED_BOUNDED",
      verificationPassed: false,
    };
  }
  return {
    status: "completed",
    verificationPassed,
  };
}
