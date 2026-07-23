"use client";

import { AnimatePresence } from "framer-motion";
import type { Message } from "@/types/database";
import { LovableDateSeparator, formatLovableDateSeparator, sameLovableCalendarDay } from "./date-separator";
import { LovableThreadDivider } from "./thread-divider";
import { LovableMessageRow, type LovableMessageRowProps } from "./message-row";

export interface LovableThreadItemProps {
  thread: Message[];
  threadIdx: number;
  searchQuery: string;
  collapsed: boolean;
  onToggleCollapse: () => void;
  onCopyThread?: (thread: Message[]) => void | Promise<void>;
  /** Click a date separator to jump among chat days. */
  onDateSeparatorClick?: (messageId: string) => void;
  getMessageProps: (msg: Message, msgIdx: number, thread: Message[]) => Omit<LovableMessageRowProps, "msg">;
}

/** Lovable-parity conversation turn — optional divider + message rows with date separators. */
export function LovableThreadItem({
  thread,
  threadIdx,
  searchQuery,
  collapsed,
  onToggleCollapse,
  onCopyThread,
  onDateSeparatorClick,
  getMessageProps,
}: LovableThreadItemProps) {
  const userMsg = thread.find((m) => m.role === "user");
  const preview = userMsg
    ? userMsg.content.replace(/\s+/g, " ").slice(0, 65) + (userMsg.content.length > 65 ? "…" : "")
    : "";
  const threadMatchCount = searchQuery.trim() ? thread.length : 0;

  // Dump chat is message cards, not a turn-label list. Only show the turn
  // chrome when a turn is manually collapsed (or during search hit counts).
  const showTurnChrome =
    threadIdx > 0 && (collapsed || (searchQuery.trim().length > 0 && threadMatchCount > 0));

  return (
    <div data-thread-item data-thread-index={threadIdx}>
      {showTurnChrome && (
        <LovableThreadDivider
          turnNumber={threadIdx + 1}
          preview={preview}
          collapsed={searchQuery ? false : collapsed}
          onToggle={onToggleCollapse}
          searchMatchCount={threadMatchCount}
          onCopyThread={onCopyThread ? () => onCopyThread(thread) : undefined}
        />
      )}
      <AnimatePresence initial={false}>
        {thread.map((msg, msgIdx) => {
          const prevMsg = msgIdx > 0 ? thread[msgIdx - 1] : null;
          const showDateSep = !sameLovableCalendarDay(msg.created_at, prevMsg?.created_at);
          return (
            <div key={msg.id}>
              {showDateSep && (
                <LovableDateSeparator
                  label={formatLovableDateSeparator(msg.created_at)}
                  title="Jump to next day · or copy date"
                  onClick={
                    onDateSeparatorClick
                      ? () => onDateSeparatorClick(msg.id)
                      : undefined
                  }
                />
              )}
              <LovableMessageRow msg={msg} {...getMessageProps(msg, msgIdx, thread)} />
            </div>
          );
        })}
      </AnimatePresence>
    </div>
  );
}
