import { Bookmark,Check,Copy,Download,Minimize2,MoreHorizontal,Rows3,Search,Trash2 } from "lucide-react";
import type { EditorMode } from "@/components/editor/editor-layout";
import {
  DropdownMenu,DropdownMenuContent,DropdownMenuItem,DropdownMenuSeparator,DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { LovableChatHeaderQueuePill } from "./chat-header-extras";

interface LovableChatHeaderProps {
  mode: EditorMode;
  creditLabel: string;
  queueCount: number;
  queuePaused: boolean;
  messageCount: number;
  showSearch: boolean;
  showBookmarks: boolean;
  bookmarkCount: number;
  allCodeBlocksCollapsed: boolean;
  compactDensity: boolean;
  copiedAll: boolean;
  onExportMarkdown: () => void;
  onExportJson: () => void;
  onCopyAll: () => void;
  onClearChat: () => void;
  onToggleSearch: () => void;
  onToggleBookmarks: () => void;
  onToggleCodeBlocks: () => void;
  onToggleCompactDensity: () => void;
}

const MODE_LABELS: Record<EditorMode, string> = {
  chat: "Chat", plan: "Plan", build: "Build", agent: "Agent", patch: "Quick edit",
};

/** Compact controls backed entirely by ChatPanel's existing state and actions. */
export function LovableChatHeader(props: LovableChatHeaderProps) {
  const hasMessages = props.messageCount > 0;
  return (
    <div className="flex h-11 shrink-0 items-center gap-2 border-b border-[color:var(--border-translucent)] bg-[var(--bg-base)]/95 px-3 backdrop-blur-xl">
      <span className="text-xs font-semibold tracking-tight text-[var(--fg-primary)]">AI workspace</span>
      <span className="inline-flex rounded-full border border-blue-500/15 bg-blue-500/10 px-2 py-0.5 text-[10px] font-semibold text-[#1F55F1]">
        {MODE_LABELS[props.mode]}
      </span>
      <span className="hidden text-[10px] tabular-nums text-[var(--fg-quaternary)] sm:inline">{props.creditLabel}</span>
      <LovableChatHeaderQueuePill count={props.queueCount} paused={props.queuePaused} />
      <div className="flex-1" />
      {hasMessages && (
        <>
          <button
            type="button"
            aria-label={props.showSearch ? "Hide message search" : "Search messages"}
            onClick={props.onToggleSearch}
            className={cn("grid size-7 place-items-center rounded-full transition-colors", props.showSearch ? "bg-violet-500/10 text-violet-500" : "text-[var(--fg-tertiary)] hover:bg-[var(--glow-neutral-hover)]")}
          >
            <Search className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label={props.showBookmarks ? "Show all messages" : "Show bookmarks"}
            onClick={props.onToggleBookmarks}
            className={cn("grid size-7 place-items-center rounded-full transition-colors", props.showBookmarks ? "bg-amber-500/10 text-amber-500" : "text-[var(--fg-tertiary)] hover:bg-[var(--glow-neutral-hover)]")}
          >
            <Bookmark className={cn("size-3.5", props.showBookmarks && "fill-current")} />
          </button>
        </>
      )}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Chat options" className="grid size-7 place-items-center rounded-full text-[var(--fg-tertiary)] hover:bg-[var(--glow-neutral-hover)]">
            <MoreHorizontal className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52 p-1">
          <DropdownMenuItem disabled={!hasMessages} onClick={props.onExportMarkdown} className="gap-2 text-xs"><Download className="size-3.5" />Export Markdown</DropdownMenuItem>
          <DropdownMenuItem disabled={!hasMessages} onClick={props.onExportJson} className="gap-2 text-xs"><Download className="size-3.5" />Export JSON</DropdownMenuItem>
          <DropdownMenuItem disabled={!hasMessages} onClick={props.onCopyAll} className="gap-2 text-xs">
            {props.copiedAll ? <Check className="size-3.5 text-green-500" /> : <Copy className="size-3.5" />}Copy all messages
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!hasMessages} onClick={props.onToggleSearch} className="gap-2 text-xs"><Search className="size-3.5" />{props.showSearch ? "Hide search" : "Search messages"}</DropdownMenuItem>
          <DropdownMenuItem disabled={!hasMessages} onClick={props.onToggleBookmarks} className="gap-2 text-xs"><Bookmark className="size-3.5" />{props.showBookmarks ? "Show all messages" : `Bookmarks${props.bookmarkCount ? ` (${props.bookmarkCount})` : ""}`}</DropdownMenuItem>
          <DropdownMenuItem disabled={!hasMessages} onClick={props.onToggleCodeBlocks} className="gap-2 text-xs"><Minimize2 className="size-3.5" />{props.allCodeBlocksCollapsed ? "Expand code blocks" : "Collapse code blocks"}</DropdownMenuItem>
          <DropdownMenuItem onClick={props.onToggleCompactDensity} className="gap-2 text-xs"><Rows3 className="size-3.5" />{props.compactDensity ? "Comfortable density" : "Compact density"}</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!hasMessages} onClick={props.onClearChat} className="gap-2 text-xs text-destructive focus:text-destructive"><Trash2 className="size-3.5" />Clear conversation</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
