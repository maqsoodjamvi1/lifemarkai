/**
 * Lightweight result shapes shared by AI HTTP handlers + lens persistence.
 * Kept separate so `import type` never pulls auto-wire / self-verify graphs.
 */

import type { PreviewFailureLayer } from "../env-graph.ts";

export interface AutoWireResult {
  intentDetected: boolean;
  cloudEnabled: boolean;
  credsInjected: boolean;
  scaffoldAdded: boolean;
  migrationsApplied: number;
  migrationsPending: number;
  notes: string[];
}

export interface SelfVerifyResult {
  engine: "browser" | "static" | "build";
  passed: boolean;
  rounds: number;
  fixesApplied: number;
  fixedFiles: Array<{ path: string; content: string; language: string }>;
  errors: string[];
  failureFamilies?: string[];
  previewGate?: {
    accepted: boolean;
    layer: PreviewFailureLayer | null;
    repairAccepted: boolean | null;
    falseGreen: boolean;
    incompleteWorkflow: boolean;
    mismatch: string | null;
  };
  boundedFailure?: boolean;
}

/** Shape persisted on assistant messages and sent on the done SSE. */
export function verificationClientFields(verification: SelfVerifyResult | null | undefined): {
  engine: SelfVerifyResult["engine"];
  passed: boolean;
  fixesApplied: number;
  errors: string[];
  failureFamilies?: string[];
  previewGate?: SelfVerifyResult["previewGate"];
  boundedFailure?: boolean;
} | undefined {
  if (!verification) return undefined;
  return {
    engine: verification.engine,
    passed: verification.passed,
    fixesApplied: verification.fixesApplied,
    errors: verification.errors,
    ...(verification.failureFamilies?.length ? { failureFamilies: verification.failureFamilies } : {}),
    ...(verification.previewGate ? { previewGate: verification.previewGate } : {}),
    ...(verification.boundedFailure ? { boundedFailure: true } : {}),
  };
}
