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
      dir="auto"
      className={cn(
        "prose-chat",
        isUser
          ? // Lovable dump: bg-secondary-pulse shadow-surface-xs rounded-6 rounded-br-1 max-w-[75%] px-4 py-4 text-lg md:text-base leading-[22px]
            "flex max-w-[75%] flex-col gap-1.5 self-end overflow-auto px-4 py-4 rounded-[var(--radius-6)] rounded-br-[var(--radius-1,4px)] bg-[var(--bg-secondary-pulse)] text-[var(--fg-primary)] shadow-surface-xs text-base leading-[22px] whitespace-pre-wrap transition-colors [overflow-wrap:anywhere]"
          : // Lovable dump: flex flex-col gap-3 text-start text-base leading-[22px]
            "flex w-full flex-col gap-3 text-start text-base leading-[22px] text-[var(--fg-primary)] py-0.5 prose-pulse [overflow-wrap:anywhere]",
        className,
      )}
    >
      {children}
    </div>
  );
}
