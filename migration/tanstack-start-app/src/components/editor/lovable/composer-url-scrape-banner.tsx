
import { motion } from "framer-motion";
import { Globe, Loader2, X } from "lucide-react";

export interface LovableUrlScrapeMeta {
  title: string;
  description: string;
  ogImage: string;
  textContent: string;
}

interface LovableComposerUrlScrapeBannerProps {
  url: string;
  isScraping: boolean;
  meta: LovableUrlScrapeMeta | null;
  onDismiss: () => void;
  onQuickAction: (prompt: string) => void;
}

export function LovableComposerUrlScrapeBanner({
  url,
  isScraping,
  meta,
  onDismiss,
  onQuickAction,
}: LovableComposerUrlScrapeBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 6 }}
      className="mb-2 rounded-xl border border-blue-500/30 bg-blue-500/5 overflow-hidden"
    >
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-blue-500/20 bg-blue-500/10">
        <div className="flex items-center gap-1.5">
          {isScraping ? (
            <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
          ) : (
            <Globe className="w-3 h-3 text-blue-400" />
          )}
          <span className="text-[11px] font-semibold text-blue-700 dark:text-blue-300">
            {isScraping ? "Reading page…" : meta ? "Page loaded" : "URL detected"}
          </span>
          <span className="text-[10px] text-blue-400/60 font-mono truncate max-w-[140px]">{url}</span>
        </div>
        <button onClick={onDismiss} className="text-blue-400/60 hover:text-blue-300 transition-colors">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="p-2.5 flex gap-3">
        {meta?.ogImage && (
          <img
            src={meta.ogImage}
            alt="Page preview"
            className="h-14 w-auto max-w-[80px] rounded-lg border border-blue-500/20 object-cover shadow-sm flex-shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
        )}
        <div className="flex flex-col justify-center gap-1.5 flex-1 min-w-0">
          {meta ? (
            <>
              {meta.title && <p className="text-[11px] font-medium text-foreground truncate">{meta.title}</p>}
              {meta.description && (
                <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">{meta.description}</p>
              )}
            </>
          ) : isScraping ? (
            <p className="text-[11px] text-muted-foreground">Fetching page content…</p>
          ) : (
            <p className="text-[11px] text-muted-foreground">Add a prompt or use a quick action below.</p>
          )}
          {meta && (
            <div className="flex flex-wrap gap-1 mt-0.5">
              <button
                onClick={() =>
                  onQuickAction(
                    `Clone this website as a React + Tailwind app. Match the layout, design, colors, and content exactly: ${url}`,
                  )
                }
                className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-700 dark:text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
              >
                🌐 Clone page
              </button>
              <button
                onClick={() =>
                  onQuickAction(
                    `Analyze the design and content of this page and build an improved, modern version with better UX: ${url}`,
                  )
                }
                className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-700 dark:text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 transition-colors"
              >
                ✨ Redesign
              </button>
              <button
                onClick={() =>
                  onQuickAction(
                    `Based on this page, extract the key content and structure, then build a landing page for the same product/service: ${url}`,
                  )
                }
                className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
              >
                📄 Landing page
              </button>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
