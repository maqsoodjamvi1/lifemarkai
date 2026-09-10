
import { Loader2 } from "lucide-react";
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
 * Quiet chip over a still-visible preview. A full-pane overlay hid a working
 * iframe behind "Updating preview…" for the entire repair.
 */
export function PreviewHealingOverlay({
  phase,
  onRetry,
  onDismiss,
}: PreviewHealingOverlayProps) {
  if (phase === "idle" || phase === "healthy") return null;

  if (phase === "frozen") {
    return (
      <div
        className="pointer-events-none absolute top-3 left-1/2 z-30 -translate-x-1/2"
        role="status"
      >
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-full border border-border/70 bg-background/95 px-2.5 py-1 text-[10px] text-muted-foreground shadow-sm">
          <span>Preview hit an error</span>
          {onRetry ? (
            <button
              type="button"
              onClick={onRetry}
              className="h-5 shrink-0 rounded-full bg-violet-600 px-2 text-[10px] font-medium text-white hover:bg-violet-500"
            >
              Try to fix
            </button>
          ) : null}
          {onDismiss ? (
            <button
              type="button"
              onClick={onDismiss}
              className="h-5 shrink-0 rounded-full px-1.5 text-[10px] hover:text-foreground"
            >
              Resume
            </button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      className="pointer-events-none absolute top-3 left-1/2 z-30 -translate-x-1/2"
      aria-live="polite"
      role="status"
    >
      <div className="flex items-center gap-1.5 rounded-full border border-border/70 bg-background/95 px-2.5 py-1 text-[10px] text-muted-foreground shadow-sm">
        <Loader2 className="h-3 w-3 animate-spin text-violet-400" />
        <span>Repairing preview…</span>
      </div>
    </div>
  );
}
