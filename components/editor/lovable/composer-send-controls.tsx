"use client";

import { ListChecks, Square } from "lucide-react";

interface LovableComposerSendControlsProps {
  streaming: boolean;
  canSend: boolean;
  canQueue: boolean;
  queueDisabledReason?: string;
  onSend: () => void;
  onStop: () => void;
}

/** Lovable-parity send / queue / stop controls in the composer footer. */
export function LovableComposerSendControls({
  streaming,
  canSend,
  canQueue,
  queueDisabledReason,
  onSend,
  onStop,
}: LovableComposerSendControlsProps) {
  if (streaming) {
    return (
      <>
        {canQueue && (
          <button
            type="button"
            onClick={onSend}
            disabled={!canQueue}
            className={`flex items-center justify-center w-7 h-7 rounded-lg border transition-all flex-shrink-0 ${
              canQueue
                ? "border-violet-500/50 bg-violet-500/15 text-violet-300 hover:bg-violet-500/25"
                : "border-[color:var(--border-default)] bg-[var(--bg-muted)]/40 text-[var(--fg-tertiary)]/40 cursor-not-allowed"
            }`}
            title={queueDisabledReason ?? "Add follow-up to queue"}
          >
            <ListChecks className="w-3.5 h-3.5" />
          </button>
        )}
        <button
          type="button"
          onClick={onStop}
          className="flex items-center justify-center w-7 h-7 rounded-lg bg-[var(--fg-primary)] text-[var(--bg-base)] hover:opacity-90 transition-all flex-shrink-0"
          title="Stop generation"
        >
          <Square className="w-3 h-3 fill-current" />
        </button>
      </>
    );
  }

  return (
    <button
      type="button"
      onClick={onSend}
      disabled={!canSend}
      className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all flex-shrink-0 ${
        canSend
          ? "bg-[var(--fg-primary)] text-[var(--bg-base)] hover:opacity-90"
          : "bg-[var(--bg-muted)]/50 text-[var(--fg-tertiary)]/40 cursor-not-allowed"
      }`}
      title="Send (Enter)"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z" />
      </svg>
    </button>
  );
}
