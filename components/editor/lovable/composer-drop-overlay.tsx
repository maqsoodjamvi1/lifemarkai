"use client";

import { cn } from "@/lib/utils";

interface LovableComposerDropOverlayProps {
  /** When false, overlay stays mounted at opacity-0 (Lovable dump pattern). */
  active?: boolean;
}

/** Lovable-parity drag-and-drop overlay — always mounted, opacity toggled. */
export function LovableComposerDropOverlay({ active = false }: LovableComposerDropOverlayProps) {
  return (
    <div
      role="presentation"
      aria-hidden={!active}
      className={cn(
        "pointer-events-none absolute inset-0 z-20 flex flex-col items-center justify-center gap-1",
        "rounded-[var(--radius-6)] border-2 border-dashed border-[color:var(--border-accent)]",
        "bg-[var(--bg-secondary-pulse)]/90 backdrop-blur-[1px] transition-opacity duration-150",
        active ? "opacity-100" : "opacity-0",
      )}
    >
      <span className="text-sm font-semibold text-[var(--fg-primary)]">Add files</span>
      <span className="text-xs text-[var(--fg-tertiary)] px-4 text-center">
        Drop any files here to add them to your message
      </span>
    </div>
  );
}
