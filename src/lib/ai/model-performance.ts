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
 * WHAT THE SIGNAL MEANS — a framing correction from external review. The
 * `success` column records whether the PROVIDER CALL returned, not whether the
 * generated code worked: models here sit at 98-100% "success" while only about
 * half of builds avoid a repair. So this module measures AVAILABILITY, and it
 * is wired into the one place availability is the right signal — the agent's
 * provider-failure cascade, whose documented job is escaping rate limits and
 * outages. It must NOT be used for quality routing: optimising on this column
 * would select for reliable APIs serving broken code. Quality routing needs
 * verified build outcomes (build_runs joined to calls via the build
 * correlation id), which is follow-up work gated on build_runs actually being
 * populated in production.
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
/**
 * Failures that are LifemarkAI's own fault, not the provider's. A model must
 * be demoted for instability — rate limits, outages, timeouts — and never
 * because our gateway secret expired or the OpenRouter balance ran dry, which
 * would demote every model at once for a problem no cascade can route around.
 */
const CONFIG_FAILURE_RE =
  /\b(401|403|invalid[_ ]?api[_ ]?key|unauthorized|insufficient|balance|quota exceeded|payment|gateway secret|misconfigur)\b/i;

export function isProviderFailure(error: string | null | undefined): boolean {
  if (!error) return true; // failure with no detail: assume provider, the safe read
  return !CONFIG_FAILURE_RE.test(error);
}

/**
 * In-process TTL cache. fetchRecentStats sat on the agent-start path pulling
 * up to 5,000 rows per run — availability moves on the scale of minutes, so a
 * 2-minute cache keeps startup at zero queries in the steady state. (External
 * review; correct.) A shared aggregate table is the better end-state once
 * build_runs correlation lands; this removes the per-run cost today.
 */
const STATS_TTL_MS = 120_000;
const statsCache = new Map<string, { at: number; stats: ModelTaskStats[] }>();

export async function fetchRecentStats(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  opts: { days?: number; task?: string } = {},
): Promise<ModelTaskStats[]> {
  const cacheKey = `${opts.task ?? "*"}:${opts.days ?? 7}`;
  const hit = statsCache.get(cacheKey);
  if (hit && Date.now() - hit.at < STATS_TTL_MS) return hit.stats;
  try {
    const since = new Date(Date.now() - (opts.days ?? 7) * 86_400_000).toISOString();
    let q = supabase
      .from("ai_eval_log")
      .select("model, task, success, latency_ms, error")
      .gte("created_at", since)
      .limit(5_000);
    if (opts.task) q = q.eq("task", opts.task);
    const { data, error } = await q;
    if (error || !Array.isArray(data)) return [];
    // Reclassify config-class failures as non-failures BEFORE aggregation, so
    // a misconfigured secret cannot demote the whole catalogue.
    const rows = (data as Array<{ model: string | null; task: string | null; success: boolean | null; latency_ms: number | null; error?: string | null }>).map(
      (r) => (r.success === false && !isProviderFailure(r.error) ? { ...r, success: true } : r),
    );
    const stats = aggregateStats(rows);
    statsCache.set(cacheKey, { at: Date.now(), stats });
    return stats;
  } catch {
    return [];
  }
}

/** Test hook: clear the TTL cache. */
export function __clearStatsCache(): void {
  statsCache.clear();
}
