import { CORE_LOOP_API_SURFACE } from "./core-loop-api-surface.ts";

/** Production coding tier used by the release-gate campaign when unset. */
export const CORE_LOOP_CAMPAIGN_PRIMARY_MODEL = "openai/gpt-5.6-luna";

export type CoreLoopPolicy = {
  contractVersion: 2;
  framework: "tanstack";
  mode: "build";
  primaryModel: string;
  fallbackModel: string;
  previewStrategy: "server-verified";
  sandboxProvider: "docker";
  browserFallback: "none";
  apiSurface: string[];
  deploymentProvider: string;
  maxAutomaticRepairRounds: number;
};

type Environment = Record<string, string | undefined>;

const positiveInt = (value: string | undefined, fallback: number) => {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
};

/**
 * Pin CORE_LOOP_AI_MODEL for campaign runners when the operator left it unset.
 * Preserves an explicit CORE_LOOP_AI_MODEL; does not clear OPENROUTER_CODING_MODEL
 * (policy still honors that cascade for non-campaign callers).
 */
export function pinCoreLoopCampaignAiModel(env: Environment = process.env): string {
  const existing = env.CORE_LOOP_AI_MODEL?.trim();
  if (existing) return existing;
  env.CORE_LOOP_AI_MODEL = CORE_LOOP_CAMPAIGN_PRIMARY_MODEL;
  return CORE_LOOP_CAMPAIGN_PRIMARY_MODEL;
}

/**
 * One deterministic policy for release-proof generation. Advanced editor
 * features remain available, but the core-loop campaign never depends on them.
 *
 * Model resolution (first non-empty wins):
 *   CORE_LOOP_AI_MODEL → DEFAULT_AI_MODEL → OPENROUTER_CODING_MODEL → fallback.
 * Campaign runners call pinCoreLoopCampaignAiModel() before getCoreLoopPolicy()
 * so a Codespace OPENROUTER_CODING_MODEL override cannot select a stalled
 * provider. The chat route also honors an explicit coreLoop request model when
 * modelManuallySelected is true.
 */
export function getCoreLoopPolicy(env: Environment = process.env): CoreLoopPolicy {
  return {
    contractVersion: 2,
    framework: "tanstack",
    mode: "build",
    primaryModel:
      env.CORE_LOOP_AI_MODEL?.trim() ||
      env.DEFAULT_AI_MODEL?.trim() ||
      env.OPENROUTER_CODING_MODEL?.trim() ||
      "qwen/qwen3-coder",
    fallbackModel:
      env.CORE_LOOP_FALLBACK_MODEL?.trim() ||
      env.OPENROUTER_SAFE_FALLBACK_MODEL?.trim() ||
      "deepseek/deepseek-v4-flash",
    previewStrategy: "server-verified",
    sandboxProvider: "docker",
    browserFallback: "none",
    apiSurface: CORE_LOOP_API_SURFACE.map((entry) => `${entry.method} ${entry.path}`),
    deploymentProvider: env.CORE_LOOP_DEPLOY_PROVIDER?.trim() || "netlify",
    maxAutomaticRepairRounds: positiveInt(env.CORE_LOOP_MAX_REPAIR_ROUNDS, 2),
  };
}

export function isCoreLoopRequest(value: unknown): value is true {
  return value === true;
}
