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
  getMessageProps: (msg: Message, msgIdx: number, thread: Message[]) => Omit<LovableMessageRowProps, "msg">;
}

/** Lovable-parity conversation turn — optional divider + message rows with date separators. */
export function LovableThreadItem({
  thread,
  threadIdx,
  searchQuery,
  collapsed,
  onToggleCollapse,
  getMessageProps,
}: LovableThreadItemProps) {
  const userMsg = thread.find((m) => m.role === "user");
  const preview = userMsg
    ? userMsg.content.replace(/\s+/g, " ").slice(0, 65) + (userMsg.content.length > 65 ? "…" : "")
    : "";

  return (
    <div>
      {!searchQuery && threadIdx > 0 && (
        <LovableThreadDivider
          turnNumber={threadIdx + 1}
          preview={preview}
          collapsed={collapsed}
          onToggle={onToggleCollapse}
        />
      )}
      <AnimatePresence initial={false}>
        {!collapsed &&
          thread.map((msg, msgIdx) => {
            const prevMsg = msgIdx > 0 ? thread[msgIdx - 1] : null;
            const showDateSep = !sameLovableCalendarDay(msg.created_at, prevMsg?.created_at);
            return (
              <div key={msg.id}>
                {showDateSep && <LovableDateSeparator label={formatLovableDateSeparator(msg.created_at)} />}
                <LovableMessageRow msg={msg} {...getMessageProps(msg, msgIdx, thread)} />
              </div>
            );
          })}
      </AnimatePresence>
    </div>
  );
}
