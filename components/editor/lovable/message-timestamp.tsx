"use client";

import { cn } from "@/lib/utils";

interface LovableMessageTimestampProps {
  createdAt: string | null | undefined;
  role: "user" | "assistant" | "system";
  className?: string;
  onCopyLink?: () => void;
  linkCopied?: boolean;
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

export function formatLovableAbsoluteTime(isoString: string | null | undefined): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString([], {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Lovable-parity message timestamp chip (used in hover action row). */
export function LovableMessageTimestamp({
  createdAt,
  role,
  className,
  onCopyLink,
  linkCopied,
}: LovableMessageTimestampProps) {
  const time = formatLovableMessageTime(createdAt);
  const absolute = formatLovableAbsoluteTime(createdAt);
  if (!time) return null;

  if (onCopyLink) {
    return (
      <button
        type="button"
        onClick={onCopyLink}
        className={cn(
          "text-[10px] px-1 mr-1 tabular-nums rounded transition-colors",
          linkCopied ? "text-green-500" : "text-[var(--fg-quaternary)] hover:text-[var(--fg-primary)] hover:bg-[var(--glow-neutral-hover)]",
          role === "user" ? "text-right" : "text-left",
          className,
        )}
        title={linkCopied ? "Link copied" : absolute ? `${absolute} · Click to copy link` : "Copy link to message"}
      >
        {time}
      </button>
    );
  }

  return (
    <span
      className={cn(
        "text-[10px] text-[var(--fg-quaternary)] px-1 select-none mr-1 tabular-nums",
        role === "user" ? "text-right" : "text-left",
        className,
      )}
      title={absolute || undefined}
    >
      {time}
    </span>
  );
}
