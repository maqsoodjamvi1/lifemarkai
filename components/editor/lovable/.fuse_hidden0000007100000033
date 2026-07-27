"use client";

import { AnimatePresence, motion } from "framer-motion";
import { MessageSquare, X } from "lucide-react";

interface LovableComposerGuestCommentsBannerProps {
  visible: boolean;
  count: number;
  onOpenComments?: () => void;
  onFixWithAI?: () => void;
  onDismiss: () => void;
}

/** Nudge builder when anonymous guests left unresolved preview feedback. */
export function LovableComposerGuestCommentsBanner({
  visible,
  count,
  onOpenComments,
  onFixWithAI,
  onDismiss,
}: LovableComposerGuestCommentsBannerProps) {
  if (count <= 0) return null;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-sky-500/25 bg-sky-500/10 px-3 py-2.5"
        >
          <MessageSquare className="w-4 h-4 text-sky-300 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-sky-100">
              {count} guest comment{count === 1 ? "" : "s"} waiting
            </p>
            <p className="text-[10px] text-sky-300/70 mt-0.5">
              Visitors left feedback on your public preview — review and resolve in Comments.
            </p>
          </div>
          {onFixWithAI && (
            <button
              type="button"
              onClick={onFixWithAI}
              className="shrink-0 rounded-lg border border-sky-500/40 bg-sky-500/15 hover:bg-sky-500/25 text-sky-100 text-[11px] font-medium px-3 py-1.5 transition-colors"
            >
              Fix with AI
            </button>
          )}
          {onOpenComments && (
            <button
              type="button"
              onClick={onOpenComments}
              className="shrink-0 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-[11px] font-medium px-3 py-1.5 transition-colors"
            >
              Review
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 p-1 rounded text-sky-400/60 hover:text-sky-200 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
