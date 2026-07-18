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
      className={cn("flex flex-wrap gap-1.5", className)}
    >
      {chips.map((chip) => (
        <button
          key={chip}
          type="button"
          onClick={() => onSelect(chip)}
          className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-[color:var(--border-default)] bg-[var(--bg-secondary-pulse)] hover:bg-[var(--bg-muted)] hover:border-[color:var(--border-accent)] text-[var(--fg-secondary)] hover:text-[var(--fg-primary)] transition-colors shadow-surface-xs"
        >
          {icon ?? <Sparkles className="w-2.5 h-2.5 text-[var(--fg-accent)] shrink-0" />}
          <span className="truncate max-w-[220px]">{chip}</span>
        </button>
      ))}
    </motion.div>
  );
}
