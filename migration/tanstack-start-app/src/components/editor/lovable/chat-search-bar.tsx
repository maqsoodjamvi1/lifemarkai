
import { forwardRef } from "react";
import { motion } from "framer-motion";
import { ChevronsDown,ChevronsUp,Loader2,Search,Sparkles,XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatSearchMode } from "@/lib/editor/search-chat-messages";

export type ChatSearchRoleFilter = "all" | "user" | "assistant";
export type ChatSearchMsgModeFilter = "all" | "chat" | "plan" | "build" | "agent" | "patch";

interface LovableChatSearchBarProps {
  query: string;
  matchCount: number;
  mode?: ChatSearchMode;
  roleFilter?: ChatSearchRoleFilter;
  msgModeFilter?: ChatSearchMsgModeFilter;
  loading?: boolean;
  /**
   * Semantic search provenance chip:
   * - cached — embeddings served from message_embeddings
   * - fallback — keyword results because embeddings unavailable
   */
  searchSource?: "cached" | "fallback" | null;
  /** Zero-based index of the highlighted match (for ↑/↓ navigation). */
  activeIndex?: number;
  recentQueries?: string[];
  onNavigate?: (delta: number) => void;
  onJumpFirst?: () => void;
  onJumpLast?: () => void;
  onQueryChange: (query: string) => void;
  onClearQuery?: () => void;
  onModeChange?: (mode: ChatSearchMode) => void;
  onRoleFilterChange?: (role: ChatSearchRoleFilter) => void;
  onMsgModeFilterChange?: (mode: ChatSearchMsgModeFilter) => void;
  onSelectRecent?: (query: string) => void;
  onClearRecent?: () => void;
  onClose: () => void;
}

/** Lovable-parity message search — keyword + semantic modes, role filter, recent queries. */
export const LovableChatSearchBar = forwardRef<HTMLInputElement, LovableChatSearchBarProps>(
  function LovableChatSearchBar({
    query,
    matchCount,
    mode = "keyword",
    roleFilter = "all",
    msgModeFilter = "all",
    loading,
    searchSource = null,
    activeIndex,
    recentQueries = [],
    onNavigate,
    onJumpFirst,
    onJumpLast,
    onQueryChange,
    onModeChange,
    onRoleFilterChange,
    onMsgModeFilterChange,
    onSelectRecent,
    onClearRecent,
    onClearQuery,
    onClose,
  }, ref) {
    return (
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        className="overflow-hidden border-b border-border/60"
      >
        <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/20">
          <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <input
            ref={ref}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                onClose();
                return;
              }
              if (e.key === "Enter" && onNavigate) {
                e.preventDefault();
                onNavigate(e.shiftKey ? -1 : 1);
                return;
              }
              if (e.key === "ArrowDown" && onNavigate) {
                e.preventDefault();
                onNavigate(1);
                return;
              }
              if (e.key === "ArrowUp" && onNavigate) {
                e.preventDefault();
                onNavigate(-1);
              }
            }}
            placeholder={mode === "semantic" ? "Semantic search…" : "Search messages…"}
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50 text-foreground min-w-0"
          />
          {onRoleFilterChange && (
            <div className="flex items-center rounded-md border border-border/60 overflow-hidden shrink-0">
              {([
                { id: "all" as const, label: "All" },
                { id: "user" as const, label: "You" },
                { id: "assistant" as const, label: "AI" },
              ]).map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => onRoleFilterChange(r.id)}
                  className={cn(
                    "px-1.5 py-0.5 text-[10px] font-medium transition-colors",
                    roleFilter === r.id
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {r.label}
                </button>
              ))}
            </div>
          )}
          {onModeChange && (
            <div className="flex items-center rounded-md border border-border/60 overflow-hidden shrink-0">
              {(["keyword", "semantic"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => onModeChange(m)}
                  className={cn(
                    "px-2 py-0.5 text-[10px] font-medium transition-colors",
                    mode === m
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {m === "semantic" ? (
                    <span className="flex items-center gap-0.5">
                      <Sparkles className="w-2.5 h-2.5" />
                      AI
                    </span>
                  ) : (
                    "Text"
                  )}
                </button>
              ))}
            </div>
          )}
          {query && onClearQuery && (
            <button
              type="button"
              onClick={onClearQuery}
              className="text-muted-foreground/40 hover:text-foreground transition-colors shrink-0"
              title="Clear search"
            >
              <XCircle className="w-3 h-3" />
            </button>
          )}
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
          ) : query ? (
            <span className="text-[10px] text-muted-foreground/60 shrink-0 tabular-nums">
              {activeIndex != null && matchCount > 0
                ? `${activeIndex + 1}/${matchCount}`
                : `${matchCount} match${matchCount === 1 ? "" : "es"}`}
            </span>
          ) : null}
          {query && !loading && searchSource === "cached" && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded bg-violet-500/15 text-violet-700 dark:text-violet-300 shrink-0"
              title="Semantic results from cached embeddings"
            >
              cached
            </span>
          )}
          {query && !loading && searchSource === "fallback" && (
            <span
              className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 dark:text-amber-300 shrink-0"
              title="Fell back to keyword search — embeddings unavailable"
            >
              fallback
            </span>
          )}
          {query && matchCount > 0 && (onJumpFirst || onJumpLast) && (
            <div className="flex items-center gap-0.5 shrink-0">
              {onJumpFirst && (
                <button
                  type="button"
                  onClick={onJumpFirst}
                  className="p-0.5 rounded text-muted-foreground/45 hover:text-foreground transition-colors"
                  title="First match"
                >
                  <ChevronsUp className="w-3 h-3" />
                </button>
              )}
              {onJumpLast && (
                <button
                  type="button"
                  onClick={onJumpLast}
                  className="p-0.5 rounded text-muted-foreground/45 hover:text-foreground transition-colors"
                  title="Last match"
                >
                  <ChevronsDown className="w-3 h-3" />
                </button>
              )}
            </div>
          )}
          {query && (
            <span className="text-[9px] text-muted-foreground/45 shrink-0 hidden sm:inline">
              ↑↓ · Enter
            </span>
          )}
          <button onClick={onClose} className="text-muted-foreground/50 hover:text-foreground transition-colors shrink-0">
            <XCircle className="w-3.5 h-3.5" />
          </button>
        </div>
        {onMsgModeFilterChange && (
          <div className="flex items-center gap-1 px-3 pb-1.5 bg-muted/10 overflow-x-auto">
            <span className="text-[9px] text-muted-foreground/50 shrink-0">Mode</span>
            {([
              { id: "all" as const, label: "All" },
              { id: "chat" as const, label: "Chat" },
              { id: "plan" as const, label: "Plan" },
              { id: "build" as const, label: "Build" },
              { id: "agent" as const, label: "Agent" },
              { id: "patch" as const, label: "Patch" },
            ]).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onMsgModeFilterChange(m.id)}
                className={cn(
                  "shrink-0 rounded-full border px-2 py-0.5 text-[10px] transition-colors",
                  msgModeFilter === m.id
                    ? "border-violet-500/40 bg-violet-500/15 text-violet-800 dark:text-violet-200"
                    : "border-border/50 bg-muted/20 text-muted-foreground hover:text-foreground",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
        )}
        {!query.trim() && recentQueries.length > 0 && onSelectRecent && (
          <div className="flex items-center gap-1.5 px-3 pb-1.5 bg-muted/10 overflow-x-auto">
            <span className="text-[9px] text-muted-foreground/50 shrink-0">Recent</span>
            {recentQueries.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => onSelectRecent(q)}
                className="shrink-0 max-w-[140px] truncate rounded-full border border-border/50 bg-muted/30 px-2 py-0.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                title={q}
              >
                {q}
              </button>
            ))}
            {onClearRecent && (
              <button
                type="button"
                onClick={onClearRecent}
                className="shrink-0 text-[9px] text-muted-foreground/45 hover:text-foreground transition-colors px-1"
                title="Clear recent searches"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </motion.div>
    );
  },
);
