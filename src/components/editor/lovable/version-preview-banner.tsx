
import { History } from "lucide-react";
import { cn } from "@/lib/utils";

interface LovableVersionPreviewBannerProps {
  label: string;
  onExit: () => void;
  className?: string;
}

/** Lovable-parity "Previewing older version" banner above the preview iframe. */
export function LovableVersionPreviewBanner({ label, onExit, className }: LovableVersionPreviewBannerProps) {
  return (
    <div
      data-version-preview-banner
      className={cn(
        "flex items-center gap-2 px-3 h-8 shrink-0",
        "bg-amber-500/10 border-b border-amber-500/30 text-amber-500",
        className,
      )}
    >
      <History className="w-3.5 h-3.5 shrink-0" />
      <span className="text-[11px] font-medium truncate flex-1" title={label}>
        Previewing last saved version: {label}
      </span>
      <button
        type="button"
        onClick={onExit}
        className="text-[11px] font-semibold px-2 py-0.5 rounded border border-amber-500/40 hover:bg-amber-500/20 transition-colors shrink-0"
      >
        Back to latest
      </button>
    </div>
  );
}
