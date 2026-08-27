/**
 * The repair ladder's promotion rule, as pure functions.
 *
 * Its own leaf module for the same reason repair-model-ladder.ts is: the logic
 * that decides what a failed build costs used to live inside
 * runSelfVerification(), a 900-line function that needs Supabase, Playwright
 * and a live project before it will run at all — so the rule was untestable and
 * nothing noticed when it was wrong.
 *
 * It was wrong. Promotion was keyed on ROUND NUMBER, so the second repair round
 * escalated unconditionally. Measured against repair_outcomes (11 days, n=46
 * typecheck attempts) that meant escalating away from a tier resolving ~70% of
 * the errors it saw, to one resolving ~41%, at roughly 200x the price per call.
 *
 * The rule here keys on OBSERVED PROGRESS instead: a tier that reduced the
 * error count keeps its turn; a tier that stalled hands off.
 */

/**
 * Should the ladder promote before the next repair attempt?
 *
 * @param errorCount     errors observed at the START of this round — i.e. after
 *                       the previous round's repair, re-measured by a real
 *                       typecheck or render, never self-reported.
 * @param lastErrorCount the same measurement one round earlier; null on the
 *                       first round, when there is nothing to compare against.
 */
export function shouldPromoteRepairTier(
  errorCount: number,
  lastErrorCount: number | null,
): boolean {
  // No baseline yet — the first attempt has not been graded, so it cannot have
  // failed. Promoting here would reproduce the round-number bug exactly.
  if (lastErrorCount === null) return false;
  // Equal counts promote. "Changed nothing" and "made it worse" are the same
  // signal for this purpose: whatever this tier is doing has stopped working.
  return errorCount >= lastErrorCount;
}

/**
 * Which tier actually runs, given how far promotion has got and what the
 * context shape allows.
 *
 * `floor` exists because the cheapest tier is only safe on small, precisely
 * located work — it is measured to collapse on large inputs (175s on a 250-line
 * file). So a bulky or heuristic context raises the floor for that round. The
 * floor can push a round UP the ladder; it can never pull it back down, because
 * `tier` is a high-water mark and a tier that already stalled has not become
 * capable again.
 */
export function resolveRepairTier(
  tier: number,
  floor: number,
  tierCount: number,
): number {
  return Math.min(Math.max(tier, floor), tierCount - 1);
}

/** Has the ladder run out of tiers to promote into? */
export function isLadderExhausted(tier: number, tierCount: number): boolean {
  return tier >= tierCount;
}
