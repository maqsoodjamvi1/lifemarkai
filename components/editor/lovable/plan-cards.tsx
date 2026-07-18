"use client";

import { Check, CheckCheck, FileText, ListChecks, Pencil, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LovableMessageContent } from "./message-content";

export function parseLovableStepPlan(raw: string): string[] {
  const body = raw.replace("<!-- STEP_PLAN -->", "").trim();
  const lines = body.split("\n");
  const steps: string[] = [];
  let current = "";
  for (const line of lines) {
    if (/^\*{0,2}\d+\.\*{0,2}\s/.test(line.trim())) {
      if (current.trim()) steps.push(current.trim());
      current = line.trim().replace(/^\*{0,2}\d+\.\*{0,2}\s+/, "");
    } else {
      current += " " + line.trim();
    }
  }
  if (current.trim()) steps.push(current.trim());
  return steps.filter(Boolean);
}

interface LovableStepPlanCardProps {
  steps: string[];
  approved: Set<number>;
  onToggleStep: (idx: number) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onBuild: () => void;
}

export function LovableStepPlanCard({
  steps,
  approved,
  onToggleStep,
  onSelectAll,
  onClear,
  onBuild,
}: LovableStepPlanCardProps) {
  return (
    <div className="w-full rounded-xl border border-violet-500/30 bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-violet-500/10 border-b border-violet-500/20">
        <ListChecks className="w-3.5 h-3.5 text-violet-400" />
        <span className="text-xs font-semibold">Step-by-Step Plan</span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {approved.size}/{steps.length} steps selected
        </span>
      </div>
      <div className="px-3 py-2 space-y-1.5">
        {steps.map((step, idx) => (
          <button
            key={idx}
            onClick={() => onToggleStep(idx)}
            className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs transition-all border ${
              approved.has(idx)
                ? "border-violet-500/40 bg-violet-500/10 text-foreground"
                : "border-border bg-muted/30 text-muted-foreground line-through"
            }`}
          >
            <span
              className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 text-[10px] font-bold border ${
                approved.has(idx) ? "border-violet-400 bg-violet-400 text-white" : "border-border text-muted-foreground"
              }`}
            >
              {approved.has(idx) ? <Check className="w-2.5 h-2.5" /> : idx + 1}
            </span>
            <span>{step}</span>
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/20">
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={onSelectAll}>
          <CheckCheck className="w-3 h-3" /> Select all
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1 text-muted-foreground" onClick={onClear}>
          Clear
        </Button>
        <Button
          size="sm"
          className="ml-auto h-7 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
          disabled={approved.size === 0}
          onClick={onBuild}
        >
          <Zap className="w-3 h-3" />
          Build {approved.size} step{approved.size !== 1 ? "s" : ""}
        </Button>
      </div>
    </div>
  );
}

interface LovablePlanReadyCardProps {
  content: string;
  onRefine: () => void;
  onApproveAndBuild: () => void;
}

export function LovablePlanReadyCard({ content, onRefine, onApproveAndBuild }: LovablePlanReadyCardProps) {
  const planBody = content.replace("<!-- PLAN_READY -->", "").trim();

  return (
    <div className="w-full rounded-xl border border-border bg-card overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
        <FileText className="w-3.5 h-3.5 text-violet-400" />
        <span className="text-xs font-semibold">Implementation Plan</span>
        <span className="ml-auto text-[10px] text-muted-foreground">Plan mode · no code changed</span>
      </div>
      <div className="px-4 py-3 text-sm leading-relaxed text-foreground">
        <LovableMessageContent content={planBody} mode="plan" />
      </div>
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/20">
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1.5" onClick={onRefine}>
          <Pencil className="w-3 h-3" />
          Refine
        </Button>
        <Button
          size="sm"
          className="ml-auto h-7 text-xs gap-1.5 bg-[#0066FF] hover:bg-[#0052cc] text-white"
          onClick={onApproveAndBuild}
        >
          <CheckCheck className="w-3 h-3" />
          Approve &amp; Build
        </Button>
      </div>
    </div>
  );
}
