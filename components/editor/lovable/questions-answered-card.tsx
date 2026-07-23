"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ClarifyQuestion } from "./clarify-session-card";

interface LovableQuestionsAnsweredCardProps {
  questions: ClarifyQuestion[];
  className?: string;
}

/**
 * Lovable dump: collapsed “Questions answered” card (`data-card-focusable`,
 * max-w-sm, shadow-surface-md, grid-rows collapse).
 */
export function LovableQuestionsAnsweredCard({
  questions,
  className,
}: LovableQuestionsAnsweredCardProps) {
  const [open, setOpen] = useState(false);
  const answered = questions.filter((q) => q.answer.trim());
  if (answered.length === 0) return null;

  return (
    <div
      className={cn(
        "mx-auto mb-2 w-full max-w-sm rounded-[var(--radius-4)]",
        "bg-[var(--bg-secondary-pulse)] shadow-surface-md",
        "has-[[data-card-focusable]:focus-visible]:outline has-[[data-card-focusable]:focus-visible]:outline-2",
        "has-[[data-card-focusable]:focus-visible]:outline-[color:var(--border-accent)]",
        className,
      )}
    >
      <button
        type="button"
        role="button"
        tabIndex={0}
        data-card-focusable
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left outline-none"
      >
        <span className="text-sm font-medium text-[var(--fg-primary)]">Questions answered</span>
        <ChevronDown
          className={cn(
            "ml-auto size-4 text-[var(--fg-tertiary)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>
      <div
        className={cn(
          "grid transition-[grid-template-rows] duration-200 ease-out",
          open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
        )}
      >
        <div className="overflow-hidden">
          <ul className="space-y-2 border-t border-[color:var(--border-translucent)] px-3 py-2.5">
            {answered.map((q) => (
              <li key={q.id} className="text-xs">
                <p className="font-medium text-[var(--fg-secondary)]">{q.question}</p>
                <p className="mt-0.5 text-[var(--fg-tertiary)]">{q.answer}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
