/**
 * eval-log — self-hosted AI observability.
 *
 * `recordAiEval()` writes one row to `ai_eval_log` (migration 080) per model
 * call: model, latency, token usage, and outcome. It is strictly
 * fire-and-forget — it never throws and never blocks the caller, so a logging
 * or DB hiccup can never break generation. This is LifemarkAI's lightweight
 * stand-in for a vendor eval platform (Lovable ships Braintrust); it gives us
 * regression visibility when model tiers change without an external dependency.
 *
 * Server-only: writes via the service-role admin client.
 */
import { createAdminClient } from "../supabase/server.ts";
import { correlationFields } from "../observability/correlation.ts";
import { computeCostUsd } from "./model-prices.ts";

export interface AiEvalEntry {
  model: string;
  task?: string;
  projectId?: string;
  userId?: string;
  latencyMs?: number;
  tokensUsed?: number;
  /** Input/output split — required to price a call, since the two differ by up to 6x. */
  promptTokens?: number;
  completionTokens?: number;
  cachedTokens?: number;
  toolCalls?: number;
  /**
   * Tool calls that ERRORED, as distinct from tool calls made.
   *
   * NOT YET POPULATED. The column exists (migration 177) and this field is
   * written when set, but no caller sets it: tools are dispatched by the agent
   * loop, not by generate(), so the error count is not visible from here.
   *
   * Left as `undefined` rather than defaulted to 0 ON PURPOSE. A zero would be
   * indistinguishable from "we measured, there were none" — so any dashboard
   * reading this column would confidently report a clean tool-error rate that
   * had never actually been measured. NULL says "unknown", which is the truth.
   *
   * To finish this: count failed dispatches in the agent tool loop and pass the
   * total through to recordAiEval.
   */
  toolErrors?: number;
  success: boolean;
  error?: string;
  viaGateway?: boolean;
}

/** Best-effort insert. Never throws; silently no-ops if the table/env isn't ready. */
export function recordAiEval(entry: AiEvalEntry): void {
  // Correlation ids must be read HERE, synchronously: the async body below runs
  // after the caller's await chain moves on, when the ALS store may be gone.
  const correlation = correlationFields();
  // Priced at write time, deliberately. Pricing a historical row later would
  // apply TODAY's price to a call made months ago — and these prices move: the
  // gateway's table was stamped "as of 2025-05" and was wrong by up to 6x in
  // both directions when it was finally re-checked.
  const cost =
    entry.promptTokens != null && entry.completionTokens != null
      ? computeCostUsd(entry.model, entry.promptTokens, entry.completionTokens)
      : null;
  void (async () => {
    try {
      const supabase = await createAdminClient();
      await (supabase.from("ai_eval_log") as any).insert({
        model: entry.model,
        task: entry.task ?? null,
        project_id: entry.projectId ?? null,
        user_id: entry.userId ?? null,
        latency_ms: entry.latencyMs ?? null,
        tokens_used: entry.tokensUsed ?? null,
        tool_calls: entry.toolCalls ?? 0,
        success: entry.success,
        error: entry.error ? entry.error.slice(0, 500) : null,
        via_gateway: entry.viaGateway ?? false,
        // Migration 173. Optional-column spread keeps this insert compatible
        // with databases that have not applied it yet (PostgREST rejects
        // unknown columns, and one missing column must not kill ALL eval rows).
        ...(correlation.requestId ? { request_id: correlation.requestId } : {}),
        ...(correlation.buildRunId ? { build_run_id: correlation.buildRunId } : {}),
        // Migration 177. Same optional-column spread as above and for the same
        // reason: PostgREST rejects the WHOLE insert on one unknown column, so
        // a database that has not applied the migration must not lose every
        // eval row. Absent rather than null until it has.
        ...(entry.promptTokens != null ? { prompt_tokens: entry.promptTokens } : {}),
        ...(entry.completionTokens != null ? { completion_tokens: entry.completionTokens } : {}),
        ...(entry.cachedTokens != null ? { cached_tokens: entry.cachedTokens } : {}),
        ...(entry.toolErrors != null ? { tool_errors: entry.toolErrors } : {}),
        // null = model absent from the price table. Honest "unknown", never a
        // silent zero — a zero would make an unpriced model look free, which is
        // precisely how the stale gateway table hid real spend.
        ...(cost != null ? { cost_usd: cost } : {}),
      });
    } catch {
      /* observability must never break generation */
    }
  })();
}
