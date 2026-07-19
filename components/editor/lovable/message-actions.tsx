"use client";

import {
  Copy, Check, Pencil, Pin, PinOff, ThumbsUp, ThumbsDown, BookMarked, Link2, Download, Reply, Trash2,
  Volume2, Square,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { LovableMessageTimestamp } from "./message-timestamp";
import { LovableMessageStats } from "./message-stats";

interface LovableMessageActionsProps {
  role: "user" | "assistant";
  align?: "start" | "end";
  /** ISO timestamp — rendered first in the hover row (legacy formatMsgTime parity). */
  createdAt?: string | null;
  /** Message body used for word/char stats. */
  statsText?: string | null;
  copied?: boolean;
  linkCopied?: boolean;
  bookmarked?: boolean;
  pinned?: boolean;
  rating?: 1 | -1 | null;
  canEdit?: boolean;
  speaking?: boolean;
  onCopy?: () => void;
  onCopyLink?: () => void;
  onToggleBookmark?: () => void;
  onExport?: () => void;
  onUseInComposer?: () => void;
  onDelete?: () => void;
  onEdit?: () => void;
  onReadAloud?: () => void;
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
  statsText,
  copied,
  linkCopied,
  bookmarked,
  pinned,
  rating,
  canEdit,
  speaking,
  onCopy,
  onCopyLink,
  onToggleBookmark,
  onExport,
  onUseInComposer,
  onDelete,
  onEdit,
  onReadAloud,
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
      {createdAt && (
        <LovableMessageTimestamp
          createdAt={createdAt}
          role={role}
          onCopyLink={onCopyLink}
          linkCopied={linkCopied}
        />
      )}
      {statsText != null && <LovableMessageStats text={statsText} />}
      {children}
      {role === "user" && canEdit && onEdit && (
        <button type="button" onClick={onEdit} className={btn} title="Edit & branch from here">
          <Pencil className="w-3 h-3 text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]" />
        </button>
      )}
      {onUseInComposer && (
        <button type="button" onClick={onUseInComposer} className={btn} title="Use in composer">
          <Reply className="w-3.5 h-3.5 text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]" />
        </button>
      )}
      {role === "assistant" && onReadAloud && (
        <button
          type="button"
          onClick={onReadAloud}
          className={btn}
          title={speaking ? "Stop reading" : "Read aloud"}
        >
          {speaking
            ? <Square className="w-3 h-3 text-violet-400 fill-violet-400" />
            : <Volume2 className="w-3.5 h-3.5 text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]" />}
        </button>
      )}
      {onCopy && (
        <button type="button" onClick={onCopy} className={btn} title="Copy as Markdown">
          {copied
            ? <Check className="w-3.5 h-3.5 text-green-500" />
            : <Copy className="w-3.5 h-3.5 text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]" />}
        </button>
      )}
      {onToggleBookmark && (
        <button
          type="button"
          onClick={onToggleBookmark}
          className={btn}
          title={bookmarked ? "Remove bookmark" : "Bookmark message"}
        >
          <BookMarked
            className={cn(
              "w-3.5 h-3.5 transition-colors",
              bookmarked ? "text-amber-400 fill-amber-400" : "text-[var(--fg-tertiary)] hover:text-amber-400",
            )}
          />
        </button>
      )}
      {onExport && (
        <button type="button" onClick={onExport} className={btn} title="Export as Markdown">
          <Download className="w-3.5 h-3.5 text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]" />
        </button>
      )}
      {onCopyLink && (
        <button type="button" onClick={onCopyLink} className={btn} title="Copy link to message">
          {linkCopied
            ? <Check className="w-3.5 h-3.5 text-green-500" />
            : <Link2 className="w-3.5 h-3.5 text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]" />}
        </button>
      )}
      {onDelete && (
        <button type="button" onClick={onDelete} className={btn} title="Delete message">
          <Trash2 className="w-3.5 h-3.5 text-[var(--fg-tertiary)] hover:text-red-400" />
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
