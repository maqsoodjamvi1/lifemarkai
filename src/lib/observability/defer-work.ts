/**
 * deferWork() — Phase 9 of the Vercel adoption plan.
 *
 * One named seam for "run this after the response, don't block the user":
 * eval logs, non-critical analytics, usage summaries, diagnostic events.
 * Today (Node on the VPS) it is a guarded fire-and-forget with the
 * correlation context captured SYNCHRONOUSLY — the ALS store is request-
 * scoped and may be gone by the time the deferred fn runs, which is exactly
 * the bug eval-log.ts fixed by hand; this makes the fix reusable. When the
 * app moves onto a platform with a real `waitUntil`, this is the single
 * function that adopts it (registerWaitUntil below), and every call site is
 * already correct.
 *
 * The plan's DO-NOT list is enforced by policy, not code, so it is repeated
 * here where the reviewer will look: never defer credit deductions, canonical
 * file persistence, Stripe subscription changes, database migrations, or
 * security decisions. Deferred work may be LOST on process exit — only work
 * whose loss is acceptable belongs here.
 */
import { correlationFields,runWithCorrelation } from "./correlation.ts";
import type { CorrelationContext } from "./correlation.ts";

type WaitUntil = (promise: Promise<unknown>) => void;

let platformWaitUntil: WaitUntil | null = null;

/** Adopt a platform waitUntil (Fluid Compute / Workers) once one exists. */
export function registerWaitUntil(waitUntil: WaitUntil): void {
  platformWaitUntil = waitUntil;
}

/**
 * Schedule fire-and-forget work. Never throws; the fn's rejection is logged
 * and swallowed. The current correlation ids are re-established around the
 * deferred execution so its log lines still join the request that caused it.
 */
export function deferWork(label: string, fn: () => Promise<unknown>): void {
  // Capture NOW — the request context is alive at call time, not at run time.
  const captured = correlationFields();

  const task = (async () => {
    try {
      await runWithCorrelation(captured as Partial<CorrelationContext>, fn);
    } catch (err) {
      console.warn(`[defer-work] ${label} failed:`, err instanceof Error ? err.message : err);
    }
  })();

  if (platformWaitUntil) {
    try {
      platformWaitUntil(task);
      return;
    } catch {
      /* fall through — the task is already running */
    }
  }
  void task;
}
