
import { AlertTriangle, Wand2, X } from "lucide-react";
import type { PreviewRuntimeError } from "@/lib/preview/preview-error-bridge";

interface LovableComposerRuntimeErrorsBannerProps {
  errors: PreviewRuntimeError[];
  visible: boolean;
  onFixWithAI: () => void;
  onDismiss?: () => void;
}

/** Compact preview runtime error summary above the composer (Lovable parity). */
export function LovableComposerRuntimeErrorsBanner({
  errors,
  visible,
  onFixWithAI,
  onDismiss,
}: LovableComposerRuntimeErrorsBannerProps) {
  if (!visible || errors.length === 0) return null;

  const top = errors[0];
  const summary =
    top.message.length > 120 ? `${top.message.slice(0, 117)}…` : top.message;

  return (
    <div className="mx-3 mb-2 px-3 py-2.5 rounded-[var(--radius-3)] bg-amber-500/10 border border-amber-500/25 flex items-start gap-2.5 text-xs">
      <AlertTriangle className="w-4 h-4 shrink-0 text-amber-400 mt-0.5" />
      <div className="flex-1 min-w-0">
        <p className="font-medium text-amber-800 dark:text-amber-200">
          {errors.length === 1 ? "Preview error" : `${errors.length} preview errors`}
        </p>
        <p className="text-amber-800/70 dark:text-amber-200/70 mt-0.5 font-mono text-[10px] truncate" title={top.message}>
          {summary}
        </p>
      </div>
      <button
        type="button"
        onClick={onFixWithAI}
        className="shrink-0 flex items-center gap-1 rounded-lg border border-amber-500/40 bg-amber-500/15 hover:bg-amber-500/25 text-amber-900 dark:text-amber-100 text-[11px] font-medium px-2.5 py-1 transition-colors"
      >
        <Wand2 className="w-3 h-3" />
        Fix with AI
      </button>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          className="shrink-0 p-1 rounded hover:bg-amber-500/15 text-amber-700/60 dark:text-amber-300/60 hover:text-amber-200 transition-colors"
          aria-label="Dismiss"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}
