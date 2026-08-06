
import { useState } from "react";
import { Check, CheckCheck, FileText, ListChecks, Pencil, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
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
    <div
      data-card-focusable
      tabIndex={0}
      className="w-full max-w-sm rounded-[var(--radius-4)] border border-border bg-[var(--bg-secondary-pulse)] shadow-surface-md overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--border-accent)]"
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
        <ListChecks className="w-3.5 h-3.5 text-violet-400" />
        <span className="text-xs font-semibold">Step plan</span>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {approved.size}/{steps.length} selected
        </span>
      </div>
      <div className="divide-y divide-border/60">
        {steps.map((step, idx) => {
          const on = approved.has(idx);
          return (
            <button
              key={idx}
              type="button"
              onClick={() => onToggleStep(idx)}
              className="w-full flex items-start gap-2.5 px-3 py-2.5 text-left hover:bg-muted/30 transition-colors"
            >
              <span
                className={`mt-0.5 w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                  on ? "bg-violet-600 border-violet-500" : "border-border"
                }`}
              >
                {on && <Check className="w-3 h-3 text-white" />}
              </span>
              <span className="text-xs leading-relaxed text-foreground/90">{step}</span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/20">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onSelectAll}>
          Select all
        </Button>
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClear}>
          Clear
        </Button>
        <Button
          size="sm"
          className="ml-auto h-7 text-xs gap-1.5 bg-[#1F55F1] hover:bg-[#1142DE] text-white"
          disabled={approved.size === 0}
          onClick={onBuild}
        >
          <Zap className="w-3 h-3" />
          Build selected
        </Button>
      </div>
    </div>
  );
}

interface LovablePlanReadyCardProps {
  content: string;
  onRefine: (editedMarkdown: string) => void;
  onApproveAndBuild: (editedMarkdown: string) => void;
}

export function LovablePlanReadyCard({ content, onRefine, onApproveAndBuild }: LovablePlanReadyCardProps) {
  const initial = content.replace("<!-- PLAN_READY -->", "").trim();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(initial);

  return (
    <div
      data-card-focusable
      tabIndex={0}
      className="w-full max-w-sm rounded-[var(--radius-4)] border border-border bg-[var(--bg-secondary-pulse)] shadow-surface-md overflow-hidden outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--border-accent)]"
    >
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
        <FileText className="w-3.5 h-3.5 text-violet-400" />
        <span className="text-xs font-semibold">Implementation Plan</span>
        <span className="ml-auto text-[10px] text-muted-foreground">Plan mode · no code changed</span>
      </div>
      {editing ? (
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="min-h-[200px] max-h-[420px] rounded-none border-0 text-sm leading-relaxed resize-y focus-visible:ring-0"
          autoFocus
        />
      ) : (
        <div className="px-4 py-3 text-sm leading-relaxed text-foreground">
          <LovableMessageContent content={draft} mode="plan" />
        </div>
      )}
      <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/20">
        {editing ? (
          <>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs"
              onClick={() => {
                setDraft(initial);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 text-xs gap-1.5"
              onClick={() => setEditing(false)}
              disabled={!draft.trim()}
            >
              Done editing
            </Button>
          </>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1.5"
            onClick={() => setEditing(true)}
          >
            <Pencil className="w-3 h-3" />
            Edit
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs gap-1.5"
          onClick={() => onRefine(draft.trim() || initial)}
        >
          Refine
        </Button>
        <Button
          size="sm"
          className="ml-auto h-7 text-xs gap-1.5 bg-[#1F55F1] hover:bg-[#1142DE] text-white"
          onClick={() => onApproveAndBuild(draft.trim() || initial)}
          disabled={!(draft.trim() || initial)}
        >
          <CheckCheck className="w-3 h-3" />
          Approve &amp; Build
        </Button>
      </div>
    </div>
  );
}
