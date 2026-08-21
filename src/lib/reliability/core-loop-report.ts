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
  /** Normalized systemic-failure key; null/undefined when the attempt passed. */
  failureSignature?: string | null;
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

/**
 * Collapse volatile ids, hosts and timestamps so repeated systemic failures
 * compare equal. Format: `<stage>:<message>` without repeating the stage
 * inside the message.
 *
 * Normalization must be aggressive: a signature that stays unique per attempt
 * makes the early-stop fail open and the campaign burns every remaining run on
 * one root cause. Preview and deployment errors in particular carry a fresh
 * sandbox host or container id on every attempt.
 */
export function normalizeCoreLoopFailureSignature(
  attempt: Pick<CoreLoopAttempt, "publicUrlPassed" | "failedStage" | "error">,
): string | null {
  if (attempt.publicUrlPassed) return null;
  const stage = attempt.failedStage ?? "unknown";
  let message = String(attempt.error ?? "unknown")
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi, "<uuid>")
    // Per-attempt sandbox/deploy hosts: keep the provider, drop the random subdomain.
    .replace(/(https?:\/\/)([^/\s"'`)<>]+)/gi, (_match, scheme: string, authority: string) => {
      const portMatch = /^(.*?)(:\d+)?$/.exec(authority);
      const host = portMatch?.[1] ?? authority;
      const port = portMatch?.[2] ?? "";
      const labels = host.split(".");
      const normalizedHost = labels.length > 2 ? `<sub>.${labels.slice(-2).join(".")}` : host;
      return `${scheme}${normalizedHost}${port}`;
    })
    // Container/sandbox ids: hex runs that mix digits and letters.
    .replace(/\b(?=[0-9a-f]*\d)(?=[0-9a-f]*[a-f])[0-9a-f]{7,}\b/gi, "<hex>")
    .replace(/\d{5,}/g, "<n>")
    .replace(/\s+/g, " ")
    .trim();
  // Errors often already begin with the stage name ("generation timed out…"),
  // sometimes spelled with a space instead of the hyphen ("public URL check…").
  const stagePattern = escapeRegExp(stage).replace(/\\?-/g, "[\\s._-]?");
  message = message.replace(new RegExp(`^${stagePattern}(?:\\s+|[:\\-–—]+\\s*)`, "i"), "").trim();
  message = message.slice(0, 240);
  return `${stage}:${message || "unknown"}`;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type CoreLoopEarlyStop = {
  stop: boolean;
  signature: string | null;
  consecutive: number;
};

/**
 * Stop burning credits when the same actionable failure repeats. A pass resets
 * the streak. Default threshold is 3 identical consecutive failures.
 */
export function shouldStopCoreLoopCampaign(
  attempts: Array<Pick<CoreLoopAttempt, "publicUrlPassed" | "failedStage" | "error">>,
  consecutiveIdenticalFailures = 3,
): CoreLoopEarlyStop {
  const threshold = Math.max(2, consecutiveIdenticalFailures);
  let signature: string | null = null;
  let consecutive = 0;
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    const next = normalizeCoreLoopFailureSignature(attempts[index]!);
    if (!next) break;
    if (signature === null) signature = next;
    if (next !== signature) break;
    consecutive += 1;
  }
  return {
    stop: signature !== null && consecutive >= threshold,
    signature,
    consecutive,
  };
}
