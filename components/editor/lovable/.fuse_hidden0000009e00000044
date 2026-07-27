"use client";

import { AnimatePresence, motion } from "framer-motion";
import { ExternalLink, Rocket, X } from "lucide-react";

interface LovablePostBuildPublishBannerProps {
  visible: boolean;
  deployedUrl?: string | null;
  publishing?: boolean;
  onPublish: () => void;
  onOpenPublishPanel?: () => void;
  onDismiss: () => void;
}

/** Post-build CTA — publish or update the live app (Lovable parity). */
export function LovablePostBuildPublishBanner({
  visible,
  deployedUrl,
  publishing,
  onPublish,
  onOpenPublishPanel,
  onDismiss,
}: LovablePostBuildPublishBannerProps) {
  const isUpdate = !!deployedUrl;
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 6 }}
          className="mx-3 mb-2 flex items-center gap-2 rounded-xl border border-violet-500/25 bg-violet-500/10 px-3 py-2.5"
        >
          <Rocket className="w-4 h-4 text-violet-300 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-violet-100">
              {isUpdate ? "Build complete — update your live site?" : "Build complete — ready to publish?"}
            </p>
            <p className="text-[10px] text-violet-300/70 mt-0.5">
              {isUpdate
                ? "Deploy the latest snapshot so visitors see your changes."
                : "Share a public URL when you're happy with the preview."}
            </p>
          </div>
          <button
            type="button"
            disabled={publishing}
            onClick={onPublish}
            className="shrink-0 rounded-lg bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-white text-[11px] font-medium px-3 py-1.5 transition-colors"
          >
            {publishing ? "Deploying…" : isUpdate ? "Update" : "Publish"}
          </button>
          {onOpenPublishPanel && (
            <button
              type="button"
              onClick={onOpenPublishPanel}
              className="shrink-0 p-1.5 rounded-lg text-violet-300/70 hover:text-violet-100 hover:bg-violet-500/20 transition-colors"
              title="Publish settings"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          )}
          <button
            type="button"
            onClick={onDismiss}
            className="shrink-0 p-1 rounded text-violet-400/60 hover:text-violet-200 transition-colors"
            aria-label="Dismiss"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
