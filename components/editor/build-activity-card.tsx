"use client";

import { Check, Loader2 } from "lucide-react";
import type { BuildActivityStep } from "@/lib/ai/build-activity";

interface BuildActivityCardProps {
  steps: BuildActivityStep[];
  title?: string;
}

export function BuildActivityCard({ steps, title = "Working…" }: BuildActivityCardProps) {
  if (steps.length === 0) return null;

  const doneCount = steps.filter((s) => s.status === "done").length;
  const running = steps.some((s) => s.status === "running");

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden mb-1">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border/40 bg-muted/30">
        {running ? (
          <Loader2 className="w-3.5 h-3.5 animate-spin text-violet-400 shrink-0" />
        ) : (
          <Check className="w-3.5 h-3.5 text-green-400 shrink-0" />
        )}
        <span className="text-xs font-semibold text-foreground">{title}</span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {doneCount}/{steps.length}
        </span>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        {steps.map((step) => (
          <div key={step.id} className="flex items-center gap-2 text-xs">
            {step.status === "done" ? (
              <Check className="w-3 h-3 text-green-400 shrink-0" />
            ) : step.status === "running" ? (
              <Loader2 className="w-3 h-3 animate-spin text-violet-400 shrink-0" />
            ) : (
              <span className="w-3 h-3 rounded-full border border-muted-foreground/40 shrink-0" />
            )}
            <span
              className={
                step.status === "done"
                  ? "text-muted-foreground"
                  : step.status === "running"
                    ? "text-foreground font-medium"
                    : "text-muted-foreground/70"
              }
            >
              {step.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
