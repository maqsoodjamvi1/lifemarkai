
import {
Copy,Check,Pencil,Pin,PinOff,ThumbsUp,ThumbsDown,BookMarked,Link2,Download,Reply,Trash2,
Volume2,Square,Undo2,MoreHorizontal,
} from "lucide-react";
import {
DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator,DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  /** Lovable dump landmark — copy payload on the action cluster. */
  copyText?: string | null;
  copied?: boolean;
  linkCopied?: boolean;
  bookmarked?: boolean;
  pinned?: boolean;
  rating?: 1 | -1 | null;
  canEdit?: boolean;
  speaking?: boolean;
  /** Lovable primary: Revert to this version */
  onRevert?: () => void;
  revertDisabled?: boolean;
  /** Lovable dump: Undo latest edit (assistant) */
  onUndoLatest?: () => void;
  undoLatestDisabled?: boolean;
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

/** Lovable-parity hover action row: Revert · Helpful · Not helpful · Copy · More */
export function LovableMessageActions({
  role,
  align = role === "assistant" ? "start" : "end",
  createdAt,
  statsText,
  copyText,
  copied,
  linkCopied,
  bookmarked,
  pinned,
  rating,
  canEdit,
  speaking,
  onRevert,
  revertDisabled,
  onUndoLatest,
  undoLatestDisabled,
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
  const btn = "inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-[var(--glow-neutral-hover)] transition-colors";

  const moreItems = [
    role === "user" && canEdit && onEdit
      ? { key: "edit", label: "Edit message", icon: Pencil, onClick: onEdit }
      : null,
    onUseInComposer
      ? { key: "reply", label: "Use in composer", icon: Reply, onClick: onUseInComposer }
      : null,
    role === "assistant" && onReadAloud
      ? { key: "tts", label: speaking ? "Stop reading" : "Read aloud", icon: speaking ? Square : Volume2, onClick: onReadAloud }
      : null,
    onToggleBookmark
      ? {
          key: "bookmark",
          label: bookmarked ? "Remove bookmark" : "Bookmark in history",
          icon: BookMarked,
          onClick: onToggleBookmark,
        }
      : null,
    onExport
      ? { key: "export", label: "Export as Markdown", icon: Download, onClick: onExport }
      : null,
    onCopyLink
      ? { key: "link", label: linkCopied ? "Link copied" : "Copy link", icon: linkCopied ? Check : Link2, onClick: onCopyLink }
      : null,
    role === "assistant" && onTogglePin
      ? { key: "pin", label: pinned ? "Unpin" : "Pin message", icon: pinned ? PinOff : Pin, onClick: onTogglePin }
      : null,
    role === "assistant" && onAddToKnowledge
      ? { key: "knowledge", label: "Add to knowledge", icon: BookMarked, onClick: onAddToKnowledge }
      : null,
    onDelete
      ? { key: "delete", label: "Delete", icon: Trash2, onClick: onDelete, danger: true }
      : null,
  ].filter(Boolean) as {
    key: string;
    label: string;
    icon: React.ElementType;
    onClick: () => void;
    danger?: boolean;
  }[];

  return (
    <div
      data-message-copy-text={copyText ?? statsText ?? undefined}
      className={cn(
        "flex items-center gap-0.5 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity flex-wrap",
        role === "user" && "md:opacity-0 md:group-hover/user-message:opacity-100",
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

      {role === "assistant" && onRevert && (
        <button
          type="button"
          onClick={onRevert}
          disabled={revertDisabled}
          className={cn(btn, revertDisabled && "opacity-40 cursor-not-allowed")}
          aria-label="Revert to this version"
          title={revertDisabled ? "This is the current version" : "Revert to this version"}
        >
          <Undo2 className="w-3.5 h-3.5 text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]" />
        </button>
      )}

      {role === "assistant" && onUndoLatest && (
        <button
          type="button"
          onClick={onUndoLatest}
          disabled={undoLatestDisabled}
          className={cn(btn, undoLatestDisabled && "opacity-40 cursor-not-allowed")}
          aria-label="Undo latest edit"
          title="Undo latest edit"
        >
          <Undo2 className="w-3.5 h-3.5 text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] rotate-180" />
        </button>
      )}

      {role === "assistant" && onThumbsUp && (
        <button type="button" onClick={onThumbsUp} className={btn} aria-label="Helpful" title="Helpful">
          <ThumbsUp className={cn("w-3.5 h-3.5 transition-colors", rating === 1 ? "text-green-400 fill-green-400" : "text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]")} />
        </button>
      )}
      {role === "assistant" && onThumbsDown && (
        <button type="button" onClick={onThumbsDown} className={btn} aria-label="Not helpful" title="Not helpful">
          <ThumbsDown className={cn("w-3.5 h-3.5 transition-colors", rating === -1 ? "text-red-400 fill-red-400" : "text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]")} />
        </button>
      )}

      {onCopy && (
        <button type="button" onClick={onCopy} className={btn} aria-label="Copy message" title="Copy message">
          {copied
            ? <Check className="w-3.5 h-3.5 text-green-500" />
            : <Copy className="w-3.5 h-3.5 text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]" />}
        </button>
      )}

      {role === "user" && canEdit && onEdit && (
        <button type="button" onClick={onEdit} className={btn} aria-label="Edit message" title="Edit message">
          <Pencil className="w-3 h-3 text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]" />
        </button>
      )}

      {moreItems.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" className={btn} aria-label="More options" title="More options">
              <MoreHorizontal className="w-3.5 h-3.5 text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align={align === "end" ? "end" : "start"} className="w-44">
            {moreItems.map((item, i) => (
              <span key={item.key}>
                {item.danger && i > 0 && <DropdownMenuSeparator />}
                <DropdownMenuItem
                  onClick={item.onClick}
                  className={cn("text-xs gap-2", item.danger && "text-destructive focus:text-destructive")}
                >
                  <item.icon className="w-3.5 h-3.5" />
                  {item.label}
                </DropdownMenuItem>
              </span>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  );
}
