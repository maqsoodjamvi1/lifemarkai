"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  buildHealingPrompt,
  formatErrorsForHealing,
  isBundlerError,
  isNoisePreviewError,
  parsePreviewErrorMessage,
  type PreviewErrorReport,
  type PreviewRuntimeError,
} from "@/lib/preview/preview-error-bridge";

export type PreviewGuardPhase = "idle" | "healthy" | "frozen" | "healing";

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
      healingRef.current = true;
      setPhase("healing");
      onHealRequestRef.current(prompt, r);
    }
  }, [buildReport]);

  const pushError = useCallback(
    (err: PreviewRuntimeError) => {
      if (isNoisePreviewError(err.message)) return;
      if (healingRef.current) return;
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
    [debounceMs, flushReport, maxErrors],
  );

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
  }, [iframeRef, parseLegacyPreviewMessage, pushError, strictIframeSource]);

  const clearErrors = useCallback(() => {
    errorsRef.current = [];
    seenErrorsRef.current.clear();
    healingRef.current = false;
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
      debounceRef.current = null;
    }
    setReport((prev) => (prev === null ? prev : null));
    setPhase((prev) => (prev === "healthy" ? prev : "healthy"));
  }, []);

  const enterHealingPhase = useCallback(() => {
    if (healingRef.current) return;
    healingRef.current = true;
    setPhase((prev) => (prev === "healing" ? prev : "healing"));
  }, []);

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
    setPhase((prev) => (prev === "frozen" ? prev : "frozen"));
  }, []);

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
