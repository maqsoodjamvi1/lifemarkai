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
      data-chat-panel="true"
      data-lovable-editor-chat
      data-chat-density={compactDensity ? "compact" : "comfortable"}
      style={{
        ["--chat-top-safe-padding" as string]: "12px",
        ["--chat-nudge-overlay-px" as string]: "0px",
        ...style,
      }}
      className={cn(
        // Dump: [data-chat-panel] flex min-h-0 w-full flex-1 flex-col
        "flex min-h-0 w-full flex-1 flex-col h-full bg-[var(--bg-base)] text-[var(--fg-primary)]",
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
