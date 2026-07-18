"use client";

import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LovablePreviewStatusPillProps {
  label: string | null;
  className?: string;
}

/** Lovable-parity subtle preview boot/update indicator (top of preview pane). */
export function LovablePreviewStatusPill({ label, className }: LovablePreviewStatusPillProps) {
  if (!label) return null;
  return (
    <div
      className={cn(
        "absolute top-3 left-1/2 z-30 -translate-x-1/2 flex items-center gap-1.5",
        "px-2.5 py-1 rounded-full text-[10px] font-medium",
        "bg-[var(--bg-translucent)] backdrop-blur-md border border-[color:var(--border-translucent)]",
        "text-[var(--fg-secondary)] shadow-surface-xs pointer-events-none",
        className,
      )}
    >
      <Loader2 className="size-3 animate-spin text-[var(--fg-accent)]" />
      <span>{label}</span>
    </div>
  );
}
