"use client";

import { cn } from "@/lib/utils";

interface LovableMessageStatsProps {
  text: string;
  className?: string;
}

/** Compact word/character stats for hover action rows. */
export function LovableMessageStats({ text, className }: LovableMessageStatsProps) {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const words = trimmed.split(/\s+/).filter(Boolean).length;
  const chars = trimmed.length;
  return (
    <span
      className={cn(
        "text-[9px] text-[var(--fg-quaternary)]/80 tabular-nums px-1 select-none",
        className,
      )}
      title={`${words.toLocaleString()} words · ${chars.toLocaleString()} characters`}
    >
      {words}w
    </span>
  );
}
