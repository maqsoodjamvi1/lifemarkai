"use client";

import { cn } from "@/lib/utils";

interface LovableMessageBubbleProps {
  role: "user" | "assistant" | "system";
  children: React.ReactNode;
  className?: string;
}

/**
 * Lovable-parity message bubble shell — user pill vs assistant prose column.
 */
export function LovableMessageBubble({ role, children, className }: LovableMessageBubbleProps) {
  const isUser = role === "user";
  return (
    <div
      data-message-role={role}
      className={cn(
        "text-sm leading-relaxed prose-chat",
        isUser
          ? "px-3.5 py-2.5 rounded-[var(--radius-6)] rounded-br-[var(--radius-2)] bg-[var(--bg-secondary-pulse)] text-[var(--fg-primary)] shadow-surface-xs border border-[color:var(--border-default)]"
          : "text-[var(--fg-primary)] py-0.5 prose-pulse",
        className,
      )}
    >
      {children}
    </div>
  );
}
