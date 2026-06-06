"use client";

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Keyboard } from "lucide-react";

interface ShortcutGroup {
  title: string;
  shortcuts: { keys: string[]; description: string }[];
}

const SHORTCUT_GROUPS: ShortcutGroup[] = [
  {
    title: "General",
    shortcuts: [
      { keys: ["⌘", "/"], description: "Show keyboard shortcuts" },
      { keys: ["⌘", "S"], description: "Save current file" },
      { keys: ["⌘", "Enter"], description: "Send AI message" },
      { keys: ["⌘", "⇧", "C"], description: "Switch to Chat mode" },
      { keys: ["⌘", "⇧", "P"], description: "Switch to Plan mode" },
      { keys: ["⌘", "⇧", "B"], description: "Switch to Build mode" },
      { keys: ["⌘", "⇧", "A"], description: "Switch to Agent mode" },
    ],
  },
  {
    title: "Navigation",
    shortcuts: [
      { keys: ["⌘", "P"], description: "Quick file switcher" },
      { keys: ["⌘", "G"], description: "Go to line" },
      { keys: ["⌘", "F"], description: "Find in file" },
      { keys: ["⌘", "⇧", "F"], description: "Find in all files" },
      { keys: ["⌘", "\\"], description: "Toggle file tree" },
    ],
  },
  {
    title: "Tabs",
    shortcuts: [
      { keys: ["⌘", "W"], description: "Close active tab" },
      { keys: ["⌘", "⇧", "T"], description: "Reopen last closed tab" },
      { keys: ["⌘", "⇧", "["], description: "Previous tab" },
      { keys: ["⌘", "⇧", "]"], description: "Next tab" },
    ],
  },
  {
    title: "Editor",
    shortcuts: [
      { keys: ["⌘", "Z"], description: "Undo" },
      { keys: ["⌘", "⇧", "Z"], description: "Redo" },
      { keys: ["⇧", "⌥", "F"], description: "Format document" },
      { keys: ["⌘", "K", "⌘", "F"], description: "Format selection" },
      { keys: ["F12"], description: "Go to definition" },
      { keys: ["F2"], description: "Rename symbol" },
      { keys: ["F8"], description: "Go to next error" },
      { keys: ["⇧", "F8"], description: "Go to previous error" },
      { keys: ["⌘", "⇧", "C"], description: "Copy line (no selection)" },
      { keys: ["⌥", "⇧", "↓"], description: "Duplicate line down" },
      { keys: ["⌥", "⇧", "↑"], description: "Duplicate line up" },
      { keys: ["⌥", "↓"], description: "Move line down" },
      { keys: ["⌥", "↑"], description: "Move line up" },
      { keys: ["⌘", "/"], description: "Toggle line comment" },
      { keys: ["⌘", "⇧", "/"], description: "Toggle block comment" },
      { keys: ["⌘", "D"], description: "Select next occurrence" },
      { keys: ["⌘", "⇧", "L"], description: "Select all occurrences" },
      { keys: ["⌘", "⇧", "E"], description: "Expand selection" },
      { keys: ["⌘", "⇧", "K"], description: "Delete line" },
    ],
  },
  {
    title: "AI Actions",
    shortcuts: [
      { keys: ["⌘", "K"], description: "Inline AI edit at cursor" },
      { keys: ["⌘", "⇧", "D"], description: "Generate JSDoc comment" },
      { keys: ["⌘", "⇧", "R"], description: "AI Refactor menu (on selection)" },
    ],
  },
  {
    title: "View",
    shortcuts: [
      { keys: ["⌘", "1"], description: "Preview only" },
      { keys: ["⌘", "2"], description: "Code only" },
      { keys: ["⌘", "3"], description: "Split view (both)" },
      { keys: ["⌘", "⇧", "M"], description: "Toggle fullscreen editor" },
    ],
  },
];

interface ShortcutsModalProps {
  open: boolean;
  onClose: () => void;
}

export function ShortcutsModal({ open, onClose }: ShortcutsModalProps) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            transition={{ duration: 0.15 }}
            className="bg-background border border-border rounded-2xl shadow-2xl w-full max-w-3xl overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-border">
              <div className="flex items-center gap-2">
                <Keyboard className="w-5 h-5 text-muted-foreground" />
                <h2 className="font-semibold">Keyboard Shortcuts</h2>
              </div>
              <button
                onClick={onClose}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 grid grid-cols-2 lg:grid-cols-3 gap-6 max-h-[75vh] overflow-y-auto">
              {SHORTCUT_GROUPS.map((group) => (
                <div key={group.title}>
                  <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                    {group.title}
                  </h3>
                  <div className="space-y-1.5">
                    {group.shortcuts.map(({ keys, description }) => (
                      <div key={description} className="flex items-center justify-between py-1.5">
                        <span className="text-sm text-muted-foreground">{description}</span>
                        <div className="flex items-center gap-1 flex-shrink-0 ml-4">
                          {keys.map((key, i) => (
                            <kbd
                              key={i}
                              className="px-2 py-0.5 text-xs bg-muted border border-border rounded font-mono"
                            >
                              {key}
                            </kbd>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div className="px-6 py-3 border-t border-border bg-muted/30 text-xs text-muted-foreground text-center">
              Press <kbd className="px-1.5 py-0.5 bg-muted border border-border rounded font-mono">Esc</kbd> to close
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}

// Hook re-exported from @/hooks/use-shortcuts-modal for backward compatibility
export { useShortcutsModal } from "@/hooks/use-shortcuts-modal";
