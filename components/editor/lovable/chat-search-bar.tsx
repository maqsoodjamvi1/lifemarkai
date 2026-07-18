"use client";

import { forwardRef } from "react";
import { motion } from "framer-motion";
import { Loader2, Search, Sparkles, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatSearchMode } from "@/lib/editor/search-chat-messages";

interface LovableChatSearchBarProps {
  query: string;
  matchCount: number;
  mode?: ChatSearchMode;
  loading?: boolean;
  onQueryChange: (query: string) => void;
  onModeChange?: (mode: ChatSearchMode) => void;
  onClose: () => void;
}

/** Lovable-parity message search — keyword + semantic modes. */
export const LovableChatSearchBar = forwardRef<HTMLInputElement, LovableChatSearchBarProps>(
  function LovableChatSearchBar({
    query,
    matchCount,
    mode = "keyword",
    loading,
    onQueryChange,
    onModeChange,
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
              if (e.key === "Escape") onClose();
            }}
            placeholder={mode === "semantic" ? "Semantic search…" : "Search messages…"}
            className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50 text-foreground"
          />
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
          {loading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground shrink-0" />
          ) : query ? (
            <span className="text-[10px] text-muted-foreground/60 shrink-0">
              {matchCount} match{matchCount === 1 ? "" : "es"}
            </span>
          ) : null}
          <button onClick={onClose} className="text-muted-foreground/50 hover:text-foreground transition-colors">
            <XCircle className="w-3.5 h-3.5" />
          </button>
        </div>
      </motion.div>
    );
  },
);
