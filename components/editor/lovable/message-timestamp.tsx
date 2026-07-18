"use client";

import { cn } from "@/lib/utils";

interface LovableMessageTimestampProps {
  createdAt: string | null | undefined;
  role: "user" | "assistant" | "system";
  className?: string;
}

/**
 * Lovable-parity relative message time — must match legacy `formatMsgTime` exactly.
 * Examples: "just now", "5m ago · 3:42 PM", "Yesterday · 3:42 PM", "Jul 6 · 3:42 PM"
 */
export function formatLovableMessageTime(isoString: string | null | undefined): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (diffSec < 60) return "just now";
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago · ${time}`;
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  if (isToday) {
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago · ${time}`;
    return time;
  }
  if (isYesterday) return `Yesterday · ${time}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " · " + time;
}

/** Lovable-parity message timestamp chip (used in hover action row). */
export function LovableMessageTimestamp({ createdAt, role, className }: LovableMessageTimestampProps) {
  const time = formatLovableMessageTime(createdAt);
  if (!time) return null;
  return (
    <span
      className={cn(
        "text-[10px] text-[var(--fg-quaternary)] px-1 select-none mr-1 tabular-nums",
        role === "user" ? "text-right" : "text-left",
        className,
      )}
    >
      {time}
    </span>
  );
}
