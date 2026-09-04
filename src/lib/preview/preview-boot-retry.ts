/**
 * Retry policy for the "This preview is starting" page.
 *
 * WHY THIS EXISTS: the boot page reloads itself because it has nothing to
 * listen on — it is served by the main app precisely *because* the preview
 * backend is absent (see preview-booting.tsx). The first version scheduled one
 * `setTimeout` per page load and multiplied its delay afterwards, so the
 * backoff it documented never actually happened: every reload started a fresh
 * module with the delay back at its initial value, and the page hammered a
 * dead hostname every few seconds forever.
 *
 * Forever is the real defect. A sandbox that has not come up in two minutes is
 * usually not "still starting" — it is a project whose container was reclaimed,
 * or a shared link to a preview that no longer exists. Reloading such a page
 * until the tab is closed burns the visitor's battery, keeps a pointless load
 * on the origin, and — worst of all — tells them nothing. They sit watching a
 * spinner that will never resolve (see #10).
 *
 * So the policy is a pure function of (attempt, elapsed): the caller persists
 * those two numbers across reloads, and this decides whether to try again and
 * how long to wait. Being pure is the point — the failure above was invisible
 * precisely because the timing logic lived inside an effect nothing could call.
 */

/** Delay before the first retry. Short: most previews come up quickly. */
export const FIRST_RETRY_MS = 3_000;

/** Ceiling for the backoff, so a slow cold start still gets polled. */
export const MAX_RETRY_MS = 15_000;

/**
 * How long to keep trying before treating the preview as absent rather than
 * slow. A cold `npm install` fits comfortably inside this; a reclaimed sandbox
 * never will.
 */
export const GIVE_UP_AFTER_MS = 120_000;

export interface BootRetryDecision {
  /** Reload once more, or stop and tell the visitor plainly. */
  action: "reload" | "give-up";
  /** How long to wait before reloading. Always 0 when giving up. */
  delayMs: number;
}

/**
 * Decide what the boot page should do next.
 *
 * @param attempt   Reloads already made for this hostname (0 on first view).
 * @param elapsedMs Milliseconds since the visitor first landed here, across
 *                  reloads — not since this particular page load.
 */
export function nextBootRetry(attempt: number, elapsedMs: number): BootRetryDecision {
  // Negative/NaN inputs come from a corrupted or hand-edited storage value.
  // Treat them as "just arrived" rather than trusting them into a branch.
  const safeAttempt = Number.isFinite(attempt) && attempt > 0 ? Math.floor(attempt) : 0;
  const safeElapsed = Number.isFinite(elapsedMs) && elapsedMs > 0 ? elapsedMs : 0;

  if (safeElapsed >= GIVE_UP_AFTER_MS) return { action: "give-up", delayMs: 0 };

  const backoff = FIRST_RETRY_MS * Math.pow(1.5, safeAttempt);
  const delayMs = Math.min(Math.round(backoff), MAX_RETRY_MS);

  // Never schedule a reload that lands well past the give-up point — it would
  // show a spinner the policy has already decided is a lie.
  if (safeElapsed + delayMs >= GIVE_UP_AFTER_MS + MAX_RETRY_MS) {
    return { action: "give-up", delayMs: 0 };
  }

  return { action: "reload", delayMs };
}
