"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, MessageSquare } from "lucide-react";
import { cn } from "@/lib/utils";

interface LovableComposerMobileSheetProps {
  /** When true, composer docks as a bottom sheet (narrow viewports). */
  enabled: boolean;
  children: React.ReactNode;
  className?: string;
}

/**
 * Mobile bottom-sheet wrapper for the chat composer (Lovable-style).
 * Collapsed: drag handle + peek. Expanded: full composer with safe-area padding.
 */
export function LovableComposerMobileSheet({
  enabled,
  children,
  className,
}: LovableComposerMobileSheetProps) {
  const [expanded, setExpanded] = useState(true);

  if (!enabled) return <>{children}</>;

  return (
    <div
      data-composer-mobile-sheet
      className={cn(
        "shrink-0 z-20 border-t border-[color:var(--border-translucent)]",
        "bg-[var(--bg-base)]/95 backdrop-blur-md",
        "rounded-t-2xl shadow-[0_-8px_32px_rgba(0,0,0,0.28)]",
        "pb-[max(0.75rem,env(safe-area-inset-bottom))]",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex flex-col items-center pt-2 pb-1 px-3 gap-1"
        aria-expanded={expanded}
        aria-label={expanded ? "Collapse composer" : "Expand composer"}
      >
        <span className="w-9 h-1 rounded-full bg-muted-foreground/35" />
        <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <MessageSquare className="w-3 h-3" />
          {expanded ? "Composer" : "Tap to compose"}
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
        </span>
      </button>
      <div
        className={cn(
          "overflow-hidden transition-[max-height,opacity] duration-200 ease-out",
          expanded ? "max-h-[70vh] opacity-100" : "max-h-0 opacity-0 pointer-events-none",
        )}
      >
        {children}
      </div>
    </div>
  );
}
