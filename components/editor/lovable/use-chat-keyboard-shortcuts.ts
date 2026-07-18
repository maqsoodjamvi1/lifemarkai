"use client";

import { useEffect } from "react";
import type { EditorMode } from "@/components/editor/editor-layout";

export interface UseChatKeyboardShortcutsArgs {
  mode: EditorMode;
  streaming?: boolean;
  onModeChange?: (mode: EditorMode) => void;
  onClearChat: () => void;
  onSearchShortcut: () => void;
  onStopGeneration?: () => void;
}

/** Lovable-parity chat column keyboard shortcuts (⌘⇧K, ⌘F, Alt+P, Esc stop). */
export function useChatKeyboardShortcuts({
  mode,
  streaming,
  onModeChange,
  onClearChat,
  onSearchShortcut,
  onStopGeneration,
}: UseChatKeyboardShortcutsArgs) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "K") {
        e.preventDefault();
        onClearChat();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClearChat]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "f") {
        e.preventDefault();
        onSearchShortcut();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onSearchShortcut]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      if (e.key.toLowerCase() !== "p") return;
      e.preventDefault();
      onModeChange?.(mode === "plan" ? "build" : "plan");
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, onModeChange]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key !== "Escape" || !streaming) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      e.preventDefault();
      onStopGeneration?.();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [streaming, onStopGeneration]);
}
