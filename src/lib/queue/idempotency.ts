/**
 * Queue-consumer idempotency — Phase 8 of the Vercel adoption plan.
 *
 * Every background job handler wraps its side effects in runJobOnce():
 *
 *   const outcome = await runJobOnce(supabase, {
 *     consumer: "deploy-processor",
 *     idempotencyKey: `deploy:${payload.deploymentId}`,
 *     backend: "bullmq",
 *   }, async () => { ...side effects... });
 *
 * The claim is a PRIMARY KEY insert into job_executions (migration 176), so a
 * duplicate delivery — BullMQ retry, Vercel Queues redelivery, an operator
 * clicking "retry" twice — loses the insert and returns { skipped: true }
 * without re-running the side effects. A crashed run (status stuck in
 * 'processing' past its deadline) is reclaimable, and a FAILED run is
 * re-runnable: only SUCCESS is permanent, mirroring BuildRunStore.runStep.
 *
 * This module is queue-agnostic on purpose: it is the piece that makes the
 * BullMQ → Vercel Queues migration safe, because correctness lives in the
 * database ledger, not in either queue's delivery semantics.
 */

export interface JobClaim {
  consumer: string;
  idempotencyKey: string;
  /** Which queue delivered this (comparison datum for the migration). */
  backend?: "bullmq" | "vercel-queues" | "inline";
  /** After this many ms a 'processing' claim is considered crashed and reclaimable. */
  staleAfterMs?: number;
}

export type JobOutcome<T> =
  | { ran: true; result: T }
  | { ran: false; skipped: "duplicate" | "in-flight" };

interface SupabaseishClient {
  from(table: string): any;
}

const DEFAULT_STALE_MS = 15 * 60 * 1000;

export async function runJobOnce<T>(
  supabase: SupabaseishClient,
  claim: JobClaim,
  fn: () => Promise<T>,
): Promise<JobOutcome<T>> {
  const table = supabase.from("job_executions");
  const { error: claimError } = await table.insert({
    consumer: claim.consumer,
    idempotency_key: claim.idempotencyKey,
    status: "processing",
    queue_backend: claim.backend ?? null,
  });

  if (claimError) {
    if (claimError.code !== "23505") {
      // The ledger being down must FAIL the job (retry later), not skip the
      // dedup: running side effects unrecorded is the bug this module exists
      // to prevent.
      throw new Error(`[jobs] could not claim ${claim.idempotencyKey}: ${claimError.message}`);
    }
    // Key exists. Completed → true duplicate. Failed → retryable. Processing →
    // in-flight (or crashed: reclaim past the deadline).
    const { data: existing } = await supabase
      .from("job_executions")
      .select("status, claimed_at, attempts")
      .eq("consumer", claim.consumer)
      .eq("idempotency_key", claim.idempotencyKey)
      .maybeSingle();

    if (!existing || existing.status === "completed") {
      return { ran: false, skipped: "duplicate" };
    }
    const staleAfter = claim.staleAfterMs ?? DEFAULT_STALE_MS;
    const age = Date.now() - new Date(existing.claimed_at as string).getTime();
    if (existing.status === "processing" && age < staleAfter) {
      return { ran: false, skipped: "in-flight" };
    }
    // failed, or crashed-processing: take over the claim.
    await supabase
      .from("job_executions")
      .update({
        status: "processing",
        claimed_at: new Date().toISOString(),
        attempts: (Number(existing.attempts) || 1) + 1,
        queue_backend: claim.backend ?? null,
        error: null,
      })
      .eq("consumer", claim.consumer)
      .eq("idempotency_key", claim.idempotencyKey);
  }

  try {
    const result = await fn();
    await supabase
      .from("job_executions")
      .update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("consumer", claim.consumer)
      .eq("idempotency_key", claim.idempotencyKey);
    return { ran: true, result };
  } catch (err) {
    await supabase
      .from("job_executions")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error: err instanceof Error ? err.message.slice(0, 500) : String(err).slice(0, 500),
      })
      .eq("consumer", claim.consumer)
      .eq("idempotency_key", claim.idempotencyKey);
    throw err; // the queue's retry/backoff policy still applies
  }
}
