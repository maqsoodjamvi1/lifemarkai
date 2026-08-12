/**
 * Lightweight result shapes shared by AI HTTP handlers + lens persistence.
 * Kept separate so `import type` never pulls auto-wire / self-verify graphs.
 */

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
  engine: "browser" | "static";
  passed: boolean;
  rounds: number;
  fixesApplied: number;
  fixedFiles: Array<{ path: string; content: string; language: string }>;
  errors: string[];
}
