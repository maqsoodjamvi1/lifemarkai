
import { useEffect } from "react";
import type { EditorMode } from "@/components/editor/editor-layout";

export interface UseChatKeyboardShortcutsArgs {
  mode: EditorMode;
  streaming?: boolean;
  showSearch?: boolean;
  onModeChange?: (mode: EditorMode) => void;
  onClearChat: () => void;
  onSearchShortcut: () => void;
  onBookmarksShortcut?: () => void;
  onScrollToBottom?: () => void;
  onScrollToTop?: () => void;
  onNavigateSearchHit?: (delta?: number) => void;
  /** Alt+↑ / Alt+↓ — step between messages when search is closed. */
  onNavigateMessage?: (delta: number) => void;
  onFocusComposer?: () => void;
  onStopGeneration?: () => void;
  /** Alt/Option+V — toggle voice dictation (Lovable parity: previously only
   *  reachable by clicking the mic button in the composer). */
  onVoiceShortcut?: () => void;
}

/** Lovable-parity chat column keyboard shortcuts (⌘⇧K, ⌘F, Alt+P, Alt+V, Esc stop). */
export function useChatKeyboardShortcuts({
  mode,
  streaming,
  showSearch,
  onModeChange,
  onClearChat,
  onSearchShortcut,
  onBookmarksShortcut,
  onScrollToBottom,
  onScrollToTop,
  onNavigateSearchHit,
  onNavigateMessage,
  onFocusComposer,
  onStopGeneration,
  onVoiceShortcut,
}: UseChatKeyboardShortcutsArgs) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key !== "F3" || !showSearch) return;
      e.preventDefault();
      onNavigateSearchHit?.(e.shiftKey ? -1 : 1);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showSearch, onNavigateSearchHit]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.key.toLowerCase() === "b") {
        const target = e.target as HTMLElement | null;
        if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
          return;
        }
        e.preventDefault();
        onBookmarksShortcut?.();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onBookmarksShortcut]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key !== "End") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      e.preventDefault();
      onScrollToBottom?.();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onScrollToBottom]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key !== "Home") return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      e.preventDefault();
      onScrollToTop?.();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onScrollToTop]);

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
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "f") return;
      const target = e.target as HTMLElement | null;
      const inMonaco =
        !!target?.closest?.(".monaco-editor") ||
        !!document.activeElement?.closest?.(".monaco-editor");
      const inChatPanel = !!target?.closest?.("[data-chat-panel]");

      // ⌘⇧F always opens chat search; bare ⌘F only when focus is in chat
      // so Monaco find-in-file keeps working in the code panel.
      if (e.shiftKey) {
        e.preventDefault();
        onSearchShortcut();
        return;
      }
      if (inMonaco || !inChatPanel) return;
      e.preventDefault();
      onSearchShortcut();
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
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
      if (showSearch) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) {
        return;
      }
      e.preventDefault();
      onNavigateMessage?.(e.key === "ArrowUp" ? -1 : 1);
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showSearch, onNavigateMessage]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      if (e.key.toLowerCase() !== "v") return;
      // Unlike the other Alt+ shortcuts here, this one deliberately does NOT
      // bail out when focus is in an input/textarea: voice dictation is
      // normally triggered from inside the composer itself (that's where the
      // mic button lives), so requiring focus to leave the composer first
      // would defeat the point. Only skip inside Monaco, so the code editor's
      // own Alt-combos keep working there.
      const target = e.target as HTMLElement | null;
      const inMonaco =
        !!target?.closest?.(".monaco-editor") ||
        !!document.activeElement?.closest?.(".monaco-editor");
      if (inMonaco) return;
      e.preventDefault();
      onVoiceShortcut?.();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onVoiceShortcut]);

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      const target = e.target as HTMLElement | null;
      const inField =
        !!target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);

      if (streaming) {
        if (inField) return;
        e.preventDefault();
        onStopGeneration?.();
        return;
      }

      // When idle: Esc clears keyboard message focus and returns to the composer
      // (skip when typing in a field — inline edit / search handle Esc themselves).
      if (showSearch || inField) return;
      e.preventDefault();
      onFocusComposer?.();
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [streaming, showSearch, onStopGeneration, onFocusComposer]);
}
