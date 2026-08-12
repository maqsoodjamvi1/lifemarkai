
import { Pin,X } from "lucide-react";
import { cn } from "@/lib/utils";

interface LovablePinnedMessageBannerProps {
  preview: string;
  onUnpin: () => void;
  onJumpTo?: () => void;
  className?: string;
}

/** Lovable-parity pinned message strip above the chat timeline. */
export function LovablePinnedMessageBanner({
  preview,
  onUnpin,
  onJumpTo,
  className,
}: LovablePinnedMessageBannerProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 mx-3 mb-1 rounded-lg",
        "bg-violet-500/10 border border-violet-500/20 text-xs",
        onJumpTo && "cursor-pointer hover:bg-violet-500/15 transition-colors",
        className,
      )}
      onClick={onJumpTo}
      onKeyDown={onJumpTo ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onJumpTo(); } } : undefined}
      role={onJumpTo ? "button" : undefined}
      tabIndex={onJumpTo ? 0 : undefined}
    >
      <Pin className="w-3 h-3 text-violet-400 shrink-0" />
      <span className="flex-1 text-[var(--fg-secondary)] truncate">{preview}</span>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onUnpin();
        }}
        className="shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]"
        title="Unpin"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
