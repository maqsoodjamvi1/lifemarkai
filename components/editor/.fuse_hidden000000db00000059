"use client";

import { Loader2, Check, Search, ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";
import type { SubagentStep } from "@/lib/ai/subagents";

interface SubagentActivityCardProps {
  steps: SubagentStep[];
  collapsed?: boolean;
}

export function SubagentActivityCard({ steps, collapsed: defaultCollapsed = false }: SubagentActivityCardProps) {
  const [open, setOpen] = useState(!defaultCollapsed);
  if (steps.length === 0) return null;

  const doneCount = steps.filter((s) => s.status === "done").length;
  const running = steps.some((s) => s.status === "running");

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden mb-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-muted/30 text-left"
      >
        {running ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400 shrink-0" />
        ) : (
          <Search className="w-3.5 h-3.5 text-violet-400 shrink-0" />
        )}
        <span className="text-xs font-semibold text-foreground">
          {running ? "Investigating…" : "Investigation complete"}
        </span>
        <span className="ml-auto text-[10px] text-muted-foreground mr-1">
          {doneCount}/{steps.length}
        </span>
        {open ? <ChevronUp className="w-3 h-3 text-muted-foreground" /> : <ChevronDown className="w-3 h-3 text-muted-foreground" />}
      </button>
      {open && (
        <div className="px-3 py-2 space-y-2">
          {steps.map((step) => (
            <div key={step.id} className="text-xs">
              <div className="flex items-center gap-2">
                {step.status === "done" ? (
                  <Check className="w-3 h-3 text-green-400 shrink-0" />
                ) : (
                  <Loader2 className="w-3 h-3 animate-spin text-violet-400 shrink-0" />
                )}
                <span className={step.status === "done" ? "text-muted-foreground" : "text-foreground font-medium"}>
                  {step.title}
                </span>
                {step.type === "explore" && (
                  <span className="text-[9px] px-1 py-0.5 rounded bg-violet-500/15 text-violet-300 border border-violet-500/25">
                    Explore
                  </span>
                )}
              </div>
              {step.finding && (
                <p className="mt-0.5 ml-5 text-[10px] text-muted-foreground leading-snug">{step.finding}</p>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
