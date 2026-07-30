
import { FilePenLine, X } from "lucide-react";

interface LovableDraftRestoreBannerProps {
  preview: string;
  onKeep: () => void;
  onDiscard: () => void;
}

/** Shown once when a persisted composer draft is restored after reload. */
export function LovableDraftRestoreBanner({
  preview,
  onKeep,
  onDiscard,
}: LovableDraftRestoreBannerProps) {
  return (
    <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-sky-500/25 bg-sky-500/10 px-3 py-2 text-xs">
      <FilePenLine className="w-3.5 h-3.5 text-sky-400 shrink-0" />
      <span className="flex-1 min-w-0 text-muted-foreground truncate" title={preview}>
        Draft restored · “{preview}”
      </span>
      <button
        type="button"
        onClick={onKeep}
        className="shrink-0 rounded-md px-2 py-1 text-[11px] font-medium text-sky-800 dark:text-sky-200 hover:bg-sky-500/20 transition-colors"
      >
        Keep
      </button>
      <button
        type="button"
        onClick={onDiscard}
        className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground transition-colors"
        title="Discard draft"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
