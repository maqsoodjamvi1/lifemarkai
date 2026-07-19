"use client";

import { cn } from "@/lib/utils";

interface LovableChatPanelShellProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  compactDensity?: boolean;
}

/**
 * Lovable-parity chat column shell — `data-chat-panel` wrapper with pulse tokens.
 */
export function LovableChatPanelShell({
  children,
  className,
  style,
  compactDensity,
}: LovableChatPanelShellProps) {
  return (
    <div
      data-chat-panel
      data-lovable-editor-chat
      data-chat-density={compactDensity ? "compact" : "comfortable"}
      style={style}
      className={cn(
        "flex flex-col h-full min-h-0 bg-[var(--bg-base)] text-[var(--fg-primary)]",
        compactDensity && [
          "[&_[data-chat-timeline]]:py-2",
          "[&_[data-chat-timeline]_.space-y-5]:space-y-3",
          "[&_[data-message-id]]:text-[13px]",
          "[&_[data-message-role=user]]:py-2 [&_[data-message-role=user]]:px-3",
        ],
        className,
      )}
    >
      {children}
    </div>
  );
}
