
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildHealingPrompt,
  formatErrorsForHealing,
  isBundlerError,
  isNoisePreviewError,
  parsePreviewErrorClear,
  parsePreviewErrorMessage,
  parsePreviewReady,
  type PreviewErrorKind,
  type PreviewErrorReport,
  type PreviewRuntimeError,
} from "@/lib/preview/preview-error-bridge";

export type PreviewGuardPhase = "idle" | "healthy" | "frozen" | "healing";

/**
 * Silence required after a fresh preview boots before the pause auto-lifts.
 * Crashes surface within a few hundred ms of mount; this is comfortably past
 * that while still clearing a stale banner faster than a user would notice.
 */
const RESUME_GRACE_MS = 2_500;

/**
 * Hard ceiling on the "Self-repairing…" state.
 *
 * Entering `healing` is cheap — a click, or an auto-heal — but LEAVING it
 * depends on someone else eventually calling `completeHealing()` or
 * `failHealing()`. Every one of those callers is a different component
 * reacting to a window event, and each has its own early returns: the chat
 * panel drops the heal prompt when credits are exhausted or a build is
 * already streaming, a navigation unmounts the listener mid-repair, a
 * network error skips the dispatch. When any of those fire, nothing calls
 * back, `freezePreview` stays true, and the overlay shows a spinner with no
 * "Try to fix" button — a one-way door out of a working editor.
 *
 * Rather than chase every caller (and every future one), this timer makes
 * the state unable to be permanent: after the ceiling we fall back to
 * `frozen`, which still shows the errors but restores "Try to fix" and
 * "Resume". A repair that really is still running will call
 * `completeHealing()` when it lands and clear the banner anyway, so a
 * false timeout costs the user nothing but an early button.
 *
 * 90s is past the p99 of a real /api/ai/fix round-trip (model call, file
 * write, preview reboot, 12s settle wait) so a healthy repair is never
 * interrupted.
 */
const HEAL_TIMEOUT_MS = 90_000;

export interface UsePreviewErrorGuardOptions {
  /** Preview iframe ref (WebContainer or Sandpack) — optional source filter */
  iframeRef?: React.RefObject<HTMLIFrameElement | null>;
  /** Called when errors are collected and ready for AI healing */
  onHealRequest?: (prompt: string, report: PreviewErrorReport) => void;
  /** Auto-trigger healing when bundler errors appear */
  autoHeal?: boolean;
  /** Max errors to accumulate before dedupe window resets */
  maxErrors?: number;
  /** Debounce ms before freezing + reporting (default 300) */
  debounceMs?: number;
  /** When true, only accept postMessage from iframeRef (default false) */
  strictIframeSource?: boolean;
}

export interface PreviewErrorGuardApi {
  phase: PreviewGuardPhase;
  report: PreviewErrorReport | null;
  freezePreview: boolean;
  clearErrors: () => void;
  startHealing: () => void;
  enterHealingPhase: () => void;
  completeHealing: () => void;
  failHealing: () => void;
}

export function usePreviewErrorGuard(
  options: UsePreviewErrorGuardOptions,
): PreviewErrorGuardApi {
  const {
    iframeRef,
    onHealRequest,
    autoHeal = false,
    maxErrors = 20,
    debounceMs = 300,
    strictIframeSource = false,
  } = options;

  const [phase, setPhase] = useState<PreviewGuardPhase>("idle");
  const [report, setReport] = useState<PreviewErrorReport | null>(null);
  const errorsRef = useRef<PreviewRuntimeError[]>([]);
  const seenErrorsRef = useRef<Set<string>>(new Set());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const healingRef = useRef(false);
  /** Pending auto-resume; see handlePreviewReady. */
  const resumeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Ceiling on `healing`; see HEAL_TIMEOUT_MS. */
  const healTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const disarmHealWatchdog = useCallback(() => {
    if (healTimerRef.current) {
      clearTimeout(healTimerRef.current);
      healTimerRef.current = null;
    }
  }, []);

  /**
   * Enter healing and guarantee an exit. Every path that sets
   * `healingRef.current = true` goes through here so none of them can leave
   * the overlay spinning forever when its completion callback never arrives.
   */
  const beginHealing = useCallback(() => {
    healingRef.current = true;
    disarmHealWatchdog();
    healTimerRef.current = setTimeout(() => {
      healTimerRef.current = null;
      if (!healingRef.current) return; // finished normally in the meantime
      healingRef.current = false;
      // Back to `frozen`, not `healthy`: the errors were never proven fixed,
      // so we keep showing them — but with the repair and resume controls the
      // healing overlay hides.
      setPhase((prev) => (prev === "healing" ? "frozen" : prev));
    }, HEAL_TIMEOUT_MS);
  }, [disarmHealWatchdog]);
  // Keep heal callback in a ref so flushReport/startHealing stay referentially
  // stable — an inline onHealRequest from PreviewPanel used to recreate the
  // whole API object every render and thrash dependent effects.
  const onHealRequestRef = useRef(onHealRequest);
  onHealRequestRef.current = onHealRequest;
  const autoHealRef = useRef(autoHeal);
  autoHealRef.current = autoHeal;

  const buildReport = useCallback((): PreviewErrorReport => {
    const errors = [...errorsRef.current];
    const formatted = formatErrorsForHealing(errors);
    const hasFatal = errors.some(
      (e) => e.kind === "bundler" || e.kind === "runtime" || isBundlerError(e.message),
    );
    return { errors, formatted, hasFatal };
  }, []);

  const flushReport = useCallback(() => {
    const r = buildReport();
    if (r.errors.length === 0) return;

    setReport((prev) => {
      if (
        prev &&
        prev.errors.length === r.errors.length &&
        prev.errors.every(
          (err, i) =>
            err.message === r.errors[i]?.message && err.kind === r.errors[i]?.kind,
        )
      ) {
        return prev;
      }
      return r;
    });
    if (healingRef.current) return;

    setPhase("frozen");

    if (autoHealRef.current && onHealRequestRef.current) {
      const prompt = buildHealingPrompt(r.errors);
      if (!prompt) return;
      beginHealing();
      setPhase("healing");
      onHealRequestRef.current(prompt, r);
    }
  }, [buildReport, beginHealing]);

  const cancelAutoResume = useCallback(() => {
    if (resumeTimerRef.current) {
      clearTimeout(resumeTimerRef.current);
      resumeTimerRef.current = null;
    }
  }, []);

  /**
   * A fresh preview document booted — decide whether the pause still applies.
   *
   * Two things must happen, and the order matters:
   *
   * 1. Forget the previous document's errors AND their dedupe keys. Keeping
   *    the keys would be actively dangerous: `pushError` suppresses a message
   *    it has already seen, so a bug that survives the reload would be
   *    swallowed and we would auto-resume onto a still-broken app. Clearing
   *    them lets a genuine repeat re-report and re-freeze.
   *
   * 2. Wait a grace window before declaring health. A crash usually fires
   *    within a few hundred milliseconds of mount, so silence across the
   *    window is real evidence rather than an optimistic guess. Any error
   *    arriving during it cancels the resume via `pushError`.
   *
   * Healing owns its own transition (completeHealing / failHealing), so this
   * stays out of the way while a repair is in flight.
   */
  const handlePreviewReady = useCallback(() => {
    errorsRef.current = [];
    seenErrorsRef.current.clear();
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (healingRef.current) return;
    cancelAutoResume();
    resumeTimerRef.current = setTimeout(() => {
      resumeTimerRef.current = null;
      if (errorsRef.current.length > 0) return; // it broke again — stay frozen
      setReport((prev) => (prev === null ? prev : null));
      setPhase((prev) => (prev === "frozen" ? "healthy" : prev));
    }, RESUME_GRACE_MS);
  }, [cancelAutoResume]);

  const pushError = useCallback(
    (err: PreviewRuntimeError) => {
      if (isNoisePreviewError(err.message, { filename: err.filename, stack: err.stack })) return;
      if (healingRef.current) return;
      // Real evidence of breakage — an auto-resume in flight is now wrong.
      cancelAutoResume();
      const key = `${err.kind}:${err.message}`;
      if (seenErrorsRef.current.has(key)) return;
      seenErrorsRef.current.add(key);

      errorsRef.current.push(err);
      if (errorsRef.current.length > maxErrors) {
        errorsRef.current = errorsRef.current.slice(-maxErrors);
      }

      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(flushReport, debounceMs);
    },
    [cancelAutoResume, debounceMs, flushReport, maxErrors],
  );

  // Retract errors of a given kind (used by the bridge's late-mount CLEAR:
  // the empty-root probe fired a phantom "crashed" on a slow cold sandbox,
  // then React actually painted). Removing the empty-root error un-freezes
  // the preview so the banner disappears the moment the app truly mounts.
  const clearErrorKind = useCallback((kind: PreviewErrorKind) => {
    const before = errorsRef.current.length;
    errorsRef.current = errorsRef.current.filter((e) => e.kind !== kind);
    if (errorsRef.current.length === before) return; // nothing of this kind pending
    // Drop the dedupe keys for this kind so a genuine future crash can re-report.
    for (const key of Array.from(seenErrorsRef.current)) {
      if (key.startsWith(`${kind}:`)) seenErrorsRef.current.delete(key);
    }
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    if (errorsRef.current.length === 0) {
      healingRef.current = false;
      disarmHealWatchdog();
      setReport((prev) => (prev === null ? prev : null));
      setPhase((prev) => (prev === "healthy" ? prev : "healthy"));
    } else {
      // Real errors remain — refresh the report without the retracted kind.
      setReport(buildReport());
    }
  }, [buildReport, disarmHealWatchdog]);

  const parseLegacyPreviewMessage = useCallback((data: unknown): PreviewRuntimeError | null => {
    if (!data || typeof data !== "object") return null;
    const d = data as Record<string, unknown>;
    if (d.source !== "lifemark-preview" || d.type !== "error") return null;
    const msg = String(d.text ?? "");
    if (isNoisePreviewError(msg)) return null;
    return {
      kind: isBundlerError(msg) ? "bundler" : "runtime",
      message: msg,
      timestamp: Date.now(),
    };
  }, []);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (strictIframeSource && iframeRef?.current?.contentWindow && e.source !== iframeRef.current.contentWindow) {
        return;
      }

      if (parsePreviewReady(e.data)) {
        handlePreviewReady();
        return;
      }

      const cleared = parsePreviewErrorClear(e.data);
      if (cleared) {
        clearErrorKind(cleared);
        return;
      }

      const structured = parsePreviewErrorMessage(e.data);
      if (structured) {
        pushError(structured);
        return;
      }

      const legacy = parseLegacyPreviewMessage(e.data);
      if (legacy) pushError(legacy);
    }

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, [
    iframeRef,
    clearErrorKind,
    handlePreviewReady,
    parseLegacyPreviewMessage,
    pushError,
    strictIframeSource,
  ]);

  // Never leave a timer running past unmount.
  useEffect(
    () => () => {
      cancelAutoResume();
      disarmHealWatchdog();
    },
    [cancelAutoResume, disarmHealWatchdog],
  );

  const clearErrors = useCallback(() => {
    errorsRef.current = [];
    seenErrorsRef.current.clear();
    healingRef.current = false;
    cancelAutoResume();
    disarmHealWatchdog();
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setReport((prev) => (prev === null ? prev : null));
    setPhase((prev) => (prev === "healthy" ? prev : "healthy"));
  }, [cancelAutoResume, disarmHealWatchdog]);

  const enterHealingPhase = useCallback(() => {
    if (healingRef.current) return;
    beginHealing();
    setPhase((prev) => (prev === "healing" ? prev : "healing"));
  }, [beginHealing]);

  const startHealing = useCallback(() => {
    const r = buildReport();
    const prompt = buildHealingPrompt(r.errors);
    if (!prompt) return;
    enterHealingPhase();
    onHealRequestRef.current?.(prompt, r);
  }, [buildReport, enterHealingPhase]);

  const completeHealing = useCallback(() => {
    healingRef.current = false;
    clearErrors();
  }, [clearErrors]);

  const failHealing = useCallback(() => {
    healingRef.current = false;
    disarmHealWatchdog();
    // Only ever a DEMOTION out of healing. This used to force "frozen" from
    // any phase, so a heal-failed that arrived late — after the preview had
    // already recovered and the guard had cleared — re-froze a working
    // preview and showed an error card for errors that no longer existed.
    setPhase((prev) => (prev === "healing" ? "frozen" : prev));
  }, [disarmHealWatchdog]);

  const freezePreview = phase === "frozen" || phase === "healing";

  return useMemo(
    () => ({
      phase,
      report,
      freezePreview,
      clearErrors,
      startHealing,
      enterHealingPhase,
      completeHealing,
      failHealing,
    }),
    [
      phase,
      report,
      freezePreview,
      clearErrors,
      startHealing,
      enterHealingPhase,
      completeHealing,
      failHealing,
    ],
  );
}
