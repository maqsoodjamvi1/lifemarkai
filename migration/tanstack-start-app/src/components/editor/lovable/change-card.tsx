
import { Bookmark, Check } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";
import { cn } from "@/lib/utils";

export interface LovableChangeCardTask {
  id: string;
  label: string;
  done?: boolean;
}

export interface LovableChangeCardProps {
  title: string;
  statStr?: string;
  isBookmarked?: boolean;
  showDetails: boolean;
  onToggleDetails: () => void;
  onPreview: () => void;
  onToggleBookmark?: () => void;
  /** Expandable task checklist (Lovable Details panel) */
  tasks?: LovableChangeCardTask[];
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
  tasks,
  detailsContent,
  className,
}: LovableChangeCardProps) {
  const hasDetailsBody = !!(detailsContent || (tasks && tasks.length > 0));

  return (
    // Lovable dump card: outline-2 outline-offset-2 outline-transparent
    // focus-visible:outline-accent … mr-1 flex max-w-sm flex-col rounded-4
    // shadow-surface-md bg-secondary-pulse — borderless, whole card clickable.
    <div
      className={cn(
        "w-full max-w-sm mr-1 mt-1 flex flex-col overflow-hidden rounded-[var(--radius-4,1rem)]",
        "bg-[var(--bg-secondary-pulse)] shadow-surface-md",
        "text-left outline-2 outline-offset-2 outline-transparent transition-all duration-150 ease-in-out",
        "focus-visible:outline-[color:var(--border-accent)] has-[[data-card-focusable]:focus-visible]:outline-[color:var(--border-accent)]",
        className,
      )}
    >
      <div
        role="button"
        tabIndex={0}
        data-card-focusable=""
        onClick={onToggleDetails}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggleDetails();
          }
        }}
        className="w-full bg-transparent text-start cursor-pointer outline-none"
      >
        <div className="flex flex-col px-4 py-3 pr-3">
          <div className="flex min-h-6 min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <span className="flex h-7 min-w-0 flex-1 items-center gap-1 truncate text-lg font-[440] md:text-base text-[var(--fg-primary)]">
                <span className="min-w-0 truncate">{title}</span>
              </span>
            </div>
            {onToggleBookmark && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onToggleBookmark();
                }}
                className={cn(
                  "shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-[var(--radius-2)] transition-colors",
                  isBookmarked
                    ? "text-amber-400 hover:text-amber-300"
                    : "text-[var(--fg-quaternary)] hover:text-[var(--fg-primary)]",
                )}
                title={isBookmarked ? "Remove bookmark" : "Bookmark in history"}
                aria-label="Bookmark in history"
              >
                <Bookmark className={cn("w-4 h-4", isBookmarked && "fill-amber-400")} />
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onPreview();
              }}
              className="shrink-0 h-7 w-7 inline-flex items-center justify-center rounded-[var(--radius-2)] text-[var(--fg-quaternary)] hover:text-[var(--fg-primary)] transition-colors"
              title="Preview this version"
              aria-label="Preview this version"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" />
                <circle cx="12" cy="12" r="3" />
              </svg>
            </button>
          </div>
          {statStr && (
            <span className="text-[10px] text-[var(--fg-tertiary)] font-mono">{statStr} lines</span>
          )}
        </div>
      </div>

      <AnimatePresence>
        {showDetails && hasDetailsBody && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-t border-[color:var(--border-default)]"
          >
            {tasks && tasks.length > 0 && (
              <ul className="flex flex-col gap-1.5 p-3">
                {tasks.map((t) => (
                  <li key={t.id} className="flex items-start gap-2 text-sm text-[var(--fg-secondary)]">
                    <span
                      className={cn(
                        "mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border",
                        t.done
                          ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-400"
                          : "border-[color:var(--border-default)] text-transparent",
                      )}
                    >
                      <Check className="size-2.5" />
                    </span>
                    <span className={cn(t.done && "text-[var(--fg-tertiary)] line-through")}>{t.label}</span>
                  </li>
                ))}
              </ul>
            )}
            {(!tasks || tasks.length === 0) && !detailsContent && (
              <div className="p-3 text-sm text-[var(--fg-tertiary)]">No tasks tracked yet.</div>
            )}
            {detailsContent}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
