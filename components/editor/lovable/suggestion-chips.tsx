"use client";

import { Sparkles } from "lucide-react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";

interface LovableSuggestionChipsProps {
  chips: string[];
  onSelect: (chip: string) => void;
  className?: string;
  /** Optional leading icon per chip (default Sparkles) */
  icon?: React.ReactNode;
}

/**
 * Lovable-parity follow-up suggestion chips above the composer or under messages.
 */
export function LovableSuggestionChips({
  chips,
  onSelect,
  className,
  icon,
}: LovableSuggestionChipsProps) {
  if (chips.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className={cn("relative", className)}
    >
      <div
        data-horizontal-scroll
        className="flex gap-1.5 overflow-x-auto pr-6"
        style={{ scrollbarWidth: "none" }}
      >
        {chips.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onSelect(chip)}
            // Lovable dump pill: gap-0.5 px-[9px] py-1 text-sm rounded-full, bg-translucent, fg-primary
            className="flex shrink-0 items-center gap-0.5 text-sm px-[9px] py-1 rounded-full bg-[var(--bg-translucent,var(--bg-muted))] text-[var(--fg-primary)] hover:opacity-80 [@media(hover:none)]:active:opacity-80 transition-opacity whitespace-nowrap select-none"
          >
            {icon ?? <Sparkles className="w-3 h-3 text-[var(--fg-accent)] shrink-0 mr-0.5" />}
            <span className="truncate max-w-[220px]">{chip}</span>
          </button>
        ))}
      </div>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-[var(--bg-base)] to-transparent"
      />
    </motion.div>
  );
}
