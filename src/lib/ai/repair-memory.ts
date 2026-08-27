/**
 * Read `repair_outcomes` back into the next repair decision.
 *
 * record-outcome.ts has been writing a graded record of every repair attempt —
 * which model, which failure fingerprints were present, what it resolved, what
 * it introduced, whether it made things worse. 56 rows of it in production, and
 * until now NOTHING read a single one back. The system kept a memory of its own
 * failures and never consulted it, so it would cheerfully re-attempt an
 * approach that had already failed three times on the identical error.
 *
 * That is the difference between a prompt-only builder and one that learns:
 * not a bigger model, but a system that knows what it already tried.
 *
 * Two uses, both deliberately conservative:
 *
 *   1. A prompt block telling the repair model what has already been attempted
 *      on this exact failure identity, and what it cost. "Rewriting App.tsx did
 *      not resolve this and introduced two new errors" is worth more than any
 *      amount of additional instruction.
 *   2. A starting tier for the ladder. If the cheap tier has repeatedly failed
 *      THIS fingerprint, starting there again buys a known-wasted round.
 *
 * SCOPE UNDER RLS — a correction from external review. Every production call
 * site hands runSelfVerification the USER-SCOPED client, and repair_outcomes
 * RLS exposes only that user's projects. Cross-project rows therefore never
 * arrive here in practice: the cross-project handling below is defence in
 * depth (and covers any future admin-client caller), not a live signal today.
 * Getting genuine cross-project aggregates requires a SECURITY DEFINER
 * database function that returns fingerprint/model/counts and NOTHING else —
 * a migration, listed as follow-up work, not something to fake with a wider
 * client.
 *
 * PRIVACY — the reason this is not a single global query. `files_written` and
 * `sample_label` carry paths and error text from a specific user's project.
 * Cross-project rows therefore contribute only aggregate signal (how often a
 * model resolved this failure identity) and never file paths or samples. Full
 * detail comes exclusively from the SAME project.
 */
import type { FailureIdentity } from "@/lib/ai/failure-fingerprint";
import { distinctFingerprints } from "@/lib/ai/failure-fingerprint";

export interface PriorAttempt {
  model: string | null;
  round: number | null;
  /**
   * How much of the CURRENT failure set this historical attempt actually
   * covered, 0..1. The lookup matches on array OVERLAP, so a historical row
   * sharing one fingerprint of the current five is a weak relative, not "this
   * exact failure" — the first version conflated the two, which overstated
   * history in the prompt and let a barely-related row steer the tier. Caught
   * in external review. Tier decisions require high coverage; low-coverage
   * rows contribute prompt context only, and are labelled as related rather
   * than identical.
   */
  coverage: number;
  /** How many distinct failures this attempt cleared. */
  resolved: number;
  /** How many NEW failures it created. */
  introduced: number;
  fullyResolved: boolean;
  madeWorse: boolean;
  /** Same-project rows only — omitted for cross-project rows (see PRIVACY). */
  filesWritten?: string[];
  sampleLabel?: string | null;
  sameProject: boolean;
}

/** Never let this grow a prompt without bound. */
const MAX_ATTEMPTS_IN_PROMPT = 5;

/**
 * What the ladder should learn from history.
 *
 * A tier that has attempted this exact failure and never fully resolved it is
 * evidence, not proof — so it raises the FLOOR by one at most, never skips
 * straight to the top. Being wrong here costs one cheap round; being
 * over-aggressive costs an escalation every time a fingerprint recurs.
 */
/** Coverage below this is a related failure, not this failure. */
export const TIER_EVIDENCE_MIN_COVERAGE = 0.6;
/** Same-project attempts needed before a tier is skipped. */
export const MIN_SAME_PROJECT_FAILURES = 2;
/** Cross-project attempts needed — weaker evidence, higher bar. */
export const MIN_CROSS_PROJECT_FAILURES = 5;

export function suggestedStartingTier(
  attempts: readonly PriorAttempt[],
  tierOfModel: (model: string | null) => number | null,
  tierCount: number,
): number {
  if (attempts.length === 0) return 0;

  // Evidence thresholds, because the first version raised the floor on ONE
  // prior failure — a single bad row (possibly from another project, possibly
  // sharing one fingerprint of five) permanently skipped the cheapest tier for
  // that failure. One attempt is an anecdote. A tier is skipped only when it
  // has non-progressing failures at high coverage: two from THIS project, or
  // five across others. A tier that ever fully resolved the failure is never
  // skipped, whatever else it did on other days.
  const evidence = new Map<number, { same: number; cross: number; everWorked: boolean }>();
  for (const a of attempts) {
    const tier = tierOfModel(a.model);
    if (tier === null) continue;
    const e = evidence.get(tier) ?? { same: 0, cross: 0, everWorked: false };
    if (a.fullyResolved) e.everWorked = true;
    else if (a.coverage >= TIER_EVIDENCE_MIN_COVERAGE && (a.resolved === 0 || a.madeWorse)) {
      if (a.sameProject) e.same++;
      else e.cross++;
    }
    evidence.set(tier, e);
  }

  let floor = 0;
  for (const [tier, e] of evidence) {
    if (e.everWorked) continue;
    if (e.same >= MIN_SAME_PROJECT_FAILURES || e.cross >= MIN_CROSS_PROJECT_FAILURES) {
      floor = Math.max(floor, tier + 1);
    }
  }
  return Math.min(floor, tierCount - 1);
}

/**
 * The prompt fragment. Empty string when there is nothing useful to say — an
 * empty "no prior attempts" section is pure token cost and invites the model to
 * treat absence of history as meaningful.
 */
export function buildPriorAttemptsBlock(attempts: readonly PriorAttempt[]): string {
  if (attempts.length === 0) return "";

  const ranked = [...attempts]
    // Failures first: what NOT to repeat is the more actionable half.
    .sort((a, b) => Number(a.fullyResolved) - Number(b.fullyResolved))
    .slice(0, MAX_ATTEMPTS_IN_PROMPT);

  const lines = ranked.map((a) => {
    const who = a.model ?? "an earlier model";
    const relation = a.coverage >= TIER_EVIDENCE_MIN_COVERAGE ? "" : " (on a related, partly-overlapping failure)";
    const outcome = a.fullyResolved
      ? "RESOLVED it"
      : a.madeWorse
        ? `did NOT resolve it and introduced ${a.introduced} new error(s)`
        : a.resolved > 0
          ? `cleared ${a.resolved} of the errors but left the rest`
          : "changed nothing";
    const where =
      a.sameProject && a.filesWritten?.length
        ? ` by editing ${a.filesWritten.slice(0, 4).join(", ")}`
        : "";
    return `- ${who} ${outcome}${where}${relation}.`;
  });

  const anyWorked = ranked.some((a) => a.fullyResolved);
  const guidance = anyWorked
    ? "One earlier attempt did resolve this. Prefer that shape of change."
    : "None of these worked. Do NOT repeat them — change your approach, not just your wording.";

  return [
    "",
    "This failure (or one sharing its fingerprints) has been attempted before:",
    ...lines,
    guidance,
    "",
  ].join("\n");
}

/** Row shape as stored; kept local so this module needs no generated types. */
export interface RepairOutcomeRow {
  model: string | null;
  before_fingerprints?: string[] | null;
  round: number | null;
  resolved: string[] | null;
  introduced: string[] | null;
  fully_resolved: boolean | null;
  made_worse: boolean | null;
  files_written: string[] | null;
  sample_label: string | null;
  project_id: string | null;
}

/** Map stored rows to attempts, applying the cross-project privacy rule. */
export function toPriorAttempts(
  rows: readonly RepairOutcomeRow[],
  currentProjectId: string | undefined,
  currentFingerprints: readonly string[] = [],
): PriorAttempt[] {
  const currentSet = new Set(currentFingerprints);
  return rows.map((r) => {
    const sameProject = !!currentProjectId && r.project_id === currentProjectId;
    const matched = (r.before_fingerprints ?? []).filter((f) => currentSet.has(f)).length;
    const coverage = currentSet.size > 0 ? matched / currentSet.size : 0;
    return {
      model: r.model,
      round: r.round,
      coverage,
      resolved: r.resolved?.length ?? 0,
      introduced: r.introduced?.length ?? 0,
      fullyResolved: r.fully_resolved === true,
      madeWorse: r.made_worse === true,
      sameProject,
      // Paths and error samples are project-specific. They cross no boundary.
      ...(sameProject
        ? { filesWritten: r.files_written ?? [], sampleLabel: r.sample_label }
        : {}),
    };
  });
}

/**
 * Look up prior attempts at the same failure identity.
 *
 * Fire-and-forget in spirit: any failure returns [] rather than throwing.
 * Repair memory is an improvement to a repair, never a precondition for one —
 * the same rule record-outcome.ts follows on the write side.
 */
export async function lookupPriorAttempts(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  before: readonly FailureIdentity[],
  opts: { projectId?: string; signal: string; limit?: number } = { signal: "typecheck" },
): Promise<PriorAttempt[]> {
  const fingerprints = distinctFingerprints([...before]);
  if (fingerprints.length === 0) return [];
  try {
    const { data, error } = await supabase
      .from("repair_outcomes")
      .select(
        "model, round, resolved, introduced, fully_resolved, made_worse, files_written, sample_label, project_id, before_fingerprints",
      )
      // Success rates from different signals are not comparable — see the note
      // in record-outcome.ts. Comparing a typecheck row against a render row
      // would be worse than having no memory at all.
      .eq("signal", opts.signal)
      .overlaps("before_fingerprints", fingerprints)
      .order("created_at", { ascending: false })
      .limit(opts.limit ?? 12);
    if (error || !Array.isArray(data)) return [];
    return toPriorAttempts(data as RepairOutcomeRow[], opts.projectId, fingerprints);
  } catch {
    return [];
  }
}
