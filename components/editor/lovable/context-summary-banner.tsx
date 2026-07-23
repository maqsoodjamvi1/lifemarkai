"use client";

import { Info, X } from "lucide-react";

interface LovableContextSummaryBannerProps {
  coversLabel?: string | number | null;
  /** Lovable dump: notices carry a "Dismiss notice" control. */
  onDismiss?: () => void;
}

/**
 * Lovable-parity notice strip ("Information" icon + "Dismiss notice") —
 * neutral pulse colors instead of the old violet accent band.
 */
export function LovableContextSummaryBanner({ coversLabel, onDismiss }: LovableContextSummaryBannerProps) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-[var(--bg-secondary-pulse)]/60 border-b border-[color:var(--border-translucent)] text-[11px] text-[var(--fg-tertiary)]">
      <Info aria-label="Information" className="w-3 h-3 shrink-0 text-[var(--fg-tertiary)]" />
      <span className="min-w-0 flex-1 truncate">
        <span className="text-[var(--fg-primary)] font-medium">Context summarised</span>
        {" · "}
        {coversLabel ?? "Earlier"} messages compressed to keep AI focused
      </span>
      {onDismiss && (
        <button
          type="button"
          aria-label="Dismiss notice"
          onClick={onDismiss}
          className="shrink-0 inline-flex h-5 w-5 items-center justify-center rounded-full text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] hover:bg-[var(--bg-muted)] transition-colors"
        >
          <X className="w-3 h-3" />
        </button>
      )}
    </div>
  );
}
