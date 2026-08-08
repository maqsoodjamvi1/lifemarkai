
import {
Download,Copy,Check,Trash2,Search,Bookmark,Minimize2,MoreHorizontal,
ChevronsDownUp,ChevronsUpDown,Rows3,Printer,CalendarDays,
} from "lucide-react";
import {
DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator,DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { EditorMode } from "@/components/editor/editor-layout";
import { LovableChatHeaderQueuePill } from "./chat-header-extras";
import { chatBookmarksShortcutLabel,chatClearShortcutLabel,chatSearchShortcutLabel } from "./shortcut-labels";
import type { LovableChatDayJumpItem } from "./chat-day-utils";

interface LovableChatHeaderProps {
  mode: EditorMode;
  creditLabel: string;
  queueCount?: number;
  queuePaused?: boolean;
  hasMessages: boolean;
  messageCount?: number;
  showSearch: boolean;
  showBookmarks: boolean;
  bookmarkCount: number;
  allCodeBlocksCollapsed: boolean;
  copiedAll: boolean;
  onExportMarkdown: () => void;
  onExportJson?: () => void;
  onPrintChat?: () => void;
  onCopyAll: () => void;
  onClearChat: () => void;
  onToggleSearch: () => void;
  onToggleBookmarks: () => void;
  onToggleCodeBlocks: () => void;
  onCollapseAllThreads?: () => void;
  onExpandAllThreads?: () => void;
  compactDensity?: boolean;
  onToggleCompactDensity?: () => void;
  chatDays?: LovableChatDayJumpItem[];
  onJumpToDay?: (messageId: string) => void;
  className?: string;
}

const MODE_LABELS: Record<EditorMode, string> = {
  chat: "Chat",
  plan: "Plan",
  build: "Build",
  agent: "Agent",
  patch: "Quick Edit",
};

/**
 * Lovable-parity chat column header — mode pill + overflow utilities menu.
 */
export function LovableChatHeader({
  mode,
  creditLabel,
  queueCount = 0,
  queuePaused,
  hasMessages,
  messageCount,
  showSearch,
  showBookmarks,
  bookmarkCount,
  allCodeBlocksCollapsed,
  copiedAll,
  onExportMarkdown,
  onExportJson,
  onPrintChat,
  onCopyAll,
  onClearChat,
  onToggleSearch,
  onToggleBookmarks,
  onToggleCodeBlocks,
  onCollapseAllThreads,
  onExpandAllThreads,
  compactDensity,
  onToggleCompactDensity,
  chatDays,
  onJumpToDay,
  className,
}: LovableChatHeaderProps) {
  return (
    <div
      data-chat-header
      className={cn(
        // Lovable dump: the chat panel has NO header row — the timeline starts
        // directly under the top bar. Utilities live in the composer "+" menu
        // (see composer-toolbar) and via chat-settings events; keep this
        // mounted-but-hidden so nothing regresses if a flag re-enables it.
        "hidden",
        "items-center gap-2 px-3 py-2 border-b border-[color:var(--border-translucent)] shrink-0",
        "bg-[var(--bg-base)]/90 backdrop-blur-sm",
        className,
      )}
    >
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-[500] text-[var(--fg-primary)] bg-[var(--bg-secondary-pulse)] border border-[color:var(--border-default)] shadow-surface-xs">
        {MODE_LABELS[mode] ?? mode}
      </span>
      <span className="text-[10px] text-[var(--fg-quaternary)] tabular-nums">{creditLabel}</span>
      {typeof messageCount === "number" && messageCount > 0 && (
        <span
          className="text-[10px] text-[var(--fg-quaternary)]/80 tabular-nums hidden sm:inline"
          title={`${messageCount} message${messageCount === 1 ? "" : "s"} in this chat`}
        >
          · {messageCount} msg{messageCount === 1 ? "" : "s"}
        </span>
      )}
      <LovableChatHeaderQueuePill count={queueCount} paused={queuePaused} />
      <div className="flex-1" />
      {hasMessages && (
        <div className="flex items-center gap-0.5">
          <button
            type="button"
            aria-label={showSearch ? "Hide search" : "Search messages"}
            title={`${showSearch ? "Hide search" : "Search messages"} (${chatSearchShortcutLabel()})`}
            onClick={onToggleSearch}
            className={cn(
              "flex size-7 items-center justify-center rounded-full transition-colors",
              showSearch
                ? "text-violet-400 bg-violet-500/10"
                : "text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] hover:bg-[var(--glow-neutral-hover)]",
            )}
          >
            <Search className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={showBookmarks ? "Show all messages" : "Show bookmarks"}
            title={`${showBookmarks ? "Show all messages" : "Bookmarks"} (${chatBookmarksShortcutLabel()})`}
            onClick={onToggleBookmarks}
            className={cn(
              "flex size-7 items-center justify-center rounded-full transition-colors",
              showBookmarks
                ? "text-amber-400 bg-amber-500/10"
                : "text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] hover:bg-[var(--glow-neutral-hover)]",
            )}
          >
            <Bookmark className={cn("size-3.5", showBookmarks && "fill-amber-400")} />
          </button>
        </div>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Chat options"
            className="flex size-7 items-center justify-center rounded-full text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)] hover:bg-[var(--glow-neutral-hover)] transition-colors"
          >
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48 p-1">
          <DropdownMenuItem className="text-xs gap-2" disabled={!hasMessages} onClick={onExportMarkdown}>
            <Download className="size-3.5" /> Export Markdown
          </DropdownMenuItem>
          {onExportJson && (
            <DropdownMenuItem className="text-xs gap-2" disabled={!hasMessages} onClick={onExportJson}>
              <Download className="size-3.5" /> Export JSON
            </DropdownMenuItem>
          )}
          {onPrintChat && (
            <DropdownMenuItem className="text-xs gap-2" disabled={!hasMessages} onClick={onPrintChat}>
              <Printer className="size-3.5" /> Print conversation
            </DropdownMenuItem>
          )}
          <DropdownMenuItem className="text-xs gap-2" disabled={!hasMessages} onClick={onCopyAll}>
            {copiedAll ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
            Copy all messages
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs gap-2" disabled={!hasMessages} onClick={onToggleSearch}>
            <Search className="size-3.5" />
            <span className="flex-1">{showSearch ? "Hide search" : "Search messages"}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">{chatSearchShortcutLabel()}</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs gap-2" disabled={!hasMessages} onClick={onToggleBookmarks}>
            <Bookmark className={cn("size-3.5", showBookmarks && "fill-amber-400 text-amber-400")} />
            <span className="flex-1">{showBookmarks ? "Show all messages" : `Bookmarks${bookmarkCount > 0 ? ` (${bookmarkCount})` : ""}`}</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">{chatBookmarksShortcutLabel()}</span>
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs gap-2" disabled={!hasMessages} onClick={onToggleCodeBlocks}>
            <Minimize2 className="size-3.5" />
            <span className="flex-1">{allCodeBlocksCollapsed ? "Expand code blocks" : "Collapse code blocks"}</span>
          </DropdownMenuItem>
          {onCollapseAllThreads && (
            <DropdownMenuItem className="text-xs gap-2" disabled={!hasMessages} onClick={onCollapseAllThreads}>
              <ChevronsUpDown className="size-3.5" />
              <span className="flex-1">Collapse all threads</span>
            </DropdownMenuItem>
          )}
          {onExpandAllThreads && (
            <DropdownMenuItem className="text-xs gap-2" disabled={!hasMessages} onClick={onExpandAllThreads}>
              <ChevronsDownUp className="size-3.5" />
              <span className="flex-1">Expand all threads</span>
            </DropdownMenuItem>
          )}
          {onToggleCompactDensity && (
            <DropdownMenuItem className="text-xs gap-2" onClick={onToggleCompactDensity}>
              <Rows3 className="size-3.5" />
              <span className="flex-1">{compactDensity ? "Comfortable density" : "Compact density"}</span>
            </DropdownMenuItem>
          )}
          {onJumpToDay && chatDays && chatDays.length > 1 && (
            <>
              <DropdownMenuSeparator />
              {chatDays.map((day) => (
                <DropdownMenuItem
                  key={day.key}
                  className="text-xs gap-2"
                  onClick={() => onJumpToDay(day.messageId)}
                >
                  <CalendarDays className="size-3.5" />
                  <span className="flex-1">{day.label}</span>
                  <span className="text-[10px] text-muted-foreground tabular-nums">{day.count}</span>
                </DropdownMenuItem>
              ))}
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-xs gap-2 text-destructive focus:text-destructive"
            disabled={!hasMessages}
            onClick={onClearChat}
          >
            <Trash2 className="size-3.5" />
            <span className="flex-1">Clear conversation</span>
            <span className="text-[10px] text-muted-foreground tabular-nums">{chatClearShortcutLabel()}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
