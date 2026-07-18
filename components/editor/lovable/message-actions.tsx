"use client";

import {
  Copy, Check, Pencil, Pin, PinOff, ThumbsUp, ThumbsDown, BookMarked,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LovableMessageTimestamp } from "./message-timestamp";

interface LovableMessageActionsProps {
  role: "user" | "assistant";
  align?: "start" | "end";
  /** ISO timestamp — rendered first in the hover row (legacy formatMsgTime parity). */
  createdAt?: string | null;
  copied?: boolean;
  pinned?: boolean;
  rating?: 1 | -1 | null;
  canEdit?: boolean;
  onCopy?: () => void;
  onEdit?: () => void;
  onTogglePin?: () => void;
  onThumbsUp?: () => void;
  onThumbsDown?: () => void;
  onAddToKnowledge?: () => void;
  children?: React.ReactNode;
  className?: string;
}

/** Lovable-parity hover action row under each message. */
export function LovableMessageActions({
  role,
  align = role === "assistant" ? "start" : "end",
  createdAt,
  copied,
  pinned,
  rating,
  canEdit,
  onCopy,
  onEdit,
  onTogglePin,
  onThumbsUp,
  onThumbsDown,
  onAddToKnowledge,
  children,
  className,
}: LovableMessageActionsProps) {
  const btn = "p-1 rounded hover:bg-[var(--glow-neutral-hover)] transition-colors";

  return (
    <div
      className={cn(
        "flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity flex-wrap",
        align === "start" ? "self-start" : "self-end",
        className,
      )}
    >
      {createdAt && <LovableMessageTimestamp createdAt={createdAt} role={role} />}
      {children}
      {role === "user" && canEdit && onEdit && (
        <button type="button" onClick={onEdit} className={btn} title="Edit & branch from here">
          <Pencil className="w-3 h-3 text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]" />
        </button>
      )}
      {onCopy && (
        <button type="button" onClick={onCopy} className={btn} title="Copy">
          {copied
            ? <Check className="w-3.5 h-3.5 text-green-500" />
            : <Copy className="w-3.5 h-3.5 text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]" />}
        </button>
      )}
      {role === "assistant" && onTogglePin && (
        <button type="button" onClick={onTogglePin} className={btn} title={pinned ? "Unpin message" : "Pin message"}>
          {pinned
            ? <PinOff className="w-3.5 h-3.5 text-violet-400" />
            : <Pin className="w-3.5 h-3.5 text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]" />}
        </button>
      )}
      {role === "assistant" && onThumbsUp && (
        <button type="button" onClick={onThumbsUp} className={btn} title="Good response">
          <ThumbsUp className={cn("w-3.5 h-3.5 transition-colors", rating === 1 ? "text-green-400 fill-green-400" : "text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]")} />
        </button>
      )}
      {role === "assistant" && onAddToKnowledge && (
        <button type="button" onClick={onAddToKnowledge} className={btn} title="Add to knowledge">
          <BookMarked className="w-3.5 h-3.5 text-[var(--fg-tertiary)] hover:text-violet-400" />
        </button>
      )}
      {role === "assistant" && onThumbsDown && (
        <button type="button" onClick={onThumbsDown} className={btn} title="Poor response">
          <ThumbsDown className={cn("w-3.5 h-3.5 transition-colors", rating === -1 ? "text-red-400 fill-red-400" : "text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]")} />
        </button>
      )}
    </div>
  );
}
