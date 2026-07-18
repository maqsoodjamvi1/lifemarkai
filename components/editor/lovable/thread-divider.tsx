"use client";

import { ChevronDown, ChevronUp } from "lucide-react";

interface LovableThreadDividerProps {
  turnNumber: number;
  preview: string;
  collapsed: boolean;
  onToggle: () => void;
}

/** Lovable-parity collapsible turn divider between conversation threads. */
export function LovableThreadDivider({ turnNumber, preview, collapsed, onToggle }: LovableThreadDividerProps) {
  return (
    <div className="flex items-center gap-2 my-3">
      <div className="flex-1 h-px bg-border/40" />
      <button
        onClick={onToggle}
        className="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border border-border/50 bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors shrink-0 max-w-[220px]"
      >
        <span className="font-medium text-violet-400/80 shrink-0">Turn {turnNumber}</span>
        {collapsed && preview && <span className="truncate opacity-70 text-[10px]">{preview}</span>}
        {collapsed ? <ChevronDown className="w-3 h-3 shrink-0" /> : <ChevronUp className="w-3 h-3 shrink-0" />}
      </button>
      <div className="flex-1 h-px bg-border/40" />
    </div>
  );
}
