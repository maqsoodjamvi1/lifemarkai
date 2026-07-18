"use client";

import { Pin, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface LovablePinnedMessageBannerProps {
  preview: string;
  onUnpin: () => void;
  className?: string;
}

/** Lovable-parity pinned message strip above the chat timeline. */
export function LovablePinnedMessageBanner({ preview, onUnpin, className }: LovablePinnedMessageBannerProps) {
  return (
    <div
      className={cn(
        "flex items-center gap-2 px-3 py-2 mx-3 mb-1 rounded-lg",
        "bg-violet-500/10 border border-violet-500/20 text-xs",
        className,
      )}
    >
      <Pin className="w-3 h-3 text-violet-400 shrink-0" />
      <span className="flex-1 text-[var(--fg-secondary)] truncate">{preview}</span>
      <button
        type="button"
        onClick={onUnpin}
        className="shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]"
        title="Unpin"
      >
        <X className="w-3 h-3" />
      </button>
    </div>
  );
}
