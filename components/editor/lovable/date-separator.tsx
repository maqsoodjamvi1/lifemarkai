"use client";

import { cn } from "@/lib/utils";

/** Lovable-style date divider label between messages on different days. */
export function formatLovableDateSeparator(isoString: string | null | undefined): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today at ${time}`;
  if (isYesterday) return `Yesterday at ${time}`;
  const datePart = d.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${datePart} at ${time}`;
}

export function sameLovableCalendarDay(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return true;
  return new Date(a).toDateString() === new Date(b).toDateString();
}

interface LovableDateSeparatorProps {
  label: string;
  className?: string;
}

export function LovableDateSeparator({ label, className }: LovableDateSeparatorProps) {
  if (!label) return null;
  return (
    <div className={cn("flex items-center gap-2 my-2", className)}>
      <div className="flex-1 h-px bg-[color:var(--border-default)]/40" />
      <span className="text-[10px] text-[var(--fg-tertiary)] px-2 py-0.5 rounded-full border border-[color:var(--border-default)]/50 bg-[var(--bg-secondary-pulse)] shrink-0">
        {label}
      </span>
      <div className="flex-1 h-px bg-[color:var(--border-default)]/40" />
    </div>
  );
}
