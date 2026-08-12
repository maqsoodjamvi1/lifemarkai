
import { Play,X } from "lucide-react";

interface LovableContinueBannerProps {
  preview: string;
  onContinue: () => void;
  onDismiss: () => void;
}

/** Shown after the user stops generation mid-stream — one-click resume. */
export function LovableContinueBanner({ preview, onContinue, onDismiss }: LovableContinueBannerProps) {
  return (
    <div className="mx-3 mb-2 flex items-center gap-2 rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-xs">
      <span className="flex-1 min-w-0 text-muted-foreground">
        Generation stopped
        {preview ? (
          <span className="text-muted-foreground/70"> · “{preview}”</span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={onContinue}
        className="inline-flex items-center gap-1 shrink-0 rounded-md bg-amber-500/20 px-2 py-1 text-[11px] font-medium text-amber-800 dark:text-amber-200 hover:bg-amber-500/30 transition-colors"
      >
        <Play className="w-3 h-3" />
        Continue
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="p-0.5 rounded text-muted-foreground/50 hover:text-foreground transition-colors"
        title="Dismiss"
      >
        <X className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}
