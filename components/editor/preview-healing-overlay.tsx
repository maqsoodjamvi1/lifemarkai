"use client";

import { Loader2, Play, Terminal, Wrench } from "lucide-react";
import type { PreviewGuardPhase } from "@/hooks/use-preview-error-guard";
import type { PreviewErrorReport } from "@/lib/preview/preview-error-bridge";

interface PreviewHealingOverlayProps {
  phase: PreviewGuardPhase;
  report: PreviewErrorReport | null;
  /** Static import/export hints (missing files, export mismatches). */
  importDiagnosis?: string | null;
  onRetry?: () => void;
  onShowLogs?: () => void;
  onDismiss?: () => void;
  logsVisible?: boolean;
}

/**
 * Freezes the preview visually when bundler/runtime errors are detected.
 * The layout mirrors the mature "preview paused" flow: clear summary,
 * visible diagnostics, direct repair action, logs, and a resume escape hatch.
 */
export function PreviewHealingOverlay({
  phase,
  report,
  importDiagnosis,
  onRetry,
  onShowLogs,
  onDismiss,
  logsVisible = false,
}: PreviewHealingOverlayProps) {
  if (phase === "idle" || phase === "healthy") return null;

  const isHealing = phase === "healing";
  const title = isHealing ? "Self-repairing..." : "Preview paused";
  const subtitle = isHealing
    ? "AI is applying fixes to resolve build errors."
    : "A syntax or runtime error froze the preview.";
  const visibleErrors = report?.errors.slice(0, 4) ?? [];
  const hiddenErrorCount = Math.max(0, (report?.errors.length ?? 0) - visibleErrors.length);

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-background/85 backdrop-blur-sm"
      aria-live="polite"
      role="alert"
    >
      {/* Lovable-style neutral card — bg-secondary-pulse + shadow-surface-xl, no alarm borders */}
      <div className="w-full max-w-lg mx-4 overflow-hidden rounded-[var(--radius-6)] bg-[var(--bg-secondary-pulse)] shadow-surface-xl">
        <div className="flex items-start gap-3 px-5 py-4">
          {isHealing ? (
            <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--fg-tertiary)]" />
          ) : (
            <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden />
          )}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-medium text-[var(--fg-primary)]">
              {title}
              {!isHealing && report?.errors.length ? (
                <span className="rounded-full bg-[var(--bg-muted)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--fg-tertiary)] tabular-nums">
                  {report.errors.length} issue{report.errors.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </h3>
            <p className="mt-0.5 text-xs text-[var(--fg-tertiary)]">{subtitle}</p>
          </div>
        </div>

        {(visibleErrors.length > 0 || importDiagnosis) && (
          <div className="max-h-64 space-y-3 overflow-y-auto px-5 py-3">
            {visibleErrors.length > 0 && (
              <div className="space-y-1.5">
                {/* Lovable dump pre: text-tertiary-pulse max-h-[300px] whitespace-pre-wrap text-base md:text-sm */}
                {visibleErrors.map((error, index) => (
                  <pre
                    key={`${error.kind}-${error.message}-${index}`}
                    className="text-[var(--fg-tertiary)] max-h-[300px] overflow-x-auto overflow-y-auto whitespace-pre-wrap text-sm rounded-[var(--radius-2)] bg-[var(--bg-muted)]/40 px-3 py-2"
                  >
                    {error.message.length > 420 ? `${error.message.slice(0, 420)}...` : error.message}
                  </pre>
                ))}
                {hiddenErrorCount > 0 && (
                  <p className="text-[10px] text-[var(--fg-tertiary)]">
                    +{hiddenErrorCount} more in logs
                  </p>
                )}
              </div>
            )}

            {importDiagnosis && (
              <div>
                <p className="mb-1 text-[10px] font-medium text-[var(--fg-tertiary)]">Likely fix</p>
                <pre className="whitespace-pre-wrap text-[11px] leading-relaxed text-[var(--fg-tertiary)]">
                  {importDiagnosis}
                </pre>
              </div>
            )}
          </div>
        )}

        {/* Lovable-style footer — quiet text pills + primary inverse "Try to fix" */}
        <div className="flex items-center justify-end gap-1 px-5 py-3">
          {onShowLogs && (
            <button
              type="button"
              onClick={onShowLogs}
              className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs text-[var(--fg-primary)] transition-colors hover:bg-[var(--bg-muted)]"
            >
              <Terminal className="h-3.5 w-3.5" />
              {logsVisible ? "Hide error" : "Show error"}
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs text-[var(--fg-primary)] transition-colors hover:bg-[var(--bg-muted)]"
            >
              <Play className="h-3.5 w-3.5" />
              Resume
            </button>
          )}
          {!isHealing && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium bg-[var(--fg-primary)] text-[var(--bg-base)] transition-opacity hover:opacity-90"
            >
              <Wrench className="h-3.5 w-3.5" />
              Try to fix
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
