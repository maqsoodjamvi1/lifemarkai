"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Sparkles, Zap, Layout, MessageSquare, Code2, Share2, GitBranch, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";

const APP_VERSION = "2.5.0";
const STORAGE_KEY = "lifemarkai_seen_version";

interface ChangelogItem {
  icon: React.ElementType;
  color: string;
  title: string;
  description: string;
}

const CHANGELOG: ChangelogItem[] = [
  {
    icon: Code2,
    color: "text-blue-400",
    title: "Split-pane editor",
    description: "View two files side by side with ⌘\\ — drag to resize each pane independently.",
  },
  {
    icon: MessageSquare,
    color: "text-violet-400",
    title: "Export chat as Markdown",
    description: "Download your full AI conversation as a .md file with the new export button in the chat header.",
  },
  {
    icon: Zap,
    color: "text-yellow-400",
    title: "Save All (⌘⇧S)",
    description: "Unsaved tabs now show a dot indicator. Save every dirty file at once with a single shortcut.",
  },
  {
    icon: Layout,
    color: "text-green-400",
    title: "Continue where you left off",
    description: "The dashboard now surfaces your most recently edited project so you can jump straight back in.",
  },
  {
    icon: GitBranch,
    color: "text-orange-400",
    title: "Inline file rename",
    description: "Double-click any file in the file tree to rename it without leaving the editor.",
  },
  {
    icon: Share2,
    color: "text-pink-400",
    title: "Insert code at cursor",
    description: "Click the ↵ button on any AI code block to insert it directly at the editor cursor position.",
  },
  {
    icon: Shield,
    color: "text-cyan-400",
    title: "Per-file unsaved indicators",
    description: "Each tab shows an orange dot when it has unsaved changes, and the Save button reflects state.",
  },
];

export function WhatsNewModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const seen = localStorage.getItem(STORAGE_KEY);
    if (seen !== APP_VERSION) {
      // Small delay so it doesn't flash immediately on page load
      const t = setTimeout(() => setOpen(true), 1500);
      return () => clearTimeout(t);
    }
  }, []);

  function dismiss() {
    localStorage.setItem(STORAGE_KEY, APP_VERSION);
    setOpen(false);
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[500] bg-black/50 backdrop-blur-sm"
            onClick={dismiss}
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.95, y: 16 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 16 }}
            transition={{ type: "spring", stiffness: 300, damping: 28 }}
            className="fixed inset-0 z-[510] flex items-center justify-center pointer-events-none px-4"
          >
            <div className="pointer-events-auto bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
              {/* Header */}
              <div className="relative px-6 pt-6 pb-4 bg-gradient-to-br from-violet-500/10 via-violet-500/5 to-transparent border-b border-border">
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-violet-500/10 blur-3xl" />
                </div>
                <div className="relative flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/20 flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4 text-violet-400" />
                    </div>
                    <div>
                      <h2 className="font-semibold text-foreground text-base leading-tight">
                        What&apos;s new in LifemarkAI
                      </h2>
                      <p className="text-xs text-muted-foreground mt-0.5">Version {APP_VERSION} — May 2026</p>
                    </div>
                  </div>
                  <button
                    onClick={dismiss}
                    className="shrink-0 p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors"
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Changelog list */}
              <div className="px-4 py-3 space-y-1 max-h-[400px] overflow-y-auto">
                {CHANGELOG.map((item) => {
                  const Icon = item.icon;
                  return (
                    <div
                      key={item.title}
                      className="flex items-start gap-3 px-2 py-2.5 rounded-xl hover:bg-muted/40 transition-colors"
                    >
                      <div className="shrink-0 w-7 h-7 rounded-lg bg-muted/60 flex items-center justify-center mt-0.5">
                        <Icon className={`w-3.5 h-3.5 ${item.color}`} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-foreground leading-tight">{item.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Footer */}
              <div className="px-6 py-4 border-t border-border flex items-center justify-between">
                <a
                  href="/changelog"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors underline-offset-2 hover:underline"
                >
                  Full changelog
                </a>
                <Button size="sm" onClick={dismiss} className="bg-violet-600 hover:bg-violet-700 text-white">
                  Got it
                </Button>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
