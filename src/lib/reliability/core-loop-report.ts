export type CoreLoopStage =
  | "registration"
  | "credits"
  | "project"
  | "generation"
  | "preview"
  | "deployment"
  | "public-url";

export interface CoreLoopAttempt {
  index: number;
  prompt: string;
  projectId?: string;
  startedAt: string;
  generationMs?: number;
  generationPassed: boolean;
  previewPassed: boolean;
  deploymentPassed: boolean;
  publicUrlPassed: boolean;
  automaticRepairUsed: boolean;
  automaticRepairPassed: boolean;
  repairRounds: number;
  manualInterventionRequired: boolean;
  creditsUsed: number | null;
  aiCostCents: number | null;
  sandboxCostCents: number | null;
  deployedUrl?: string;
  failedStage?: CoreLoopStage;
  error?: string;
}

export interface CoreLoopSummary {
  attempts: number;
  generationSuccessRate: number;
  previewSuccessRate: number;
  deploymentSuccessRate: number;
  publicUrlSuccessRate: number;
  automaticRepairSuccessRate: number | null;
  manualInterventionRate: number;
  averageGenerationMs: number | null;
  averageCreditsPerProject: number | null;
  averageAiCostCentsPerProject: number | null;
  averageSandboxCostCentsPerProject: number | null;
  costTelemetryComplete: boolean;
}

const rate = (passed: number, total: number) => total === 0 ? 0 : passed / total;
const average = (values: number[]) =>
  values.length === 0 ? null : values.reduce((sum, value) => sum + value, 0) / values.length;

export function summarizeCoreLoop(attempts: CoreLoopAttempt[]): CoreLoopSummary {
  const repairs = attempts.filter((attempt) => attempt.automaticRepairUsed);
  const knownCredits = attempts.flatMap((attempt) => attempt.creditsUsed == null ? [] : [attempt.creditsUsed]);
  const knownAiCosts = attempts.flatMap((attempt) => attempt.aiCostCents == null ? [] : [attempt.aiCostCents]);
  const knownSandboxCosts = attempts.flatMap((attempt) => attempt.sandboxCostCents == null ? [] : [attempt.sandboxCostCents]);

  return {
    attempts: attempts.length,
    generationSuccessRate: rate(attempts.filter((attempt) => attempt.generationPassed).length, attempts.length),
    previewSuccessRate: rate(attempts.filter((attempt) => attempt.previewPassed).length, attempts.length),
    deploymentSuccessRate: rate(attempts.filter((attempt) => attempt.deploymentPassed).length, attempts.length),
    publicUrlSuccessRate: rate(attempts.filter((attempt) => attempt.publicUrlPassed).length, attempts.length),
    automaticRepairSuccessRate: repairs.length === 0
      ? null
      : rate(repairs.filter((attempt) => attempt.automaticRepairPassed).length, repairs.length),
    manualInterventionRate: rate(
      attempts.filter((attempt) => attempt.manualInterventionRequired).length,
      attempts.length,
    ),
    averageGenerationMs: average(attempts.flatMap((attempt) => attempt.generationMs == null ? [] : [attempt.generationMs])),
    averageCreditsPerProject: average(knownCredits),
    averageAiCostCentsPerProject: average(knownAiCosts),
    averageSandboxCostCentsPerProject: average(knownSandboxCosts),
    costTelemetryComplete:
      attempts.length > 0 &&
      knownAiCosts.length === attempts.length &&
      knownSandboxCosts.length === attempts.length,
  };
}

export interface CoreLoopReleaseGate {
  eligible: boolean;
  passed: boolean;
  reasons: string[];
}

export function assessCoreLoopReleaseGate(
  summary: CoreLoopSummary,
  registrationPassed: boolean,
  minimumAttempts = 50,
): CoreLoopReleaseGate {
  const reasons: string[] = [];
  if (summary.attempts < minimumAttempts) reasons.push(`requires at least ${minimumAttempts} attempts`);
  if (!registrationPassed) reasons.push("fresh registration and credit grant were not proven");
  if (summary.generationSuccessRate < 0.95) reasons.push("generation success is below 95%");
  if (summary.previewSuccessRate < 0.95) reasons.push("preview success is below 95%");
  if (summary.deploymentSuccessRate < 0.95) reasons.push("deployment success is below 95%");
  if (summary.publicUrlSuccessRate < 0.95) reasons.push("public URL success is below 95%");
  if (summary.manualInterventionRate > 0.05) reasons.push("manual intervention exceeds 5%");
  if (!summary.costTelemetryComplete) reasons.push("cost telemetry is incomplete");

  const eligible = summary.attempts >= minimumAttempts;
  return { eligible, passed: eligible && reasons.length === 0, reasons };
}
