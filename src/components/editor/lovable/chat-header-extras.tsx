
import { ListOrdered,Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LovableChatHeaderQueuePillProps {
  count: number;
  paused?: boolean;
  className?: string;
}

/** Shows queued follow-up count in the chat header while AI is busy. */
export function LovableChatHeaderQueuePill({ count, paused, className }: LovableChatHeaderQueuePillProps) {
  if (count <= 0) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium",
        "border border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300 tabular-nums",
        className,
      )}
      title={paused ? "Queue paused" : "Prompts waiting in queue"}
    >
      <ListOrdered className="w-3 h-3 shrink-0" />
      {count} queued{paused ? " · paused" : ""}
    </span>
  );
}

interface LovableChatHeaderPreviewChipProps {
  statusText: string | null;
  className?: string;
}

/** Mirrors preview boot status in the chat column (Lovable cross-pane parity). */
export function LovableChatHeaderPreviewChip({ statusText, className }: LovableChatHeaderPreviewChipProps) {
  if (!statusText) return null;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px]",
        "border border-[color:var(--border-default)] bg-[var(--bg-muted)]/40 text-[var(--fg-tertiary)] max-w-[140px]",
        className,
      )}
      title={statusText}
    >
      <Loader2 className="w-2.5 h-2.5 animate-spin shrink-0 text-[var(--fg-accent)]" />
      <span className="truncate">{statusText}</span>
    </span>
  );
}
