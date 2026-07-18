"use client";

import { cn } from "@/lib/utils";

interface LovableChatPanelShellProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Lovable-parity chat column shell — `data-chat-panel` wrapper with pulse tokens.
 */
export function LovableChatPanelShell({ children, className, style }: LovableChatPanelShellProps) {
  return (
    <div
      data-chat-panel
      data-lovable-editor-chat
      style={style}
      className={cn(
        "flex flex-col h-full min-h-0 bg-[var(--bg-base)] text-[var(--fg-primary)]",
        className,
      )}
    >
      {children}
    </div>
  );
}
