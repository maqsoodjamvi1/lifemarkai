"use client";

import { Bookmark } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface LovableChangeCardProps {
  title: string;
  statStr?: string;
  isBookmarked?: boolean;
  showDetails: boolean;
  onToggleDetails: () => void;
  onPreview: () => void;
  onToggleBookmark?: () => void;
  detailsContent?: React.ReactNode;
  className?: string;
}

/**
 * Lovable-parity change/commit card — rounded surface with Details / Preview tabs.
 */
export function LovableChangeCard({
  title,
  statStr,
  isBookmarked,
  showDetails,
  onToggleDetails,
  onPreview,
  onToggleBookmark,
  detailsContent,
  className,
}: LovableChangeCardProps) {
  return (
    <div
      className={cn(
        "w-full mt-1 overflow-hidden rounded-[var(--radius-3)] border border-[color:var(--border-default)]",
        "bg-[var(--bg-secondary-pulse)] shadow-surface-xs",
        className,
      )}
    >
      <div className="flex items-center justify-between px-3 py-2.5">
        <div className="flex-1 min-w-0">
          <span className="text-xs font-[500] truncate block text-[var(--fg-primary)]">{title}</span>
          {statStr && (
            <span className="text-[10px] text-[var(--fg-tertiary)] font-mono">{statStr} lines</span>
          )}
        </div>
        {onToggleBookmark && (
          <button
            type="button"
            onClick={onToggleBookmark}
            className={cn(
              "shrink-0 ml-2 transition-colors",
              isBookmarked
                ? "text-amber-400 hover:text-amber-300"
                : "text-[var(--fg-quaternary)] hover:text-amber-400",
            )}
            title={isBookmarked ? "Remove bookmark" : "Bookmark this response"}
          >
            <Bookmark className={cn("w-3.5 h-3.5", isBookmarked && "fill-amber-400")} />
          </button>
        )}
      </div>

      <div className="flex border-t border-[color:var(--border-default)]">
        <button
          type="button"
          onClick={onToggleDetails}
          className={cn(
            "flex-1 py-2 text-[11px] font-[500] transition-colors",
            showDetails
              ? "bg-[var(--bg-primary-pulse)] text-[var(--fg-primary)]"
              : "text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]",
          )}
        >
          Details
        </button>
        <button
          type="button"
          onClick={onPreview}
          className={cn(
            "flex-1 py-2 text-[11px] font-[500] transition-colors border-l border-[color:var(--border-default)]",
            !showDetails
              ? "bg-[var(--bg-primary-pulse)] text-[var(--fg-primary)]"
              : "text-[var(--fg-tertiary)] hover:text-[var(--fg-primary)]",
          )}
        >
          Preview
        </button>
      </div>

      <AnimatePresence>
        {showDetails && detailsContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-[color:var(--border-default)]"
          >
            {detailsContent}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
