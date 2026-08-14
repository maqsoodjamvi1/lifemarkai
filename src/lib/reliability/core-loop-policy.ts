import { CORE_LOOP_API_SURFACE } from "./core-loop-api-surface.ts";

export type CoreLoopPolicy = {
  contractVersion: 2;
  framework: "tanstack";
  mode: "build";
  primaryModel: string;
  fallbackModel: string;
  previewStrategy: "server-verified";
  sandboxProvider: "docker";
  browserFallback: "webcontainer";
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
 * One deterministic policy for release-proof generation. Advanced editor
 * features remain available, but the core-loop campaign never depends on them.
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
    browserFallback: "webcontainer",
    apiSurface: CORE_LOOP_API_SURFACE.map((entry) => `${entry.method} ${entry.path}`),
    deploymentProvider: env.CORE_LOOP_DEPLOY_PROVIDER?.trim() || "netlify",
    maxAutomaticRepairRounds: positiveInt(env.CORE_LOOP_MAX_REPAIR_ROUNDS, 2),
  };
}

export function isCoreLoopRequest(value: unknown): value is true {
  return value === true;
}
