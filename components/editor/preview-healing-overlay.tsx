"use client";

import { Loader2, AlertTriangle, Wrench } from "lucide-react";
import type { PreviewErrorReport } from "@/lib/preview/preview-error-bridge";
import type { PreviewGuardPhase } from "@/hooks/use-preview-error-guard";

interface PreviewHealingOverlayProps {
  phase: PreviewGuardPhase;
  report: PreviewErrorReport | null;
  onRetry?: () => void;
  onDismiss?: () => void;
}

/**
 * Freezes the preview visually when bundler/runtime errors are detected.
 * Shows a Lovable-style "Self-repairing…" state while the healing loop runs.
 */
export function PreviewHealingOverlay({
  phase,
  report,
  onRetry,
  onDismiss,
}: PreviewHealingOverlayProps) {
  if (phase === "idle" || phase === "healthy") return null;

  const isHealing = phase === "healing";
  const title = isHealing ? "Self-repairing…" : "Preview paused";
  const subtitle = isHealing
    ? "AI is applying fixes to resolve build errors"
    : "A syntax or runtime error froze the preview";

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-background/85 backdrop-blur-sm"
      aria-live="polite"
      role="alert"
    >
      <div className="max-w-md w-full mx-4 rounded-2xl border border-amber-500/30 bg-background shadow-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-border/60 flex items-start gap-3">
          {isHealing ? (
            <Loader2 className="w-5 h-5 text-violet-400 animate-spin shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
          )}
          <div>
            <h3 className="text-sm font-semibold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
          </div>
        </div>

        {report && report.errors.length > 0 && (
          <div className="px-5 py-3 max-h-40 overflow-y-auto">
            <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap leading-relaxed">
              {report.formatted}
            </pre>
          </div>
        )}

        <div className="px-5 py-3 border-t border-border/60 flex items-center justify-end gap-2 bg-muted/20">
          {!isHealing && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium bg-violet-600 text-white hover:bg-violet-500 transition"
            >
              <Wrench className="w-3.5 h-3.5" />
              Self-repair
            </button>
          )}
          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              className="h-8 px-3 rounded-lg text-xs text-muted-foreground hover:text-foreground transition"
            >
              Dismiss
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
