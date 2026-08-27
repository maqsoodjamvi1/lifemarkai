/**
 * Measured model performance, read back into routing decisions.
 *
 * The second write-only table. ai_eval_log records every generation — model,
 * task, latency, success, tokens, cost — and selectModelChain() ranked models
 * on HARDCODED strength lists while a thousand rows of ground truth sat
 * unread. The same shape as repair_outcomes before repair-memory.ts: the
 * system measures itself and never looks.
 *
 * What this deliberately is NOT: an auto-router that swaps tiers on its own.
 * Production spent weeks running an env-defined ladder no code described, and
 * this branch just finished making configuration honest again — a background
 * process silently repointing tiers would reintroduce exactly that opacity
 * with extra steps. Measured performance therefore DEMOTES within a cascade
 * (a model with a proven bad run rate on this task moves behind its
 * alternatives) and never changes which models are in it. Tier constants stay
 * authoritative; humans change them, with this module's numbers in hand.
 *
 * Statistical humility is enforced, not advised:
 *   - below MIN_SAMPLE calls for a (model, task) pair, no opinion;
 *   - only failure rates >= DEMOTE_THRESHOLD demote — routine noise never
 *     reorders anything;
 *   - the window is recent (default 7 days) so a model that was fixed
 *     upstream stops being punished for its past.
 */

export interface ModelTaskStats {
  model: string;
  task: string;
  calls: number;
  failures: number;
  /** 0..1 */
  failureRate: number;
  medianLatencyMs: number | null;
}

export const MIN_SAMPLE = 8;
export const DEMOTE_THRESHOLD = 0.35;

/** Pure aggregation over raw eval rows — testable without a database. */
export function aggregateStats(
  rows: ReadonlyArray<{
    model: string | null;
    task: string | null;
    success: boolean | null;
    latency_ms: number | null;
  }>,
): ModelTaskStats[] {
  const byKey = new Map<string, { calls: number; failures: number; latencies: number[] }>();
  for (const r of rows) {
    if (!r.model || !r.task) continue;
    const k = `${r.model} ${r.task}`;
    const s = byKey.get(k) ?? { calls: 0, failures: 0, latencies: [] };
    s.calls++;
    if (r.success === false) s.failures++;
    if (typeof r.latency_ms === "number") s.latencies.push(r.latency_ms);
    byKey.set(k, s);
  }
  return [...byKey].map(([k, s]) => {
    const [model, task] = k.split(" ");
    const sorted = [...s.latencies].sort((a, b) => a - b);
    return {
      model,
      task,
      calls: s.calls,
      failures: s.failures,
      failureRate: s.calls ? s.failures / s.calls : 0,
      medianLatencyMs: sorted.length ? sorted[Math.floor(sorted.length / 2)] : null,
    };
  });
}

/**
 * Reorder a cascade using measured evidence: models with a PROVEN bad recent
 * run on this task move to the back; everything else keeps its original order
 * exactly (the sort is stable and the key is binary). The set of models is
 * never changed — a demoted model is still there as the last resort it has
 * earned.
 */
export function demoteByEvidence(
  chain: readonly string[],
  task: string,
  stats: readonly ModelTaskStats[],
): string[] {
  const bad = new Set(
    stats
      .filter(
        (s) =>
          s.task === task &&
          s.calls >= MIN_SAMPLE &&
          s.failureRate >= DEMOTE_THRESHOLD,
      )
      .map((s) => s.model),
  );
  if (bad.size === 0) return [...chain];
  return [...chain].sort((a, b) => Number(bad.has(a)) - Number(bad.has(b)));
}

/**
 * Fetch recent stats. Best-effort like every observability read in this repo:
 * any failure returns [] and routing proceeds on its static order.
 */
export async function fetchRecentStats(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opts: { days?: number; task?: string } = {},
): Promise<ModelTaskStats[]> {
  try {
    const since = new Date(Date.now() - (opts.days ?? 7) * 86_400_000).toISOString();
    let q = supabase
      .from("ai_eval_log")
      .select("model, task, success, latency_ms")
      .gte("created_at", since)
      .limit(5_000);
    if (opts.task) q = q.eq("task", opts.task);
    const { data, error } = await q;
    if (error || !Array.isArray(data)) return [];
    return aggregateStats(data);
  } catch {
    return [];
  }
}
