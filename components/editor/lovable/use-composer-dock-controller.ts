"use client";

import { useCallback, useMemo } from "react";
import type { ChatInputHandle } from "@/components/editor/chat-tiptap-input";
import type { RefObject } from "react";
import type { EditorMode } from "@/components/editor/editor-layout";
import type { PreviewRuntimeError } from "@/lib/preview/preview-error-bridge";
import { REPEAT_STEPS, type LovableQueueItem } from "./prompt-queue";
import type { ClarifySession } from "./clarify-session-card";
import type { LovableFileGenResult } from "./file-gen-result-cards";

export interface UseComposerDockControllerArgs {
  textareaRef: RefObject<ChatInputHandle | null>;
  previewError?: string | null;
  previewRuntimeErrors?: PreviewRuntimeError[];
  noCredits: boolean;
  streaming: boolean;
  messagesLength: number;
  contextualEmptyPrompts: string[];
  autoFixing: boolean;
  autoFixAttempts: number;
  maxAutoFixAttempts: number;
  fileGenResults: LovableFileGenResult[];
  activeClarifySession: ClarifySession | null;
  promptQueue: LovableQueueItem[];
  queuePaused: boolean;
  editingQueueId: string | null;
  editingQueueText: string;
  clarifyFirst: boolean;
  onModeChange?: (mode: EditorMode) => void;
  onOpenPanel?: (panel: string) => void;
  setInput: (value: string | ((prev: string) => string)) => void;
  setAutoFixAttempts: (value: number | ((prev: number) => number)) => void;
  setFileGenResults: React.Dispatch<React.SetStateAction<LovableFileGenResult[]>>;
  setActiveClarifySession: React.Dispatch<React.SetStateAction<ClarifySession | null>>;
  setClarifyFirst: (value: boolean | ((prev: boolean) => boolean)) => void;
  setPromptQueue: React.Dispatch<React.SetStateAction<LovableQueueItem[]>>;
  setQueuePaused: (value: boolean | ((prev: boolean) => boolean)) => void;
  setEditingQueueId: (value: string | null) => void;
  setEditingQueueText: (value: string) => void;
  sendMessage: (text: string, mode?: EditorMode) => void | Promise<void>;
  runtimeErrorsDismissed?: boolean;
  onFixRuntimeErrors?: () => void;
  onDismissRuntimeErrors?: () => void;
}

function focusComposer(textareaRef: RefObject<ChatInputHandle | null>, delayMs = 50) {
  setTimeout(() => textareaRef.current?.focus(), delayMs);
}

/** Bundles LovableComposerDock callbacks so chat-panel JSX stays thin. */
export function useComposerDockController(args: UseComposerDockControllerArgs) {
  const {
    textareaRef,
    previewError,
    previewRuntimeErrors = [],
    noCredits,
    streaming,
    messagesLength,
    contextualEmptyPrompts,
    autoFixing,
    autoFixAttempts,
    maxAutoFixAttempts,
    fileGenResults,
    activeClarifySession,
    promptQueue,
    queuePaused,
    editingQueueId,
    editingQueueText,
    onModeChange,
    onOpenPanel,
    setInput,
    setAutoFixAttempts,
    setFileGenResults,
    setActiveClarifySession,
    setClarifyFirst,
    setPromptQueue,
    setQueuePaused,
    setEditingQueueId,
    setEditingQueueText,
    sendMessage,
  } = args;

  const fillFromPreviewError = useCallback(
    (template: (error: string) => string) => {
      setInput(template((previewError ?? "").slice(0, 600)));
      focusComposer(textareaRef);
      setAutoFixAttempts(0);
    },
    [previewError, setAutoFixAttempts, setInput, textareaRef],
  );

  const onSelectComposerPrompt = useCallback(
    (prompt: string) => {
      setInput(prompt);
      focusComposer(textareaRef, 0);
    },
    [setInput, textareaRef],
  );

  return useMemo(
    () => ({
      autoFixing,
      autoFixAttempts,
      maxAutoFixAttempts,
      previewError: previewError ?? null,
      previewRuntimeErrors,
      runtimeErrorsDismissed: args.runtimeErrorsDismissed,
      onFixRuntimeErrors: args.onFixRuntimeErrors,
      onDismissRuntimeErrors: args.onDismissRuntimeErrors,
      noCredits,
      onSwitchToPlan: () => {
        onModeChange?.("plan");
        fillFromPreviewError(
          (err) =>
            `Please investigate this error without breaking other features. If needed, revert to the last working version and fix from there.\n\nError:\n${err}`,
        );
      },
      onRestoreSnapshot: () => onOpenPanel?.("history"),
      onSuggestWays: () => {
        fillFromPreviewError((err) => `Suggest 3 ways to solve this without changing anything yet:\n\n${err}`);
      },
      onDismissLoopRecovery: () => setAutoFixAttempts(0),
      fileGenResults,
      onDismissFileGen: (id: string) => setFileGenResults((prev) => prev.filter((g) => g.id !== id)),
      activeClarifySession,
      onDismissClarify: () => setActiveClarifySession(null),
      onUpdateClarifyQuestion: (questionId: string, answer: string) =>
        setActiveClarifySession((prev) =>
          prev
            ? {
                ...prev,
                questions: prev.questions.map((cq) =>
                  cq.id === questionId ? { ...cq, answer } : cq,
                ),
              }
            : null,
        ),
      onClarifyBuildNow: (enrichedPrompt: string) => {
        setActiveClarifySession(null);
        setClarifyFirst(false);
        void sendMessage(enrichedPrompt, "build");
      },
      onClarifySkipAndBuild: (originalPrompt: string) => {
        setActiveClarifySession(null);
        setClarifyFirst(false);
        void sendMessage(originalPrompt, "build");
      },
      promptQueue,
      streaming,
      queuePaused,
      editingQueueId,
      editingQueueText,
      onToggleQueuePause: () => setQueuePaused((v) => !v),
      onClearQueue: () => {
        setPromptQueue([]);
        setEditingQueueId(null);
      },
      onMoveQueueUp: (idx: number) =>
        setPromptQueue((prev) => {
          if (idx === 0) return prev;
          const next = [...prev];
          [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
          return next;
        }),
      onMoveQueueDown: (idx: number) =>
        setPromptQueue((prev) => {
          if (idx === prev.length - 1) return prev;
          const next = [...prev];
          [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
          return next;
        }),
      onStartQueueEdit: (id: string, text: string) => {
        setEditingQueueId(id);
        setEditingQueueText(text);
      },
      onEditingQueueTextChange: setEditingQueueText,
      onSaveQueueEdit: (id: string) => {
        if (editingQueueText.trim()) {
          setPromptQueue((prev) =>
            prev.map((q) => (q.id === id ? { ...q, text: editingQueueText.trim() } : q)),
          );
        }
        setEditingQueueId(null);
      },
      onCancelQueueEdit: () => setEditingQueueId(null),
      onCycleQueueRepeat: (id: string) =>
        setPromptQueue((prev) =>
          prev.map((q) => {
            if (q.id !== id) return q;
            const nextRepeat =
              REPEAT_STEPS[(REPEAT_STEPS.indexOf(q.repeat) + 1) % REPEAT_STEPS.length] ?? 1;
            return { ...q, repeat: nextRepeat, remaining: nextRepeat };
          }),
        ),
      onRemoveQueueItem: (id: string) => setPromptQueue((prev) => prev.filter((q) => q.id !== id)),
      showEmptySuggestions: messagesLength === 0 && !streaming,
      emptySuggestionChips: contextualEmptyPrompts,
      onSelectEmptySuggestion: onSelectComposerPrompt,
      showRecoveryChips: !streaming && !noCredits && (!!previewError || previewRuntimeErrors.length > 0),
      onSelectRecoveryChip: onSelectComposerPrompt,
    }),
    [
      activeClarifySession,
      autoFixAttempts,
      autoFixing,
      contextualEmptyPrompts,
      editingQueueId,
      editingQueueText,
      fileGenResults,
      fillFromPreviewError,
      maxAutoFixAttempts,
      messagesLength,
      noCredits,
      onModeChange,
      onOpenPanel,
      onSelectComposerPrompt,
      previewError,
      previewRuntimeErrors.length,
      args.runtimeErrorsDismissed,
      args.onFixRuntimeErrors,
      args.onDismissRuntimeErrors,
      promptQueue,
      queuePaused,
      sendMessage,
      setActiveClarifySession,
      setAutoFixAttempts,
      setClarifyFirst,
      setEditingQueueId,
      setEditingQueueText,
      setFileGenResults,
      setPromptQueue,
      setQueuePaused,
      streaming,
    ],
  );
}
