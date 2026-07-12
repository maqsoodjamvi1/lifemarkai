"use client";

import { AlertTriangle, Loader2, Play, Terminal, Wrench } from "lucide-react";
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
      <div className="w-full max-w-lg mx-4 overflow-hidden rounded-2xl border border-amber-500/30 bg-background shadow-2xl">
        <div className="flex items-start gap-3 border-b border-border/60 px-5 py-4">
          {isHealing ? (
            <Loader2 className="mt-0.5 h-5 w-5 shrink-0 animate-spin text-violet-400" />
          ) : (
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          )}
          <div>
            <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
              {title}
              {!isHealing && report?.errors.length ? (
                <span className="rounded-full border border-amber-500/25 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-300">
                  {report.errors.length} issue{report.errors.length === 1 ? "" : "s"}
                </span>
              ) : null}
            </h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p>
          </div>
        </div>

        {(visibleErrors.length > 0 || importDiagnosis) && (
          <div className="max-h-64 space-y-3 overflow-y-auto px-5 py-3">
            {visibleErrors.length > 0 && (
              <div className="space-y-1.5">
                {visibleErrors.map((error, index) => (
                  <div
                    key={`${error.kind}-${error.message}-${index}`}
                    className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wide text-amber-300/80">
                      <span>{index + 1}</span>
                      <span>{error.kind}</span>
                    </div>
                    <p className="mt-1 whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-muted-foreground">
                      {error.message.length > 420 ? `${error.message.slice(0, 420)}...` : error.message}
                    </p>
                  </div>
                ))}
                {hiddenErrorCount > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    +{hiddenErrorCount} more in logs
                  </p>
                )}
              </div>
            )}

            {importDiagnosis && (
              <div>
                <p className="mb-1 text-[10px] font-semibold text-amber-400/90">Likely fix</p>
                <pre className="whitespace-pre-wrap font-mono text-[10px] leading-relaxed text-muted-foreground">
                  {importDiagnosis}
                </pre>
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-border/60 bg-muted/20 px-5 py-3">
          {!isHealing && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-violet-600 px-3 text-xs font-medium text-white transition hover:bg-violet-500"
            >
              <Wrench className="h-3.5 w-3.5" />
              Try to fix
            </button>
          )}
          {onShowLogs && (
            <button
              type="button"
              onClick={onShowLogs}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs text-muted-foreground transition hover:bg-muted hover:text-foreground"
            >
              <Terminal className="h-3.5 w-3.5" />
              {logsVisible ? "Hide logs" : "Show logs"}
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs text-muted-foreground transition hover:text-foreground"
            >
              <Play className="h-3.5 w-3.5" />
              Resume
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
