/**
 * Record whether a repair attempt actually helped.
 *
 * The counterpart to `eval-log.ts`: that answers "did the model respond", this
 * answers "did the code get better". Both are fire-and-forget through the
 * service-role client, because observability must never be able to break a
 * generation — a logging failure that killed a build would be a strictly worse
 * bug than the one it was trying to measure.
 *
 * Writes to `repair_outcomes` (migration 161). See that file for why the labels
 * are fingerprint SETS rather than counts; the short version is that a round
 * which fixes one error and introduces another leaves the count unchanged while
 * having made things worse, and that is precisely the failure mode worth
 * catching.
 */
import { createAdminClient } from "../supabase/server.ts";
import {
distinctFingerprints,
scoreRepair,
type FailureIdentity,
} from "@/lib/ai/failure-fingerprint";

export interface RepairAttempt {
  projectId?: string;
  userId?: string;
  /** 'autofix' | 'self_verify' | 'build' */
  stage: string;
  /** 1-based round within that stage. */
  round?: number;
  model?: string;
  /**
   * Where the labels came from. Success rates from different signals are not
   * comparable — a typecheck sees the whole project, a render only sees the
   * routes it reached — so this is stored and must be filtered on.
   */
  signal: "typecheck" | "runtime" | "validation";
  before: FailureIdentity[];
  after: FailureIdentity[];
  filesWritten?: string[];
  filesRejected?: string[];
  durationMs?: number;
}

/** Best-effort insert. Never throws; silently no-ops if the table isn't ready. */
export function recordRepairOutcome(attempt: RepairAttempt): void {
  void (async () => {
    try {
      const score = scoreRepair(attempt.before, attempt.after);
      const before = distinctFingerprints(attempt.before);

      // Nothing was wrong to begin with — no attempt, nothing to learn.
      if (before.length === 0 && score.introduced.length === 0) return;

      const supabase = await createAdminClient();
      await supabase.from("repair_outcomes").insert({
        project_id: attempt.projectId ?? null,
        user_id: attempt.userId ?? null,
        stage: attempt.stage,
        round: attempt.round ?? 1,
        model: attempt.model ?? null,
        signal: attempt.signal,
        before_fingerprints: before,
        resolved: score.resolved,
        introduced: score.introduced,
        remaining: score.remaining,
        // The first failure is the most useful sample: diagnostics are ranked
        // with the app-breaking ones first, so this is the one worth reading.
        sample_label: attempt.before[0]?.label?.slice(0, 300) ?? null,
        files_written: (attempt.filesWritten ?? []).slice(0, 50),
        files_rejected: (attempt.filesRejected ?? []).slice(0, 50),
        duration_ms: attempt.durationMs ?? null,
        fully_resolved: score.remaining.length === 0 && score.introduced.length === 0,
        made_worse: score.introduced.length > 0,
      });
    } catch {
      /* observability must never break a repair */
    }
  })();
}
