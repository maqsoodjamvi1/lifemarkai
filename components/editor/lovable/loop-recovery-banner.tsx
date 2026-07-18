"use client";

import { AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface LovableLoopRecoveryBannerProps {
  previewError: string;
  onSwitchToPlan: () => void;
  onRestoreSnapshot: () => void;
  onSuggestWays: () => void;
  onDismiss: () => void;
  className?: string;
}

/** Lovable-parity fix-loop nudge when auto-fix max attempts are reached. */
export function LovableLoopRecoveryBanner({
  previewError,
  onSwitchToPlan,
  onRestoreSnapshot,
  onSuggestWays,
  onDismiss,
  className,
}: LovableLoopRecoveryBannerProps) {
  return (
    <div className={cn("mx-3 mb-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs", className)}>
      <div className="flex items-start gap-2 mb-2">
        <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
        <div className="flex-1">
          <div className="font-semibold text-amber-200 mb-0.5">Looks like we are in a fix loop.</div>
          <div className="text-amber-200/70 leading-snug">
            Switch to Plan mode, share the error, and ask the AI to investigate without breaking other features.
          </div>
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 pl-5">
        <button
          type="button"
          onClick={onSwitchToPlan}
          className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/40 hover:bg-amber-500/30 transition-colors"
        >
          📋 Switch to Plan mode
        </button>
        <button
          type="button"
          onClick={onRestoreSnapshot}
          className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300/80 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
        >
          ⏪ Restore last snapshot
        </button>
        <button
          type="button"
          onClick={onSuggestWays}
          className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300/80 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
        >
          💡 Suggest 3 ways
        </button>
        <button
          type="button"
          onClick={onDismiss}
          className="text-[10px] px-2 py-0.5 rounded-full text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] transition-colors"
        >
          Dismiss
        </button>
      </div>
      {previewError && (
        <p className="mt-2 pl-5 text-[10px] text-amber-200/50 truncate" title={previewError}>
          {previewError.slice(0, 120)}
        </p>
      )}
    </div>
  );
}
