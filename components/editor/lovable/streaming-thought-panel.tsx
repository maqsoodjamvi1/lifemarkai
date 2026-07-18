"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";

interface LovableStreamingThoughtPanelProps {
  thoughtSeconds: number;
  /** Optional streamed reasoning prose (when model exposes it). */
  reasoningText?: string | null;
  defaultExpanded?: boolean;
  className?: string;
}

/** Expandable "Thought for Ns" panel during streaming (Lovable extended-thinking parity). */
export function LovableStreamingThoughtPanel({
  thoughtSeconds,
  reasoningText,
  defaultExpanded = false,
  className,
}: LovableStreamingThoughtPanelProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  if (thoughtSeconds <= 0 && !reasoningText?.trim()) return null;

  const hasBody = !!reasoningText?.trim();

  return (
    <div className={cn("px-1", className)}>
      <button
        type="button"
        onClick={() => hasBody && setExpanded((v) => !v)}
        className={cn(
          "flex items-center gap-1.5 text-xs text-[var(--fg-tertiary)] transition-colors",
          hasBody && "hover:text-[var(--fg-secondary)] cursor-pointer",
          !hasBody && "cursor-default",
        )}
      >
        <Sparkles className="w-3 h-3 text-violet-400/80 shrink-0" />
        <span>Thought for {thoughtSeconds}s</span>
        {hasBody && (expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />)}
      </button>
      {hasBody && expanded && (
        <div className="mt-1.5 ml-4 pl-3 border-l border-violet-500/20 text-[11px] text-[var(--fg-tertiary)] leading-relaxed whitespace-pre-wrap max-h-32 overflow-y-auto">
          {reasoningText}
        </div>
      )}
    </div>
  );
}
