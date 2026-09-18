/**
 * Restartable generation-loop steps.
 *
 * Models the core loop as plan → contract → generate → install → validate →
 * boot → smoke → repair → publish. Each step has an idempotency key, timeout,
 * optional retry, and a stored artifact when a BuildRunStore is present —
 * so a worker restart resumes the attempt instead of minting a duplicate sandbox.
 */
import type { BuildRunStore } from "../build-runs/store.ts";
import { currentTraceContext } from "../observability/correlation.ts";
import { withTraceSpan } from "../monitoring/tracing.ts";
import {
  beginGenerationStep,
  finishGenerationStep,
  type GenerationAttempt,
  type GenerationAttemptStepName,
} from "./generation-attempt.ts";

export const STEP_TIMEOUT_MS: Record<GenerationAttemptStepName, number> = {
  plan: 30_000,
  contract: 90_000,
  generate: 180_000,
  install: 120_000,
  validate: 45_000,
  boot: 60_000,
  smoke: 45_000,
  repair: 90_000,
  publish: 120_000,
};

/** One W3C/OTEL span name per core-loop step so a failed build greps as one trace. */
export const CORE_LOOP_SPAN_NAME: Record<GenerationAttemptStepName, string> = {
  plan: "core_loop.prompt",
  contract: "core_loop.contract",
  generate: "core_loop.generation",
  install: "core_loop.sandbox_install",
  validate: "core_loop.validation",
  boot: "core_loop.sandbox_boot",
  smoke: "core_loop.browser_verification",
  repair: "core_loop.repair",
  publish: "core_loop.deployment",
};

export interface DurableStepOptions<T> {
  attempt: GenerationAttempt;
  step: GenerationAttemptStepName;
  repairRound?: number;
  timeoutMs?: number;
  retries?: number;
  store?: BuildRunStore | null;
  runId?: string | null;
  /**
   * Persist the step result in BuildRunStore. Off for streaming generate —
   * the payload is too large and not idempotent mid-stream.
   */
  persist?: boolean;
  tokensOf?: (result: T) => number | undefined;
  fn: () => Promise<T>;
}

/** Book-keep a synchronous acceptance step (typecheck / smoke) on the attempt. */
export function recordAttemptStep(
  attempt: GenerationAttempt | undefined,
  step: GenerationAttemptStepName,
  result: { ok: boolean; error?: string },
): void {
  if (!attempt) return;
  finishGenerationStep(beginGenerationStep(attempt, step), result, attempt);
}

/**
 * Persist a small serializable step verdict (ok / error / families).
 * Never throws — a store outage must not fail the live build.
 */
export async function persistStepArtifact(
  store: BuildRunStore | null | undefined,
  runId: string | null | undefined,
  idempotencyKey: string,
  artifact: Record<string, unknown>,
): Promise<void> {
  if (!store || !runId) return;
  try {
    await store.runStep(runId, idempotencyKey, async () => artifact);
  } catch {
    /* durability must not fail the live build */
  }
}

function withTimeout<T>(fn: () => Promise<T>, timeoutMs: number, step: string): Promise<T> {
  if (timeoutMs <= 0) return fn();
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${step} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
    fn().then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

export async function runDurableStep<T>(options: DurableStepOptions<T>): Promise<T> {
  const timeoutMs = options.timeoutMs ?? STEP_TIMEOUT_MS[options.step];
  const retries = Math.max(0, options.retries ?? 0);
  const record = beginGenerationStep(options.attempt, options.step, { repairRound: options.repairRound });
  const stepKey = record.idempotencyKey;
  const useStore = options.persist !== false && Boolean(options.store && options.runId);
  let lastError: unknown;

  const execute = async (): Promise<T> => {
    return withTraceSpan(
      CORE_LOOP_SPAN_NAME[options.step],
      {
        parent: currentTraceContext(),
        attributes: {
          "lifemark.step": options.step,
          "lifemark.attempt_id": options.attempt.attemptId,
          "lifemark.repair_round": options.repairRound ?? 0,
        },
      },
      async () => {
        let tryIndex = 0;
        while (tryIndex <= retries) {
          try {
            return await withTimeout(options.fn, timeoutMs, options.step);
          } catch (error) {
            lastError = error;
            tryIndex += 1;
            if (tryIndex > retries) throw error;
          }
        }
        throw lastError instanceof Error ? lastError : new Error(String(lastError));
      },
    );
  };

  try {
    const result = useStore
      ? await options.store!.runStep(options.runId!, stepKey, execute)
      : await execute();
    finishGenerationStep(record, {
      ok: true,
      tokensUsed: options.tokensOf?.(result),
    }, options.attempt);
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    finishGenerationStep(record, { ok: false, error: message }, options.attempt);
    if (useStore) {
      await options.store!.recordStepFailure(options.runId!, stepKey, error);
    }
    throw error;
  }
}
