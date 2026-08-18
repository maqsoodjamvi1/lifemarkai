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

export interface AiEvalEntry {
  model: string;
  task?: string;
  projectId?: string;
  userId?: string;
  latencyMs?: number;
  tokensUsed?: number;
  toolCalls?: number;
  success: boolean;
  error?: string;
  viaGateway?: boolean;
}

/** Best-effort insert. Never throws; silently no-ops if the table/env isn't ready. */
export function recordAiEval(entry: AiEvalEntry): void {
  // Correlation ids must be read HERE, synchronously: the async body below runs
  // after the caller's await chain moves on, when the ALS store may be gone.
  const correlation = correlationFields();
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
      });
    } catch {
      /* observability must never break generation */
    }
  })();
}
