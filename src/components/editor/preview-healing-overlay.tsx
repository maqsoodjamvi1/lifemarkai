
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
 * Keep the pane on a waiting state while auto-heal runs. Do not dump
 * diagnostics or "preview paused" copy — those read as product errors.
 */
export function PreviewHealingOverlay({
  phase,
}: PreviewHealingOverlayProps) {
  if (phase === "idle" || phase === "healthy") return null;

  return (
    <div
      className="absolute inset-0 z-40 flex items-center justify-center bg-background/80 backdrop-blur-sm"
      aria-live="polite"
      role="status"
    >
      <div className="flex max-w-sm flex-col items-center gap-2 px-6 text-center">
        <Loader2 className="h-5 w-5 animate-spin text-violet-400" />
        <p className="text-sm font-medium text-foreground">Updating preview…</p>
        <p className="text-xs text-muted-foreground">
          Applying a quiet repair. The live preview will come back on its own.
        </p>
      </div>
    </div>
  );
}
