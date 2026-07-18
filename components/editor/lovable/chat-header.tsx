"use client";

import {
  Download, Copy, Check, Trash2, Search, Bookmark, Minimize2, MoreHorizontal,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { EditorMode } from "@/components/editor/editor-layout";
import { LovableChatHeaderQueuePill } from "./chat-header-extras";

interface LovableChatHeaderProps {
  mode: EditorMode;
  creditLabel: string;
  queueCount?: number;
  queuePaused?: boolean;
  hasMessages: boolean;
  showSearch: boolean;
  showBookmarks: boolean;
  bookmarkCount: number;
  allCodeBlocksCollapsed: boolean;
  copiedAll: boolean;
  onExportMarkdown: () => void;
  onCopyAll: () => void;
  onClearChat: () => void;
  onToggleSearch: () => void;
  onToggleBookmarks: () => void;
  onToggleCodeBlocks: () => void;
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
  showSearch,
  showBookmarks,
  bookmarkCount,
  allCodeBlocksCollapsed,
  copiedAll,
  onExportMarkdown,
  onCopyAll,
  onClearChat,
  onToggleSearch,
  onToggleBookmarks,
  onToggleCodeBlocks,
  className,
}: LovableChatHeaderProps) {
  return (
    <div
      data-chat-header
      className={cn(
        "flex items-center gap-2 px-3 py-2 border-b border-[color:var(--border-translucent)] shrink-0",
        "bg-[var(--bg-base)]/90 backdrop-blur-sm",
        className,
      )}
    >
      <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-[500] text-[var(--fg-primary)] bg-[var(--bg-secondary-pulse)] border border-[color:var(--border-default)] shadow-surface-xs">
        {MODE_LABELS[mode] ?? mode}
      </span>
      <span className="text-[10px] text-[var(--fg-quaternary)] tabular-nums">{creditLabel}</span>
      <LovableChatHeaderQueuePill count={queueCount} paused={queuePaused} />
      <div className="flex-1" />
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
          <DropdownMenuItem className="text-xs gap-2" disabled={!hasMessages} onClick={onCopyAll}>
            {copiedAll ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}
            Copy all messages
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs gap-2" disabled={!hasMessages} onClick={onToggleSearch}>
            <Search className="size-3.5" />
            {showSearch ? "Hide search" : "Search messages"}
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs gap-2" disabled={!hasMessages} onClick={onToggleBookmarks}>
            <Bookmark className={cn("size-3.5", showBookmarks && "fill-amber-400 text-amber-400")} />
            {showBookmarks ? "Show all messages" : `Bookmarks${bookmarkCount > 0 ? ` (${bookmarkCount})` : ""}`}
          </DropdownMenuItem>
          <DropdownMenuItem className="text-xs gap-2" disabled={!hasMessages} onClick={onToggleCodeBlocks}>
            <Minimize2 className="size-3.5" />
            {allCodeBlocksCollapsed ? "Expand code blocks" : "Collapse code blocks"}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-xs gap-2 text-destructive focus:text-destructive"
            disabled={!hasMessages}
            onClick={onClearChat}
          >
            <Trash2 className="size-3.5" /> Clear conversation
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
