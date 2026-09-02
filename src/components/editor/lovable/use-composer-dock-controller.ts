
import { useCallback,useMemo,useState } from "react";
import type { ChatInputHandle } from "@/components/editor/chat-tiptap-input";
import type { RefObject } from "react";
import type { EditorMode } from "@/components/editor/editor-layout";
import type { PreviewRuntimeError } from "@/lib/preview/preview-error-bridge";
import { REPEAT_STEPS,type LovableQueueItem } from "./prompt-queue";
import type { ClarifyQuestion,ClarifySession } from "./clarify-session-card";
import type { LovableFileGenResult } from "./file-gen-result-cards";
import {
answerCurrentClarifyQuestion,
clarifyPersistDelta,
currentClarifyQuestion,
formatClarifyAnswer,
isClarifyDeferredChoice,
isClarifySkipAllText,
normalizeClarifyInterview,
skipAllClarify,
type ClarifyTimelineTurn,
} from "@/lib/ai/chat/clarify-turn";

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
  freeFixesRemaining?: number | null;
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
  /**
   * Mirrors chat-panel's `sendMessage`. The 4th parameter is load-bearing and
   * was missing from this type: the clarify handlers below pass
   * `{ forceBuild: true }`, and without it the enriched answer re-matches the
   * clarify triggers and the questions loop forever. TypeScript reported
   * "Expected 1-2 arguments, but got 4" here and nobody saw it, because the
   * build script is `vite build` with no typecheck step. Do not "fix" that
   * error by deleting the extra arguments — widen this type, as here.
   */
  sendMessage: (
    text: string,
    mode?: EditorMode,
    // Typed `undefined` rather than the real Message[]: this consumer never
    // overrides history, and naming the type here would drag chat-panel's
    // message shape into the composer's public surface for no benefit.
    historyOverride?: undefined,
    opts?: {
      forceBuild?: boolean;
      skipOptimisticUser?: boolean;
      skipUserPersist?: boolean;
      clarifyContinue?: boolean;
      originalPrompt?: string;
      clarifyHistory?: Array<{ question: string; answer: string }>;
      clarifySession?: ClarifySession;
    },
  ) => void | Promise<void>;
  persistClarifyTurns?: (turns: ClarifyTimelineTurn[]) => void;
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
    freeFixesRemaining = null,
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
    persistClarifyTurns,
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

  const onSelectRecoveryChip = useCallback(
    (prompt: string) => {
      const runtimeText = previewRuntimeErrors
        .map((e) => e.message)
        .filter(Boolean)
        .join("\n")
        .slice(0, 600);
      const err = (previewError ?? runtimeText).trim().slice(0, 600);
      setInput(err ? `${prompt}\n\nError:\n${err}` : prompt);
      focusComposer(textareaRef, 0);
      setAutoFixAttempts(0);
    },
    [previewError, previewRuntimeErrors, setAutoFixAttempts, setInput, textareaRef],
  );

  const [answeredClarifyQuestions, setAnsweredClarifyQuestions] = useState<ClarifyQuestion[] | null>(
    null,
  );

  const finishClarifyTurn = useCallback(
    (result: ReturnType<typeof skipAllClarify>) => {
      if (!activeClarifySession) return;
      const before = normalizeClarifyInterview(activeClarifySession);
      persistClarifyTurns?.(clarifyPersistDelta(before, result.session, result.status === "complete"));
      if (result.status === "complete") {
        const answered = result.session.questions.filter((q) => q.answer.trim()) as ClarifyQuestion[];
        setAnsweredClarifyQuestions(answered.length > 0 ? answered : null);
        setActiveClarifySession(null);
        setClarifyFirst(false);
        void sendMessage(result.enrichedPrompt, "build", undefined, {
          forceBuild: true,
          skipOptimisticUser: true,
          skipUserPersist: true,
        });
        return;
      }
      setActiveClarifySession(result.session as ClarifySession);
      focusComposer(textareaRef);
    },
    [activeClarifySession, persistClarifyTurns, sendMessage, setActiveClarifySession, setClarifyFirst, textareaRef],
  );

  const continueLiveInterview = useCallback(
    (answer: string) => {
      if (!activeClarifySession) return;
      const before = normalizeClarifyInterview(activeClarifySession);
      const stepped = answerCurrentClarifyQuestion(before, answer);
      const after = {
        ...stepped,
        questions: stepped.questions.slice(0, stepped.currentIndex),
      };
      persistClarifyTurns?.(clarifyPersistDelta(before, after, false));
      setActiveClarifySession(after as ClarifySession);
      const history = after.questions
        .filter((q) => q.answer.trim())
        .map((q) => ({ question: q.question, answer: formatClarifyAnswer(q) }));
      void sendMessage(answer.trim() || "(skipped)", "chat", undefined, {
        clarifyContinue: true,
        skipOptimisticUser: true,
        skipUserPersist: true,
        originalPrompt: after.originalPrompt,
        clarifyHistory: history,
        clarifySession: after as ClarifySession,
      });
    },
    [activeClarifySession, persistClarifyTurns, sendMessage, setActiveClarifySession],
  );

  return useMemo(
    () => ({
      autoFixing,
      autoFixAttempts,
      maxAutoFixAttempts,
      freeFixesRemaining,
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
      onAnswerClarifyTurn: (answer: string) => {
        if (!activeClarifySession) return;
        const normalized = normalizeClarifyInterview(activeClarifySession);
        if (isClarifySkipAllText(answer)) {
          finishClarifyTurn(skipAllClarify(normalized));
          return;
        }
        const current = currentClarifyQuestion(normalized);
        if (
          current &&
          !normalized.awaitingDetails &&
          isClarifyDeferredChoice(current, answer)
        ) {
          setActiveClarifySession({ ...normalized, awaitingDetails: true } as ClarifySession);
          focusComposer(textareaRef);
          return;
        }
        continueLiveInterview(answer);
      },
      onSkipClarifyCurrent: () => {
        if (!activeClarifySession) return;
        continueLiveInterview("(skipped)");
      },
      onDismissClarify: () => setActiveClarifySession(null),
      answeredClarifyQuestions,
      onDismissAnsweredClarify: () => setAnsweredClarifyQuestions(null),
      onClarifySkipAndBuild: (originalPrompt: string) => {
        if (activeClarifySession) {
          finishClarifyTurn(skipAllClarify(normalizeClarifyInterview(activeClarifySession)));
          return;
        }
        setAnsweredClarifyQuestions(null);
        setActiveClarifySession(null);
        setClarifyFirst(false);
        void sendMessage(originalPrompt, "build", undefined, {
          forceBuild: true,
          skipOptimisticUser: true,
          skipUserPersist: true,
        });
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
      // Empty-state prompts live in LovableChatEmptyState — avoid duplicating chips in the dock.
      showEmptySuggestions: false,
      emptySuggestionChips: contextualEmptyPrompts,
      onSelectEmptySuggestion: onSelectComposerPrompt,
      showRecoveryChips: !streaming && !noCredits && (!!previewError || previewRuntimeErrors.length > 0),
      onSelectRecoveryChip,
    }),
    [
      activeClarifySession,
      answeredClarifyQuestions,
      autoFixAttempts,
      autoFixing,
      freeFixesRemaining,
      contextualEmptyPrompts,
      editingQueueId,
      editingQueueText,
      fileGenResults,
      fillFromPreviewError,
      finishClarifyTurn,
      continueLiveInterview,
      persistClarifyTurns,
      maxAutoFixAttempts,
      messagesLength,
      noCredits,
      onSelectRecoveryChip,
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
      textareaRef,
    ],
  );
}
