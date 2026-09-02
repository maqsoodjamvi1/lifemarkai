
import React,{ useState,useRef,useEffect,useMemo,useCallback } from "react";
import { AnimatePresence } from "framer-motion";
import { suggestFollowUps } from "@/lib/ai/follow-up-suggestions";
import { appendAttachedFile, combineAttachedFiles, MAX_ATTACHED_FILES } from "@/lib/editor/chat-attachments";
import { readJSON, readString, writeJSON, writeString, removeKey } from "@/lib/editor/local-storage-json";
import { downloadBlob } from "@/lib/editor/download-blob";
import { shouldClarifyCapabilities } from "@/lib/ai/clarification-intelligence";
import { detectPastedSecret,redactSecret } from "@/lib/security/detect-secret";
import { useToast } from "@/hooks/use-toast";
import { normalizeArrayResponse } from "@/lib/api/array-response";
import { createClient } from "@/lib/supabase/client";
import { createStreamedFilePathTracker } from "@/lib/ai/stream-file-paths";
import type { FileState } from "@/components/editor/diff-viewer";
import type { Project,ProjectFile,Message,Json } from "@/types/database";
import type { EditorMode } from "./editor-layout";
import type { GeneratedFile } from "./file-attachment-card";
import { LovableChatPanelShell } from "./lovable/chat-panel-shell";
import { LovableChatComposerShell,LovableChatInputCard } from "./lovable/chat-composer-shell";
import { LovableComposerMobileSheet } from "./lovable/composer-mobile-sheet";
import { LovableSecurityIssuesBar } from "./lovable/security-issues-bar";
import { LovableLiveLockBanner } from "./lovable/live-lock-banner";
import { LovableChatTimeline,type LovableChatTimelineHandle } from "./lovable/chat-timeline";
import { LovableChatHeader } from "./lovable/chat-header";
import { LovableDraftSwitcher } from "./lovable/draft-switcher";
import { LovableChatHeaderStatus } from "./lovable/composer-estimated-credits";
import { LovableScrollToBottom } from "./lovable/scroll-to-bottom";
import { LovableContinueBanner } from "./lovable/continue-banner";
import { LovableDraftRestoreBanner } from "./lovable/draft-restore-banner";
import { LovableChatSearchBar,type ChatSearchMsgModeFilter,type ChatSearchRoleFilter } from "./lovable/chat-search-bar";
import { LovableThreadItem } from "./lovable/thread-item";
import { LovableContextSummaryBanner } from "./lovable/context-summary-banner";
import type { LovableFileDiffEntry } from "./lovable/types";
import type { LovableFileGenResult } from "./lovable/file-gen-result-cards";
import { LOVABLE_PROMPT_TEMPLATES,LOVABLE_DESIGN_DIRECTIONS_SLASH_KEY,LOVABLE_PUBLISH_SLASH_KEY } from "./lovable/prompt-templates";
import type { LovableMentionItem } from "./lovable/composer-mention-autocomplete";
import { mergeAgentStep,type AgentTaskStep } from "./lovable/agent-step-utils";
import { groupIntoThreads,getDisplayMessageContent } from "./lovable/message-utils";
import { LovableChatStreamingFooter } from "./lovable/streaming-footer";
import { LovableChatTimelineHeader } from "./lovable/chat-timeline-header";
import { LovableComposerDock } from "./lovable/composer-dock";
import { LovableComposerPreInput } from "./lovable/composer-pre-input";
import { LovableComposerInputArea } from "./lovable/composer-input-area";
import { LovableComposerSharePreview } from "./lovable/composer-share-preview";
import { frameworkForMobileMode,initialWebFramework,isRnFramework } from "@/lib/editor/mobile-framework";
import { LovableChatModals } from "./lovable/chat-modals";
import { useComposerDockController } from "./lovable/use-composer-dock-controller";
import { useChatKeyboardShortcuts } from "./lovable/use-chat-keyboard-shortcuts";
import type { VoiceModeHandle } from "@/components/editor/voice-mode";
import { useThreadMessageProps } from "./lovable/use-thread-message-props";
import { extractStreamingReasoning } from "./lovable/streaming-utils";
import type { ClarifySession,ClarifyQuestion } from "./lovable/clarify-session-card";
import { currentClarifyQuestion,normalizeClarifyInterview,buildClarifyTimeline,messageClarifyTurnId,appendLiveClarifyQuestion,buildClarifyEnrichedPrompt,liveClarifyQuestionTurn,CLARIFY_BUILD_LEAD_IN,type ClarifyTimelineTurn } from "@/lib/ai/chat/clarify-turn";
import type { LovableQueueItem } from "./lovable/prompt-queue";
import type { LovableSecretBannerState } from "./lovable/composer-secret-banner";
import { parseLineRefs,removeLineRefFromInput } from "@/lib/editor/parse-line-refs";
import { describeAiFailure,readErrorBody } from "@/lib/editor/ai-failure";
import { formatGuestCommentsForAi } from "@/lib/editor/format-guest-comments";
import { formatErrorsForHealing } from "@/lib/preview/preview-error-bridge";
import type { ChatSearchMode } from "@/lib/editor/search-chat-messages";
import { buildLovableChatDayJumps,lovableChatDayKey } from "@/components/editor/lovable/chat-day-utils";
import {
LIFEMARK_CHAT_SETTINGS_EVENT,
type LifemarkChatSettingsAction,
} from "@/components/editor/lovable/chat-settings-events";
import type { LovableFileGenFormat } from "./lovable/composer-file-gen-picker";
import { useGuestCommentCount } from "@/hooks/use-guest-comment-count";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { AGENT_MIN_CREDITS } from "@/lib/ai/credit-cost";
import { findMissingPackages,syncPackageJsonDeps,describeRejectedPackages } from "@/lib/ai/npm-auto-install";
import { classifyBuildIntent,isInformationalQuery,isOpenEndedGreenfieldStart,isSmallSurgicalEdit,shouldClarifyBeforeBuild,type BuildIntent } from "@/lib/ai/build-intent";
import { buildDesignBrief,shouldOfferDesignPreviews,type DesignPreviewDirection } from "@/lib/ai/design-previews";
import type { AgentStep } from "@/lib/ai/agent";
import {
buildProjectContextBlock,
enrichFollowUpSuggestions,
getEmptyProjectPrompts,
getNoCreditsPrompts,
getPreviewErrorPrompts,
inferProjectStage,
resolvePromptMode,
resolveSmartModel,
looksLikeEditRequest,
DEFAULT_CODING_MODEL,
} from "@/lib/ai/editor-intelligence";
import { countUserAuthoredFiles,isGreenfieldProject } from "@/lib/ai/scaffold-files";
import { isNoisePreviewError,type PreviewRuntimeError } from "@/lib/preview/preview-error-bridge";
import {
getAutoFixAttempts,
recordAutoFixAttempt,
clearAutoFixLedger,
} from "@/lib/preview/autofix-ledger";
import { appendPreviewDiagnosis } from "@/lib/preview/diagnose-preview";
import { GENERATION_PREVIEW_WAIT_MS,waitForPreviewSuccess } from "@/lib/preview/wait-for-preview-success";
import {
getOpenRouterModelLabel,
type OpenRouterModelId,
} from "@/lib/ai/openrouter-models";
import {
CHAT_INPUT_CAPABILITIES,
createLongPasteAttachment,
detectPromptSecret,
redactPromptSecrets,
shouldAttachLongPaste,
type SecretAssignment,
} from "@/lib/ai/chat-capabilities";
import { SUPPORTED_DOCUMENT_EXTENSIONS } from "@/lib/ai/document-extract";
import type { SubagentStep } from "@/lib/ai/subagents";
import {
initialBuildActivitySteps,
applyBuildIntentLabel,
onBuildFileProgress,
finalizeBuildActivity,
type BuildActivityStep,
} from "@/lib/ai/build-activity";
import { useAIStreamChat } from "@/hooks/use-ai-stream-chat";

/** Label AND identity for the scope-guard override chip — compared by value. */
const SCOPE_OVERRIDE_CHIP = "Build it anyway";
/** Stable empty value for when suggestionChipsEnabled is off — avoids a fresh {} every render. */
const EMPTY_SUGGESTIONS: Record<string, string[]> = {};

// UI discovery list only. The provider accepts any valid OpenRouter slug.
type AIModel = OpenRouterModelId;

interface ChatPanelProps {
  project: Project;
  messages: Message[];
  files: ProjectFile[];
  activeFile?: ProjectFile | null;
  mode: EditorMode;
  credits: number;
  starterPrompt?: string;
  previewError?: string | null;
  previewRuntimeErrors?: PreviewRuntimeError[];
  pendingFixPrompt?: string | null;
  /** When set, inserts "@filename " into the chat input and focuses it */
  pendingFileRef?: ProjectFile | null;
  onMessagesUpdate: (msgs: Message[]) => void;
  onFilesUpdate: (files: ProjectFile[], opts?: { replace?: boolean }) => void;
  onCreditsUpdate: (credits: number) => void;
  onAutoFixComplete?: () => void;
  onPendingFixConsumed?: () => void;
  onPendingFileRefConsumed?: () => void;
  /** Called whenever streaming/generation state changes — used by PreviewPanel to show shimmer */
  onStreamingChange?: (streaming: boolean, fileCount?: number) => void;
  /** Called when user changes mode via the Build ∨ dropdown in the input */
  onModeChange?: (mode: EditorMode) => void;
  /** When set, pre-fills the chat input with this prompt (and optional image) — used for file-to-app */
  pendingBuildFromFile?: { prompt: string; imageBase64?: string } | null;
  onPendingBuildFromFileConsumed?: () => void;
  /** Called when user approves a plan — switches to build/agent mode */
  onApprovePlan?: (planMarkdown: string) => void;
  /** When true (Live environment), AI edits are blocked and the input is disabled */
  isLocked?: boolean;
  /** Open a secondary panel on the right (History, Knowledge, GitHub, etc.) */
  onOpenPanel?: (panel: string) => void;
  /** Static security-finding count — drives the "Try to fix all" bar above the input. */
  securityIssueCount?: number;
  /** Focus the preview pane (Lovable Details/Preview card) */
  onFocusPreview?: () => void;
  /** Sync project fields after inline edits (e.g. add-to-knowledge). */
  onProjectUpdate?: (updates: Partial<Project>) => void;
  /** Toggle visual edit mode on the preview iframe */
  onVisualEditToggle?: () => void;
  isVisualEditActive?: boolean;
  /** Narrow viewport — docks composer as a bottom sheet */
  isMobile?: boolean;
  /** Show skeleton shimmer while messages are being fetched from the server */
  isMessagesLoading?: boolean;
  /** When true, older messages exist beyond the SSR batch */
  hasMoreMessages?: boolean;
}

interface ProjectPrivateContext {
  context_summary: string | null;
  context_summary_covers: number | null;
}

type FileDiffEntry = LovableFileDiffEntry;

/** An item sitting in the prompt queue while AI is busy */
type QueueItem = LovableQueueItem;

const MAX_AUTO_FIX_ATTEMPTS = 3;

function clarifySessionFromQuestions(
  originalPrompt: string,
  questions: Array<{
    id?: string;
    question: string;
    type?: string;
    kind?: string;
    multiple?: boolean;
    options?: ClarifyQuestion["options"];
  }>,
  openEnded = false,
): ClarifySession {
  return {
    originalPrompt,
    currentIndex: 0,
    openEnded,
    questions: questions.map((q) => ({
      id: q.id ?? `q-${Math.random().toString(36).slice(2, 8)}`,
      question: q.question,
      type: q.type === "choice" ? "choice" : "text",
      kind: (q.kind as ClarifyQuestion["kind"]) ?? "general",
      options: q.options,
      multiple: q.multiple === true,
      answer: "",
    })),
  };
}

function syntheticClarifyMessage(
  projectId: string,
  id: string,
  role: "user" | "assistant",
  content: string,
  extra?: Record<string, unknown>,
): Message {
  return {
    id,
    project_id: projectId,
    role,
    content,
    tokens_used: null,
    model: null,
    mode: "chat",
    metadata: { clarify: true, ...extra } as Json,
    rating: null,
    created_at: new Date().toISOString(),
  };
}

function ChatPanelImpl({
  project, messages, files, activeFile, mode, credits, starterPrompt,
  previewError, previewRuntimeErrors = [], pendingFixPrompt, pendingFileRef,
  onMessagesUpdate, onFilesUpdate, onCreditsUpdate,
  onAutoFixComplete, onPendingFixConsumed, onPendingFileRefConsumed,
  onStreamingChange, onModeChange, onApprovePlan,
  pendingBuildFromFile, onPendingBuildFromFileConsumed,
  isLocked = false, onOpenPanel, onFocusPreview, onProjectUpdate,
  onVisualEditToggle, isVisualEditActive = false,
  isMobile = false,
  isMessagesLoading = false,
  hasMoreMessages: hasMoreMessagesInitial = false,
  securityIssueCount = 0,
}: ChatPanelProps) {
  const intelCtx = useMemo(
    () => ({
      // Every consumer of `fileCount` — the patch/agent router, the model
      // picker, the free-build check — is asking "does this project already
      // contain work?". `files.length` answers a different question, and on a
      // new project answers it wrong by 25. Fixed once, here at the source,
      // rather than at each of the dozen places that reads it.
      fileCount: countUserAuthoredFiles(files),
      hasPreviewError: !!previewError,
      hasCredits: credits > 0,
      activeFilePath: activeFile?.path,
      framework: project.framework,
      currentMode: mode,
      files,
    }),
    [files, previewError, credits, activeFile?.path, project.framework, mode],
  );

  const { consume: consumeAIStream } = useAIStreamChat({
    projectId: project.id,
    files,
    onFilesChange: onFilesUpdate,
    applyFileUpdates: false,
  });

  const { toast } = useToast();
  const messagesRef = useRef(messages);
  messagesRef.current = messages;

  const persistClarifyTurns = useCallback(
    (turns: ClarifyTimelineTurn[]) => {
      if (turns.length === 0) return;
      const existing = new Set<string>();
      for (const message of messagesRef.current) {
        const turnId = messageClarifyTurnId(message.metadata, message.id);
        if (turnId) existing.add(turnId);
      }
      const fresh = turns.filter((turn) => !existing.has(turn.id));
      if (fresh.length === 0) return;
      const local = fresh.map((turn) =>
        syntheticClarifyMessage(project.id, turn.id, turn.role, turn.content, {
          clarifyTurnId: turn.id,
          ...(turn.ack ? { clarifyAck: turn.ack } : {}),
          ...(turn.id === "clarify-build-lead-in" ? { clarifyLeadIn: true } : {}),
        }),
      );
      const next = [...messagesRef.current, ...local];
      messagesRef.current = next;
      onMessagesUpdate(next);
      void fetch(`/api/projects/${project.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: local.map((message) => ({
            role: message.role,
            content: message.content,
            mode: "chat",
            metadata: message.metadata,
          })),
        }),
      }).catch(() => {
        /* best-effort — local timeline already has the turns */
      });
    },
    [onMessagesUpdate, project.id],
  );

  const refreshProjectFiles = useCallback(async () => {
    const res = await fetch(`/api/projects/${project.id}/files`, { cache: "no-store" });
    if (!res.ok) throw new Error("Failed to refresh project files");
    const updatedFiles = (await res.json()) as ProjectFile[];
    if (!Array.isArray(updatedFiles)) {
      throw new Error("Invalid files payload");
    }
    // Never wipe a live project with an empty refresh (RLS / transient empty).
    if (updatedFiles.length === 0 && files.length > 0) {
      return files;
    }
    // Replace (not merge) so deleted/renamed paths don't linger in preview — Lovable parity.
    // Layout owns `lifemark-refresh-preview`; do not dispatch it here.
    onFilesUpdate(updatedFiles, { replace: true });
    return updatedFiles;
  }, [files, onFilesUpdate, project.id]);

  const contextualEmptyPrompts = useMemo(() => {
    if (credits <= 0) return getNoCreditsPrompts();
    if (previewError) return getPreviewErrorPrompts(previewError);
    return getEmptyProjectPrompts(inferProjectStage(files), project.framework);
  }, [files, previewError, credits, project.framework]);

  const composerDraftKey = `lifemark-composer-draft-${project.id}`;
  const [input, setInput] = useState("");
  const [showDraftBanner, setShowDraftBanner] = useState(false);
  const draftHydratedRef = useRef(false);
  // Lovable parity: "drafts persist across refresh" — same guarantee the
  // composer draft above already has, extended to the clarify-question
  // wizard. Same hydrated-ref-guard pattern as composerDraftKey just above
  // it, backed by the shared readJSON/writeJSON/removeKey localStorage
  // helpers (local-storage-json.ts) rather than raw localStorage calls.
  const clarifyDraftKey = `lifemark-clarify-draft-${project.id}`;
  const clarifyDraftHydratedRef = useRef(false);
  // "Team" toggle: when on, Agent-mode sends run the full multi-agent Editor
  // Intelligence orchestrator (in the Intelligence panel) instead of the
  // single-model /api/ai/agent route. Only affects Agent mode.
  const [multiAgent, setMultiAgent] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [clarifyStreaming, setClarifyStreaming] = useState(false);
  /** True when this send applies streamed XML files live (build/agent/patch). */
  const liveFileApplyRef = useRef(false);

  /** Tracks when the current build started so we know its duration for desktop notifications */
  const buildStartTimeRef = useRef<number | null>(null);
  const streamGenerationStartedAtRef = useRef(0);
  /** Wrapper that also notifies the parent layout so PreviewPanel can show shimmer */
  function setStreamingWithCallback(value: boolean, fileCount?: number) {
    setStreaming(value);
    onStreamingChange?.(value, fileCount);
    if (value) {
      buildStartTimeRef.current = Date.now();
      streamGenerationStartedAtRef.current = Date.now();
    } else if (buildStartTimeRef.current !== null) {
      const elapsed = Date.now() - buildStartTimeRef.current;
      buildStartTimeRef.current = null;
      // Fire a desktop notification if the build took >10s and permission is granted.
      // Some contexts have `Notification` present with permission already
      // "granted" but still refuse the raw constructor — an installed PWA
      // window, some Android/Chrome configurations — and require
      // ServiceWorkerRegistration.showNotification() instead, which this app
      // does not register a service worker for. Feature-detecting the
      // constructor's presence does not catch this; it throws at call time
      // ("Illegal constructor. Use ServiceWorkerRegistration.showNotification()
      // instead."), observed in production (Sentry
      // JAVASCRIPT-TANSTACKSTART-REACT-4). This is a best-effort convenience
      // notification, not core functionality, so a context that refuses it
      // should fail silently rather than throw an uncaught error.
      if (elapsed > 10_000 && typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          try {
            new Notification("Build complete ✓", {
              body: `Finished in ${Math.round(elapsed / 1000)}s — your app is ready to preview.`,
              icon: "/favicon.ico",
              tag: "lifemark-build",
            });
          } catch {
            // Unsupported in this context (see comment above) — the build
            // still completed and the in-app UI already reflects that;
            // losing only the optional desktop notification is fine.
          }
        }
      }
    }
  }
  // Request notification permission once (only if user hasn't decided yet)
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      // Don't ask immediately — wait until first build starts
    }
  }, []);

  const [starterFired, setStarterFired] = useState(false);
  // Push the chat panel above the on-screen keyboard on mobile. 0 on desktop.
  const keyboardInset = useKeyboardInset();
  const [streamingContent, setStreamingContent] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [copiedLinkId, setCopiedLinkId] = useState<string | null>(null);
  const [copiedAll, setCopiedAll] = useState(false);
  const [allCodeBlocksCollapsed, setAllCodeBlocksCollapsed] = useState(false);
  const [messageDiffs, setMessageDiffs] = useState<Record<string, FileDiffEntry[]>>({});
  // Skills auto-attached by the chat API for the *currently-streaming* response.
  // On data.done we copy this into messageSkills[assistantId] for persistence.
  const [pendingSkills, setPendingSkills] = useState<Array<{ id: string; name: string; reason?: string }>>([]);
  const [messageSkills, setMessageSkills] = useState<Record<string, Array<{ id: string; name: string; reason?: string }>>>({});
  const [expandedDiffs, setExpandedDiffs] = useState<Set<string>>(new Set());
  const modelManuallySelectedRef = useRef(false);
  const [selectedModel, setSelectedModel] = useState<AIModel>(DEFAULT_CODING_MODEL as AIModel);
  const autoModel = useMemo(
    () => resolveSmartModel(mode, intelCtx, input),
    [mode, intelCtx, input],
  );
  const activeModelLabel = getOpenRouterModelLabel(
    modelManuallySelectedRef.current ? selectedModel : autoModel,
  );
  const [autoFixing, setAutoFixing] = useState(false);
  const [autoFixAttempts, setAutoFixAttempts] = useState(0);
  const [lastFixedError, setLastFixedError] = useState<string | null>(null);
  // The prompt the scope guard paused on, held so the user can override it with
  // one click. Without this the guard is a dead end: its message invites you to
  // say "go ahead", but a fresh "go ahead" is just a new prompt that carries no
  // forceBuild flag and no memory of what it was agreeing to.
  const [scopeHeldPrompt, setScopeHeldPrompt] = useState<string | null>(null);
  // Deliberately still a single slot — the AI vision request this feeds is
  // built for exactly one image; see attachMultipleFiles for why a
  // multi-image selection only keeps the first, with the user told so.
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedImageName, setAttachedImageName] = useState<string | null>(null);
  const [chatAnnotateOpen, setChatAnnotateOpen] = useState(false);
  // Up to MAX_ATTACHED_FILES documents/code files per message (Lovable
  // parity — was a single slot before this). Every existing single-slot
  // consumer downstream (the prompt queue's wire shape, chat-state
  // persistence, the actual send payload) is unchanged: combineAttachedFiles
  // (src/lib/editor/chat-attachments.ts, unit-tested there) merges this
  // array back into the same { name, content } | null shape those call
  // sites already expect, so a 0- or 1-file selection behaves
  // byte-identically to before, and 2+ files arrive as one merged document
  // with clear per-file headers rather than requiring every downstream
  // consumer (queue persistence, the AI request builder) to be taught a new
  // multi-attachment wire format sight-unseen.
  const [attachedFiles, setAttachedFiles] = useState<{ name: string; content: string }[]>([]);
  const combinedAttachedText = useMemo(() => combineAttachedFiles(attachedFiles), [attachedFiles]);
  function addAttachedFile(file: { name: string; content: string }) {
    setAttachedFiles((prev) => {
      const next = appendAttachedFile(prev, file);
      if (next.length === prev.length) {
        toast({
          title: "Attachment limit reached",
          description: `You can attach up to ${MAX_ATTACHED_FILES} files per message. Remove one before adding another.`,
          variant: "destructive",
        });
      }
      return next;
    });
  }
  const [contextFiles, setContextFiles] = useState<ProjectFile[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [filePickerSearch, setFilePickerSearch] = useState("");
  const MAX_CONTEXT_FILES = 5;
  const [isDragging, setIsDragging] = useState(false);
  // React Native / Expo framework toggle — hydrated + persisted on project.framework
  // (rules live in lib/editor/mobile-framework, unit-tested)
  const [mobileMode, setMobileMode] = useState(() => isRnFramework(project.framework));
  // "react", not "web". This value is PATCHed straight onto projects.framework,
  // and projects_framework_check has never accepted "web" — so for any project
  // that STARTED in mobile mode (or had a null framework) the ref held "web",
  // and toggling mobile mode back off sent a value Postgres rejects. The update
  // failed and the project stayed react-native. "react" is the same fallback
  // createProject uses when a requested framework is not in ALLOWED_FRAMEWORKS.
  //
  // Typed as Project["framework"] so the union survives to the onProjectUpdate
  // call below; inferring `string` there is what hid this for so long.
  const webFrameworkRef = useRef<Project["framework"]>(
    initialWebFramework(project.framework),
  );
  useEffect(() => {
    setMobileMode(isRnFramework(project.framework));
    if (project.framework && !isRnFramework(project.framework)) {
      webFrameworkRef.current = project.framework;
    }
  }, [project.framework]);
  const persistMobileMode = useCallback(
    (next: boolean) => {
      setMobileMode(next);
      const framework = frameworkForMobileMode(next, webFrameworkRef.current);
      onProjectUpdate?.({ framework });
      void fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ framework }),
      }).catch(() => {/* best-effort */});
    },
    [onProjectUpdate, project.id],
  );
  // URL scraping ("Chat with URL") state
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapedMeta, setScrapedMeta] = useState<{ title: string; description: string; ogImage: string; textContent: string } | null>(null);
  const [designPreviewOpen, setDesignPreviewOpen] = useState(false);
  const [pendingDesignPrompt, setPendingDesignPrompt] = useState<string | null>(null);
  const skipDesignPreviewOnceRef = useRef(false);
  /** True while overlay/manual heal is running — blocks competing auto-fix. */
  const healActiveRef = useRef(false);
  /**
   * True once a heal has handed off to the post-stream settle watcher
   * (`waitForPreviewSuccess`), which resolves the heal asynchronously up to
   * 12s AFTER the stream itself finishes. Without this flag the stream's
   * `finally` would see `healActiveRef` still latched, conclude the repair had
   * died, and fire heal-failed while a perfectly good repair was still
   * settling — turning every successful self-repair into a false "Preview
   * paused". The watcher clears it when it settles either way.
   */
  const healSettlingRef = useRef(false);
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editInput, setEditInput] = useState("");
  // Per-message per-file accept/revert state
  const [fileStates, setFileStates] = useState<Record<string, Record<string, FileState>>>({});
  // Undo: track whether there's a snapshot to undo to
  const [canUndo, setCanUndo] = useState(false);
  const [undoing, setUndoing] = useState(false);
  // Real-time file generation progress
  const [streamingFiles, setStreamingFiles] = useState<string[]>([]);
  const [thoughtSeconds, setThoughtSeconds] = useState(0);
  const [secretBanner, setSecretBanner] = useState<LovableSecretBannerState | null>(null);
  const [publishBannerDismissed, setPublishBannerDismissed] = useState(false);
  const [guestCommentsBannerDismissed, setGuestCommentsBannerDismissed] = useState(false);
  const [runtimeErrorsDismissed, setRuntimeErrorsDismissed] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  // Follow-up suggestion chips — keyed by assistant message id
  const [suggestions, setSuggestions] = useState<Record<string, string[]>>({});
  // Lovable parity: "Suggestions ... can be toggled off in account
  // settings." Chips themselves were always fully built (generation,
  // rendering, click-to-send) — there was just never an off switch, so they
  // were unconditionally always on. Defaults true (matches today's actual
  // behavior for every existing user) and is fetched once alongside the
  // user id below; see profiles.chat_prefs (migration 179) and the
  // Appearance section of settings-page.tsx for where it's set.
  const [suggestionChipsEnabled, setSuggestionChipsEnabled] = useState(true);
  // Multi-role test chips — appear after agent/build runs that touched 5+ files
  // when the project mentions roles (Admin, User, Investor, etc.).
  const [roleTestChips, setRoleTestChips] = useState<Record<string, string[]>>({});
  // @file mention autocomplete
  const [mentionQuery, setMentionQuery] = useState<string | null>(null); // null = closed
  const [mentionCursor, setMentionCursor] = useState(0);
  // Collaborator @mention
  const [collaborators, setCollaborators] = useState<{ id: string; display: string; email: string }[]>([]);
  const [privateContext, setPrivateContext] = useState<ProjectPrivateContext | null>(null);
  useEffect(() => {
    let cancelled = false;
    const supabase = createClient();

    void Promise.resolve(supabase
      .from("project_private_context")
      .select("context_summary, context_summary_covers")
      .eq("project_id", project.id)
      .maybeSingle())
      .then(({ data }: { data: ProjectPrivateContext | null }) => {
        if (!cancelled) setPrivateContext(data ?? null);
      })
      .catch(() => {
        if (!cancelled) setPrivateContext(null);
      });

    return () => {
      cancelled = true;
    };
  }, [project.id]);

  useEffect(() => {
    const supabase = createClient();
    void Promise.resolve(supabase
      .from("collaborators")
      .select("user_id, role, profiles!collaborators_user_id_fkey(id, full_name, email)")
      .eq("project_id", project.id))
      .then(({ data }) => {
        if (!data) return;
        setCollaborators(
          data
            .filter((c) => c.profiles)
            .map((c) => ({
              id: c.user_id,
              display: c.profiles!.full_name ?? c.profiles!.email.split("@")[0],
              email: c.profiles!.email,
            }))
        );
      })
      .catch(() => {});
   
  }, [project.id]);
  // Emoji reactions: { [messageId]: Set<emoji> } — persisted in message.metadata.reactions
  const [reactions, setReactions] = useState<Record<string, Set<string>>>(() => {
    const initial: Record<string, Set<string>> = {};
    messages.forEach((m) => {
      const raw = (m.metadata as { reactions?: string[] } | null)?.reactions;
      if (Array.isArray(raw) && raw.length > 0) initial[m.id] = new Set(raw);
    });
    return initial;
  });

  useEffect(() => {
    setReactions((prev) => {
      let changed = false;
      const next = { ...prev };
      messages.forEach((m) => {
        const raw = (m.metadata as { reactions?: string[] } | null)?.reactions;
        if (Array.isArray(raw) && raw.length > 0 && !next[m.id]) {
          next[m.id] = new Set(raw);
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [messages]);

  async function toggleReaction(messageId: string, emoji: string) {
    const prevSet = reactions[messageId] ?? new Set<string>();
    const nextSet = new Set(prevSet);
    if (nextSet.has(emoji)) nextSet.delete(emoji);
    else nextSet.add(emoji);
    const arr = [...nextSet];
    setReactions((prev) => {
      const n = { ...prev };
      if (arr.length === 0) delete n[messageId];
      else n[messageId] = nextSet;
      return n;
    });
    const msg = messages.find((m) => m.id === messageId);
    const baseMeta = (msg?.metadata as Record<string, unknown> | null) ?? {};
    const meta = { ...baseMeta, reactions: arr.length > 0 ? arr : undefined };
    if (!meta.reactions) delete meta.reactions;
    onMessagesUpdate(
      messages.map((m) => (m.id === messageId ? { ...m, metadata: meta } : m)),
    );
    await fetch(`/api/projects/${project.id}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metadata: { reactions: arr.length > 0 ? arr : null }, mergeMetadata: true }),
    }).catch(() => {/* best-effort */});
  }

  // Message ratings: { [messageId]: 1 | -1 }
  const [ratings, setRatings] = useState<Record<string, 1 | -1>>(() => {
    const initial: Record<string, 1 | -1> = {};
    messages.forEach((m) => { if (m.rating) initial[m.id] = m.rating as 1 | -1; });
    return initial;
  });
  // Hydrate persisted ratings when messages load asynchronously — the
  // useState initializer above only sees the first-render (often empty) list.
  // Only fills ids we haven't seen, and rateMessage keeps the messages prop
  // in sync, so a rating the user toggled off is never resurrected.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate rating cache from loaded messages
    setRatings((prev) => {
      let changed = false;
      const next = { ...prev };
      messages.forEach((m) => {
        const r = m.rating as 1 | -1 | null;
        if (r && next[m.id] === undefined) { next[m.id] = r; changed = true; }
      });
      return changed ? next : prev;
    });
  }, [messages]);
  // Clarify-first mode
  const [clarifyFirst, setClarifyFirst] = useState(true);
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [skills, setSkills] = useState<{ custom: Array<{id:string;name:string;description:string|null;prompt:string;icon:string;tags:string[];use_count:number}>; builtin: Array<{id:string;name:string;description:string|null;prompt:string;icon:string;tags:string[];}> }>({ custom: [], builtin: [] });
  const [skillsLoaded, setSkillsLoaded] = useState(false);
  const [skillSearch, setSkillSearch] = useState("");
  // Cross-project @mention
  const [crossProjects, setCrossProjects] = useState<Array<{id:string;name:string;slug:string}>>([]);
  const [crossProjectFiles, setCrossProjectFiles] = useState<Record<string,Array<{path:string}>>>({});
  const [crossProjectsLoaded, setCrossProjectsLoaded] = useState(false);
  const [activeClarifySession, setActiveClarifySession] = useState<ClarifySession | null>(null);
  const clarifySessionRef = useRef<ClarifySession | null>(null);
  clarifySessionRef.current = activeClarifySession;
  const answerClarifyRef = useRef<(answer: string) => void>(() => {});
  const skipClarifyCurrentRef = useRef<() => void>(() => {});
  const skipClarifyAllRef = useRef<() => void>(() => {});
  const composerPlaceholder = isLocked
    ? "Switch to Test environment to edit…"
    : activeClarifySession?.awaitingDetails
      ? "Describe it in a sentence…"
      : streaming
        ? activeClarifySession
          ? "Thinking…"
          : "Queue follow-up..."
        : currentClarifyQuestion(
            activeClarifySession ? normalizeClarifyInterview(activeClarifySession) : null,
          )?.type === "text"
          ? "Type your answer…"
          : activeClarifySession
            ? "Answer in your own words…"
            : "Ask LifemarkAI to build or edit…";
  // Step-plan approval: msgId -> Set<stepIndex>
  const [approvedSteps, setApprovedSteps] = useState<Record<string, Set<number>>>({});
  // Patch mode: track how many patches were applied per assistant message
  const [patchCounts, setPatchCounts] = useState<Record<string, number>>({});
  const [messageChangedPaths, setMessageChangedPaths] = useState<Record<string, string[]>>({});

  // Connector approval card (Lovable parity): blocked agent write via a
  // project connector awaits Allow once / Always allow / Skip.
  const [connectorApproval, setConnectorApproval] = useState<{
    connector: string; method: string; path: string; summary: string; retryPrompt: string;
  } | null>(null);

  // Cloud ops card (Lovable parity): pause / wake / resize instance from chat
  const [cloudAction, setCloudAction] = useState<{
    kind: "pause" | "resume" | "resize"; currentTier: string; paused: boolean; actionable: boolean;
  } | null>(null);
  const [cloudTierPick, setCloudTierPick] = useState<string>("tiny");

  // Prompt queue — messages queued while AI is streaming
  const [promptQueue, setPromptQueue] = useState<QueueItem[]>([]);
  const [queuePaused, setQueuePaused] = useState(() => readString(`lifemark-queue-paused-${project.id}`) === "1");
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [editingQueueText, setEditingQueueText] = useState("");
  // Agent task step visibility
  const [agentSteps, setAgentSteps] = useState<AgentTaskStep[]>([]);
  const [subagentSteps, setSubagentSteps] = useState<SubagentStep[]>([]);
  const [previewVerify, setPreviewVerify] = useState<{ ok: boolean; checks: Array<{ name: string; pass: boolean; detail?: string }> } | null>(null);
  const [messageCredits, setMessageCredits] = useState<Record<string, number>>({});
  const [buildStatus, setBuildStatus] = useState<BuildIntent | null>(null);
  const runQuickPreviewVerify = useCallback((delayMs = 900) => {
    window.setTimeout(() => {
      let previewUrl: string | undefined;
      try {
        previewUrl = sessionStorage.getItem("lifemark-live-preview-url") || undefined;
      } catch { /* private mode */ }
      void fetch(`/api/projects/${project.id}/preview-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(previewUrl ? { previewUrl } : {}),
      })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("preview verify failed"))))
        .then((result) => setPreviewVerify(result))
        .catch(() => setPreviewVerify(null));
    }, delayMs);
  }, [project.id]);

  /** After files land: wait until THIS generation's preview paints, then verify + screenshot. */
  const closeGenerationLoop = useCallback(async (
    captureId: string,
    skipScreenshot = false,
    notBeforeMs?: number,
  ) => {
    const previewOk = await waitForPreviewSuccess(
      GENERATION_PREVIEW_WAIT_MS,
      typeof window === "undefined" ? new EventTarget() : window,
      notBeforeMs,
    );
    runQuickPreviewVerify(previewOk ? 0 : 400);
    if (!skipScreenshot) {
      window.dispatchEvent(new CustomEvent("lifemark-request-screenshot", { detail: { messageId: captureId } }));
    }
  }, [runQuickPreviewVerify]);
  // Post-build pipeline status — backend wiring + self-verification progress
  // streamed from the server (wiring_status / verify_status events).
  const [postBuildStatus, setPostBuildStatus] = useState<string | null>(null);
  const [buildActivitySteps, setBuildActivitySteps] = useState<BuildActivityStep[]>([]);
  const [messageBuildActivity, setMessageBuildActivity] = useState<Record<string, BuildActivityStep[]>>({});
  /** Sync mirror of buildActivitySteps — safe to read inside SSE loop without stale closures. */
  const buildActivityStepsRef = useRef<BuildActivityStep[]>([]);
  const applyBuildSteps = useCallback((next: BuildActivityStep[] | ((prev: BuildActivityStep[]) => BuildActivityStep[])) => {
    const resolved = typeof next === "function" ? next(buildActivityStepsRef.current) : next;
    buildActivityStepsRef.current = resolved;
    setBuildActivitySteps(resolved);
  }, []);

  // Tracks file paths the SERVER streamed via `streamedFile` SSE events.
  // Persists across re-renders so we can re-fetch them from the DB on
  // data.done — even when parseAIResponse on the server returned no files.
  // Reset to a fresh Set at the start of each send (see handleSend).
  const serverStreamedPathsRef = useRef<Set<string>>(new Set<string>());

  const [showSnippets, setShowSnippets] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateCursor, setTemplateCursor] = useState(0); // keyboard nav for the slash picker
  const [currentUserId, setCurrentUserId] = useState<string>("");
  // Save-as-skill draft state — opens when the user clicks the new ⚡+ button
  // on an assistant message. Pre-filled from that message's content.
  const [saveSkillDraft, setSaveSkillDraft] = useState<{
    sourceMessageId: string;
    name: string;
    description: string;
    prompt: string;
  } | null>(null);
  const [savingSkill, setSavingSkill] = useState(false);
  // Analyze-data composer + result state (wires /api/ai/analyze into chat).
  const [analyzeOpen, setAnalyzeOpen] = useState(false);
  const [analyzeEnabled, setAnalyzeEnabled] = useState(true);
  const [analyzeUnavailableReason, setAnalyzeUnavailableReason] = useState<string | null>(null);
  const [analyzeInstruction, setAnalyzeInstruction] = useState("");
  const [analyzeFile, setAnalyzeFile] = useState<{ name: string; base64: string; mimeType: string } | null>(null);
  const [analyzeRunning, setAnalyzeRunning] = useState(false);
  // "Generate as file" — standalone downloadable documents via /api/ai/generate-file.
  // Results render as download cards above the composer; they never touch project files.
  const [showFileGenPicker, setShowFileGenPicker] = useState(false);
  // Entry point for the model / multi-agent menu. Without this the menu's render
  // condition and its only controls were mutually dependent, so neither the
  // model picker nor multi-agent could be opened at all.
  const [showModelMenu, setShowModelMenu] = useState(false);
  const [fileGenBusy, setFileGenBusy] = useState<string | null>(null);
  const [fileGenResults, setFileGenResults] = useState<LovableFileGenResult[]>([]);
  const saveGeneratedFileToProject = useCallback(async (file: GeneratedFile) => {
    try {
      const res = await fetch(`/api/projects/${project.id}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: `generated/${file.name}`,
          content: file.base64,
          language: file.mimeType.startsWith("text/") || file.mimeType.includes("json") ? "json" : "binary",
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast({ title: `Saved generated/${file.name} to project` });
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    }
  }, [project.id, toast]);
  const [showSearch, setShowSearch] = useState(false);
  const [compactDensity, setCompactDensity] = useState(() => readString(`lifemark-chat-density-${project.id}`) === "compact");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<ChatSearchMode>("keyword");
  const [searchRoleFilter, setSearchRoleFilter] = useState<ChatSearchRoleFilter>("all");
  const [searchMsgModeFilter, setSearchMsgModeFilter] = useState<ChatSearchMsgModeFilter>("all");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchHitIds, setSearchHitIds] = useState<Set<string> | null>(null);
  const [searchMatchCount, setSearchMatchCount] = useState(0);
  const [searchSource, setSearchSource] = useState<"cached" | "fallback" | null>(null);
  const [configuredConnectorIds, setConfiguredConnectorIds] = useState<Set<string>>(() => new Set());
  const [connectorCatalog, setConnectorCatalog] = useState<Array<(typeof import("./app-connectors-panel"))["CONNECTORS"][number]>>([]);
  const [activeSearchHitIndex, setActiveSearchHitIndex] = useState(0);
  const [focusedMessageId, setFocusedMessageId] = useState<string | null>(null);
  const [speakingMessageId, setSpeakingMessageId] = useState<string | null>(null);
  const clearedSnapshotRef = useRef<Message[] | null>(null);
  const deletedSnapshotRef = useRef<Message | null>(null);
  const [recentSearchQueries, setRecentSearchQueries] = useState<string[]>(() =>
    readJSON<string[]>(`lifemark-recent-searches-${project.id}`, []).slice(0, 6),
  );
  const collapsedThreadsKey = `lifemark-collapsed-threads-${project.id}`;
  // Default expanded — auto-collapsing every older turn made the chat look empty
  // (only "Turn N" labels). Manual collapse via turn dividers still works.
  const [collapsedThreads, setCollapsedThreads] = useState<Set<number>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      // Drop legacy all-collapsed sessions that hid the conversation.
      sessionStorage.removeItem(`lifemark-collapsed-threads-${project.id}`);
    } catch { /* private mode */ }
    return new Set();
  });

  /** Keep collapse indices in range; never collapse the newest turn. */
  const pruneCollapsedThreads = useCallback((prev: Set<number>, threadCount: number) => {
    if (threadCount <= 0) return new Set<number>();
    const maxCollapsible = Math.max(0, threadCount - 1);
    const next = new Set<number>();
    for (const i of prev) {
      if (Number.isInteger(i) && i >= 0 && i < maxCollapsible) next.add(i);
    }
    return next;
  }, []);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const searchStorageKey = `lifemark-chat-search-${project.id}`;
  const bookmarkKey = `lifemark-bookmarks-${project.id}`;
  const chatStateReadyRef = useRef(false);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(() => {
    return new Set(readJSON<string[]>(`lifemark-bookmarks-${project.id}`, []));
  });
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [pinnedMsgId, setPinnedMsgId] = useState<string | null>(() => readString(`lifemark-pinned-${project.id}`));

  // Hydrate pins / bookmarks / queue from server (localStorage is offline cache only).
  useEffect(() => {
    let cancelled = false;
    chatStateReadyRef.current = false;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${project.id}/chat-state`);
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          pinned_message_id?: string | null;
          bookmarked_ids?: string[];
          prompt_queue?: QueueItem[];
        };
        if (cancelled) return;
        if ("pinned_message_id" in data) {
          setPinnedMsgId(data.pinned_message_id ?? null);
        }
        if (Array.isArray(data.bookmarked_ids)) {
          setBookmarkedIds(new Set(data.bookmarked_ids));
        }
        if (Array.isArray(data.prompt_queue) && data.prompt_queue.length > 0) {
          setPromptQueue(
            (data.prompt_queue as unknown[])
              .filter(
                (raw): raw is Record<string, unknown> =>
                  !!raw &&
                  typeof raw === "object" &&
                  typeof (raw as Record<string, unknown>).id === "string" &&
                  typeof (raw as Record<string, unknown>).text === "string",
              )
              .map((q): QueueItem => {
                // Tolerate BOTH shapes: anything written before the type was
                // corrected is a bare string with no filename.
                const at = q.attachedText;
                let attachedText: QueueItem["attachedText"] = null;
                if (typeof at === "string") {
                  attachedText = { name: "attachment.txt", content: at };
                } else if (at && typeof at === "object") {
                  const o = at as Record<string, unknown>;
                  if (typeof o.content === "string") {
                    attachedText = {
                      name: typeof o.name === "string" ? o.name : "attachment.txt",
                      content: o.content,
                    };
                  }
                }
                return {
                  id: q.id as string,
                  text: q.text as string,
                  repeat: typeof q.repeat === "number" ? q.repeat : 1,
                  remaining: typeof q.remaining === "number" ? q.remaining : 1,
                  imageBase64: typeof q.imageBase64 === "string" ? q.imageBase64 : null,
                  imageName: typeof q.imageName === "string" ? q.imageName : null,
                  attachedText,
                };
              }),
          );
        }
        if (readString(`lifemark-queue-paused-${project.id}`) === "1") {
          setQueuePaused(true);
        }
      } catch {
        /* offline — keep local cache */
      } finally {
        if (!cancelled) chatStateReadyRef.current = true;
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  // Persist chat state to server + local cache.
  useEffect(() => {
    if (pinnedMsgId) writeString(`lifemark-pinned-${project.id}`, pinnedMsgId);
    else removeKey(`lifemark-pinned-${project.id}`);
    writeJSON(bookmarkKey, [...bookmarkedIds]);
    writeString(`lifemark-queue-paused-${project.id}`, queuePaused ? "1" : "0");

    if (!chatStateReadyRef.current) return;
    const timer = window.setTimeout(() => {
      void fetch(`/api/projects/${project.id}/chat-state`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pinned_message_id: pinnedMsgId,
          bookmarked_ids: [...bookmarkedIds],
          prompt_queue: promptQueue.map((q) => {
            const image =
              typeof q.imageBase64 === "string" && q.imageBase64.length <= 180_000
                ? q.imageBase64
                : null;
            return {
              id: q.id,
              text: q.text,
              repeat: q.repeat,
              remaining: q.remaining,
              ...(image ? { imageBase64: image, imageName: q.imageName ?? null } : {}),
              ...(q.attachedText
                ? {
                    attachedText: {
                      name: q.attachedText.name,
                      content: q.attachedText.content.slice(0, 50_000),
                    },
                  }
                : {}),
            };
          }),
        }),
      }).catch(() => {/* best-effort */});
    }, 400);
    return () => window.clearTimeout(timer);
  }, [pinnedMsgId, bookmarkedIds, promptQueue, queuePaused, project.id, bookmarkKey]);

  useEffect(() => {
    try {
      sessionStorage.setItem(collapsedThreadsKey, JSON.stringify([...collapsedThreads]));
    } catch { /* private mode */ }
  }, [collapsedThreads, collapsedThreadsKey]);

  useEffect(() => {
    if (pinnedMsgId && !messages.some((m) => m.id === pinnedMsgId)) {
      setPinnedMsgId(null);
    }
  }, [messages, pinnedMsgId]);

  const genStartRef = useRef<number>(0);
  const [genTimes, setGenTimes] = useState<Record<string, number>>({});
  // Per-message preview screenshots (messageId → data URL)
  const [messageScreenshots, setMessageScreenshots] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    messages.forEach((m) => {
      const url = (m.metadata as Record<string, string> | null)?.screenshot_url;
      if (url) initial[m.id] = url;
    });
    return initial;
  });
  // Listen for screenshot captures from PreviewPanel and persist them
  useEffect(() => {
    function handleScreenshotReady(e: Event) {
      const { messageId, dataUrl } = (e as CustomEvent<{ messageId: string; dataUrl: string }>).detail;
      if (!messageId || !dataUrl) return;

      // Composer "+" → Screenshot: attach to the next message (optionally open annotate).
      if (messageId === "manual") {
        setAttachedImage(dataUrl);
        setAttachedImageName("screenshot.png");
        setChatAnnotateOpen(true);
        return;
      }

      setMessageScreenshots((prev) => ({ ...prev, [messageId]: dataUrl }));

      // Upload to storage; never write multi-MB base64 into message metadata (causes Failed to fetch).
      void fetch(`/api/projects/${project.id}/preview`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dataUrl }),
      })
        .then(async (res) => {
          if (!res.ok) return;
          const { preview_url } = (await res.json()) as { preview_url?: string };
          const isPersistedId =
            messageId &&
            !messageId.startsWith("assistant-") &&
            !messageId.startsWith("temp-");
          if (!preview_url || !isPersistedId) return;
          // Merge — never replace metadata wholesale (would drop snapshot_id / traces).
          return fetch(`/api/projects/${project.id}/messages/${messageId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              metadata: { screenshot_url: preview_url },
              mergeMetadata: true,
            }),
          });
        })
        .catch(() => {});
    }
    window.addEventListener("lifemark-screenshot-ready", handleScreenshotReady);
    return () => window.removeEventListener("lifemark-screenshot-ready", handleScreenshotReady);
   
  }, [project.id]);

  // Seed screenshots from freshly-loaded messages (e.g., on page reload)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate screenshot cache from persisted message metadata
    setMessageScreenshots((prev) => {
      const next = { ...prev };
      let changed = false;
      messages.forEach((m) => {
        if (!next[m.id]) {
          const url = (m.metadata as Record<string, string> | null)?.screenshot_url;
          if (url) { next[m.id] = url; changed = true; }
        }
      });
      return changed ? next : prev;
    });
  }, [messages]);

  // Hydrate multi-role test chips persisted on assistant messages.
  useEffect(() => {
    setRoleTestChips((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const m of messages) {
        if (next[m.id] || m.role !== "assistant") continue;
        const chips = (m.metadata as { role_test_chips?: unknown } | null)?.role_test_chips;
        if (!Array.isArray(chips) || chips.length === 0) continue;
        next[m.id] = chips.filter((c): c is string => typeof c === "string");
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [messages]);

  function toggleBookmark(messageId: string) {
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) next.delete(messageId);
      else next.add(messageId);
      return next;
    });
  }

  const [isAtBottom, setIsAtBottom] = useState(true);
  const lastSeenCountRef = useRef(0);
  const [newMessageCount, setNewMessageCount] = useState(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  /** Latest browse_preview screenshot URL waiting to attach to the assistant message. */
  const pendingBrowseShotRef = useRef<string | null>(null);
  /**
   * True while sendMessage is executing. `streaming` is React state, so two
   * sends triggered in the same frame (queue-drain effect + a click) can both
   * read the stale `false` and start concurrent streams. A ref flips
   * synchronously and closes that race.
   */
  const sendingRef = useRef(false);
  /** Patch→build fallback retry timer — cleared on unmount so a navigation
   *  away can't fire sendMessage against an unmounted panel. */
  const patchFallbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const unmountedRef = useRef(false);
  useEffect(() => {
    unmountedRef.current = false;
    return () => {
      unmountedRef.current = true;
      if (patchFallbackTimerRef.current) clearTimeout(patchFallbackTimerRef.current);
      if (scrapeDebounceRef.current) clearTimeout(scrapeDebounceRef.current);
      // Read-aloud (toggleReadAloud) starts window.speechSynthesis speaking
      // and nothing previously stopped it when this panel unmounted — e.g.
      // navigating away from the project, or the mobile/desktop layout swap
      // in editor-layout.tsx mounting a different ChatPanel tree. Speech kept
      // playing after the panel and its stop button were gone.
      window.speechSynthesis?.cancel();
    };
  }, []);

  // Realtime shared chat — merge remote inserts/updates/deletes without clobbering temps.
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`project-messages:${project.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `project_id=eq.${project.id}`,
        },
        (payload) => {
          if (streaming || sendingRef.current) return;
          const eventType = payload.eventType;
          if (eventType === "INSERT") {
            const row = payload.new as Message;
            if (!row?.id) return;
            const current = messagesRef.current;
            if (current.some((m) => m.id === row.id)) return;
            const incomingTurn = messageClarifyTurnId(row.metadata, row.id);
            if (incomingTurn) {
              const idx = current.findIndex(
                (m) => messageClarifyTurnId(m.metadata, m.id) === incomingTurn,
              );
              if (idx >= 0) {
                const next = [...current];
                next[idx] = { ...current[idx], ...row, metadata: row.metadata ?? current[idx]?.metadata };
                onMessagesUpdate(next);
                return;
              }
            }
            if (
              row.role === "user" &&
              current.some(
                (m) =>
                  m.id.startsWith("temp-") &&
                  m.role === "user" &&
                  m.content === row.content,
              )
            ) {
              return;
            }
            onMessagesUpdate(
              [...current, row].sort(
                (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
              ),
            );
            return;
          }
          if (eventType === "UPDATE") {
            const row = payload.new as Message;
            if (!row?.id) return;
            onMessagesUpdate(
              messagesRef.current.map((m) => (m.id === row.id ? { ...m, ...row } : m)),
            );
            return;
          }
          if (eventType === "DELETE") {
            const old = payload.old as { id?: string };
            if (!old?.id) return;
            onMessagesUpdate(messagesRef.current.filter((m) => m.id !== old.id));
          }
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [project.id, onMessagesUpdate, streaming]);

  // ── Post-run reconciliation ────────────────────────────────────────────────
  // The realtime handler above deliberately DROPS events while `streaming` is
  // true (see the `if (streaming || sendingRef.current) return;` guard) so the
  // SSE stream stays the single writer during a run and messages aren't
  // duplicated. That is correct — but it has no fallback.
  //
  // If a run ends WITHOUT delivering its terminal payload (stream stalled,
  // connection dropped, proxy cut it), the assistant message and the updated
  // files have ALREADY been persisted server-side, yet the client discarded the
  // realtime notifications for them and never appended them itself. Nothing
  // re-fetches, so the editor sits on stale state until a manual page reload.
  //
  // Observed live: a first build on a cold-booting sandbox rendered 7 of the
  // run's 23 steps, showed no assistant message, and left the preview on the
  // scaffold — while the DB had the finished message and files and credits had
  // been charged. A plain reload fixed it, which is the tell that only the
  // client was behind.
  //
  // So: whenever a run finishes, reconcile against the server. On the happy
  // path the stream already delivered everything, ids match, and this is a
  // no-op. Best-effort throughout — reconciliation must never break the editor.
  const reconcilePrevStreamingRef = useRef(streaming);
  useEffect(() => {
    const was = reconcilePrevStreamingRef.current;
    reconcilePrevStreamingRef.current = streaming;
    if (!was || streaming) return; // only fire on true -> false

    let cancelled = false;
    // Small delay so the stream's own terminal write lands first and this stays
    // a no-op in the normal case.
    const timer = window.setTimeout(async () => {
      try {
        const supabase = createClient();
        const { data: rows } = await supabase
          .from("messages")
          .select("*")
          .eq("project_id", project.id)
          .order("created_at", { ascending: true });
        if (cancelled || !rows) return;

        const have = new Set(messagesRef.current.map((m) => m.id));
        const missing = (rows as Message[]).filter((r) => r.id && !have.has(r.id));
        if (missing.length === 0) return; // stream delivered everything

        // Merge, then drop any optimistic temp that the server row supersedes.
        const merged = [...messagesRef.current, ...missing]
          .filter(
            (m, _i, arr) =>
              !(
                m.id.startsWith("temp-") &&
                arr.some(
                  (o) =>
                    !o.id.startsWith("temp-") &&
                    o.role === m.role &&
                    o.content === m.content,
                )
              ),
          )
          .sort(
            (a, b) =>
              new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          );
        onMessagesUpdate(merged);

        // The same run wrote files; pull them so the preview isn't left stale.
        const { data: fileRows } = await supabase
          .from("project_files")
          .select("*")
          .eq("project_id", project.id);
        if (!cancelled && fileRows && fileRows.length > 0) {
          onFilesUpdate(fileRows as unknown as ProjectFile[], { replace: true });
        }
      } catch {
        /* best-effort — never surface a reconciliation failure to the user */
      }
    }, 1200);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming, project.id]);

  // Abort any in-flight stream when the panel unmounts so the response
  // reader is cancelled/released and no further work runs against an
  // unmounted component.
  useEffect(() => () => { abortControllerRef.current?.abort(); }, []);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<LovableChatTimelineHandle>(null);

  // Wipe legacy all-collapsed + mid-list scroll so conversation bodies show.
  useEffect(() => {
    try {
      sessionStorage.removeItem(collapsedThreadsKey);
      sessionStorage.removeItem(`lifemark-chat-scroll-${project.id}`);
    } catch { /* private mode */ }
    setCollapsedThreads(new Set());
    setIsAtBottom(true);
    const t = window.setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ block: "end" });
    }, 80);
    return () => window.clearTimeout(t);

  }, [project.id, collapsedThreadsKey]);

  const deepLinkedRef = useRef(false);
  const [hasMoreMessages, setHasMoreMessages] = useState(hasMoreMessagesInitial);
  const loadingOlderRef = useRef(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Lets the Alt/Option+V keyboard shortcut (Lovable parity) drive the same
  // start/stop flow as clicking the composer's mic button.
  const voiceModeRef = useRef<VoiceModeHandle>(null);
  // Handle file-to-app drop: pre-fill input (and image) then consume
  useEffect(() => {
    if (!pendingBuildFromFile) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- consume external drop payload into composer state
    setInput(pendingBuildFromFile.prompt);
    if (pendingBuildFromFile.imageBase64) {
      setAttachedImage(pendingBuildFromFile.imageBase64);
      setAttachedImageName("dropped-file");
    }
    onPendingBuildFromFileConsumed?.();
    // Focus the textarea
    setTimeout(() => textareaRef.current?.focus(), 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingBuildFromFile]);

  // Keep refs to queue state so the drain effect reads fresh values
  const promptQueueRef = useRef<QueueItem[]>([]);
  const queuePausedRef = useRef(false);
  useEffect(() => { promptQueueRef.current = promptQueue; }, [promptQueue]);
  useEffect(() => { queuePausedRef.current = queuePaused; }, [queuePaused]);
  // Fetch current user id once for snippet ownership checks, and their
  // chat_prefs alongside it (one round trip) — suggestionChipsEnabled stays
  // at its default (true) if this fails or the column is absent (older
  // local schema without migration 179 applied), matching prior behavior.
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      setCurrentUserId(data.user.id);
      void supabase
        .from("profiles")
        .select("chat_prefs")
        .eq("id", data.user.id)
        .single()
        .then(({ data: profileRow }) => {
          const prefs = profileRow?.chat_prefs as { suggestion_chips_enabled?: boolean } | null;
          if (prefs && typeof prefs.suggestion_chips_enabled === "boolean") {
            setSuggestionChipsEnabled(prefs.suggestion_chips_enabled);
          }
        });
    });
  }, []);

  useEffect(() => {
    if (!streaming) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reset elapsed timer when the stream stops
      setThoughtSeconds(0);
      return;
    }
    const started = Date.now();
    const id = setInterval(() => {
      setThoughtSeconds(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => clearInterval(id);
  }, [streaming]);

  useEffect(() => {
    if (streaming) return;
    if (!streamingContent && streamingFiles.length === 0) return;
    const startedAt = streamGenerationStartedAtRef.current;
    const assistantLanded = messages.some(
      (m) => m.role === "assistant" && Date.parse(m.created_at) >= startedAt - 500,
    );
    if (assistantLanded) {
      setStreamingContent("");
      setStreamingFiles([]);
      return;
    }
    const timer = window.setTimeout(() => {
      setStreamingContent("");
      setStreamingFiles([]);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, [streaming, messages, streamingContent, streamingFiles.length]);

  const [stoppedDraft, setStoppedDraft] = useState<string | null>(null);

  function stopGeneration() {
    const partial = streamingContent.trim();
    if (partial.length > 20) setStoppedDraft(partial);
    abortControllerRef.current?.abort();
    setStreamingWithCallback(false);
    setStreamingContent("");
  }

  function continueAfterStop() {
    const draft = stoppedDraft;
    setStoppedDraft(null);
    if (!draft) return;
    const snippet = draft.length > 1200 ? `${draft.slice(0, 1200)}…` : draft;
    void sendMessage(
      `Continue from where you left off. Here is the unfinished output so far:\n\n\`\`\`\n${snippet}\n\`\`\`\n\nPick up cleanly and finish.`,
    );
  }

  async function rateMessage(messageId: string, value: 1 | -1) {
    // Toggle off if same rating clicked again
    const next = ratings[messageId] === value ? undefined : value;
    setRatings((prev) => {
      const n = { ...prev };
      if (next === undefined) delete n[messageId]; else n[messageId] = next;
      return n;
    });
    // Keep the messages prop in sync so the ratings hydration effect never
    // re-adds a rating the user just toggled off.
    onMessagesUpdate(messages.map((m) => (m.id === messageId ? { ...m, rating: next ?? null } : m)));
    await fetch(`/api/projects/${project.id}/messages/${messageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rating: next ?? null }),
    }).catch(() => {/* best-effort */});
  }

  async function persistPendingBranchMeta(userMessageId: string) {
    const branch = pendingBranchRef.current;
    if (!branch || userMessageId.startsWith("temp-")) return;
    pendingBranchRef.current = null;
    await fetch(`/api/projects/${project.id}/messages/${userMessageId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mergeMetadata: true,
        metadata: {
          branched_at: branch.branchedAt,
          branch_from_snapshot_id: branch.snapshotId,
        },
      }),
    }).catch(() => {/* best-effort */});
  }

  async function handleRevertFile(messageId: string, diff: FileDiffEntry) {
    // Find the fileId from current files list
    const file = files.find((f) => f.path === diff.path);
    if (!file) return;
    try {
      const res = await fetch(`/api/projects/${project.id}/files`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id, content: diff.oldContent }),
      });
      if (!res.ok) throw new Error(`Revert failed (${res.status})`);
      // Update local state
      onFilesUpdate(files.map((f) => f.id === file.id ? { ...f, content: diff.oldContent } : f));
      setFileStates((prev) => ({
        ...prev,
        [messageId]: { ...(prev[messageId] ?? {}), [diff.path]: "reverted" },
      }));
    } catch {
      toast({ title: "Failed to revert file", variant: "destructive" });
    }
  }

  async function handleReApplyFile(messageId: string, diff: FileDiffEntry) {
    const file = files.find((f) => f.path === diff.path);
    if (!file) return;
    try {
      const res = await fetch(`/api/projects/${project.id}/files`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id, content: diff.newContent }),
      });
      if (!res.ok) throw new Error(`Re-apply failed (${res.status})`);
      onFilesUpdate(files.map((f) => f.id === file.id ? { ...f, content: diff.newContent } : f));
      setFileStates((prev) => ({
        ...prev,
        [messageId]: { ...(prev[messageId] ?? {}), [diff.path]: "accepted" },
      }));
    } catch {
      toast({ title: "Failed to re-apply file", variant: "destructive" });
    }
  }

  async function handleUndo() {
    if (!canUndo || undoing) return;
    setUndoing(true);
    try {
      // Fetch the most recent snapshot for this project
      const res = await fetch(`/api/projects/snapshots?projectId=${project.id}&limit=1`);
      if (!res.ok) throw new Error("No snapshot");
      const page = (await res.json()) as { snapshots?: Array<{ id: string; label?: string }> };
      const snapshot = page.snapshots?.[0];
      if (!snapshot) throw new Error("No snapshot found");

      // Restore it
      const restoreRes = await fetch("/api/projects/snapshots/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: snapshot.id, projectId: project.id }),
      });
      const payload = (await restoreRes.json().catch(() => null)) as
        | { status?: string; message?: string; files?: unknown[] }
        | null;

      // "Nothing to undo" used to be the message for EVERY failure here,
      // including a restore that 500'd — which, given the restore route deletes
      // before it inserts, is precisely the moment the user most needs to know
      // something went wrong rather than being told there was nothing to do.
      if (!restoreRes.ok || payload?.status === "error") {
        throw new Error(
          payload?.message || `Restore failed (${restoreRes.status})`,
        );
      }

      const restoredFiles = payload?.files;
      // `replace: true` is not optional. A revert that REMOVES files is the
      // normal case, and without it the merge heuristic keeps the deleted files
      // in the tree and keeps syncing them to the sandbox — so the revert
      // appears not to have worked.
      if (Array.isArray(restoredFiles) && restoredFiles.length > 0) {
        onFilesUpdate(restoredFiles as ProjectFile[], { replace: true });
      }
      setCanUndo(false);
      toast({ title: "Undone", description: `Restored: ${snapshot.label ?? "previous state"}` });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const nothingToUndo = /no snapshot/i.test(message);
      toast({
        title: nothingToUndo ? "Nothing to undo" : "Undo failed",
        description: nothingToUndo ? undefined : message,
        variant: "destructive",
      });
    } finally {
      setUndoing(false);
    }
  }

  /** Lovable-parity per-message revert: restore the pre-build snapshot linked
   *  to an assistant build message (metadata.snapshot_id). The restore route
   *  saves a safety snapshot of the current state before applying. */
  async function handleRevertToVersion(snapshotId: string) {
    if (!window.confirm("Revert the project files to before this change? A safety snapshot of the current state is saved first.")) return;
    try {
      let res = await fetch("/api/projects/snapshots/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId, projectId: project.id }),
      });
      if (res.status === 409) {
        // Restore route refused: SQL schema/migration files would change.
        if (!window.confirm("This revert changes SQL schema or migration files. Proceed anyway?")) return;
        res = await fetch("/api/projects/snapshots/restore", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ snapshotId, projectId: project.id, confirmSchema: true }),
        });
      }
      const restorePayload = (await res.json().catch(() => null)) as
        | { status?: string; message?: string }
        | null;
      // The route can answer 200 with status:"error" — it refuses a restore
      // that would empty the project, and reports a failed insert after it has
      // already put the files back. Reading only res.ok would show "Reverted"
      // over a project that was not.
      if (!res.ok || restorePayload?.status === "error") {
        throw new Error(restorePayload?.message || `Restore failed (${res.status})`);
      }
      const restoreMsg = restorePayload?.message;

      // Refresh files from DB (same pattern as triggerAutoFix)
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: updatedFiles, error: refreshError } = await supabase
        .from("project_files")
        .select("*")
        .eq("project_id", project.id);
      if (refreshError) {
        // The restore succeeded server-side; only the refresh failed. Saying so
        // beats leaving the editor showing pre-revert content that the user's
        // next keystroke would then write back over the restored files.
        toast({
          title: "Reverted — reload to see it",
          description: "The revert was applied but the editor could not refresh.",
        });
      }
      // replace:true — a revert that removes files must remove them here too.
      if (Array.isArray(updatedFiles) && updatedFiles.length > 0) {
        onFilesUpdate(updatedFiles, { replace: true });
      }
      window.dispatchEvent(new CustomEvent("lifemark-exit-version-preview"));
      toast({ title: "Project reverted", description: restoreMsg ?? "Files restored to the selected version." });
    } catch {
      toast({ title: "Failed to revert", variant: "destructive" });
    }
  }

  // Lovable parity: chat attachments cover images, PDF/Word/Excel/PowerPoint,
  // and audio, not just images. Real text extraction here (attachDocument,
  // via document-extract.ts) currently covers the three modern Office Open
  // XML formats — .docx/.xlsx/.pptx are ZIP+XML and this project already
  // depends on jszip; legacy binary .doc/.xls/.ppt and PDF are NOT zip files
  // and need a different parser this project doesn't have yet, so they're
  // explicitly rejected below with a specific message rather than silently
  // mishandled or lumped into the generic "unsupported" case.
  const CHAT_AUDIO_EXTS = new Set(["webm", "mp3", "mp4", "m4a", "wav", "ogg", "flac"]);
  const CHAT_CODE_EXTS = ["ts","tsx","js","jsx","css","html","json","md","txt","py","sql","sh","yaml","yml"];

  async function attachDocumentFile(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    try {
      const res = await fetch("/api/ai/extract-document", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok || !data.text) {
        toast({ title: "Couldn't read file", description: data.error ?? `Failed to extract text (${res.status}).`, variant: "destructive" });
        return;
      }
      const secret = detectPromptSecret(data.text);
      if (secret) {
        toast({
          title: "Secret-looking value blocked",
          description: `Detected ${secret.label} in ${file.name}. Store keys in Env/Secrets, then reference the variable name in chat.`,
          variant: "destructive",
        });
        return;
      }
      addAttachedFile({ name: file.name, content: data.text });
      setAttachedImage(null);
      setAttachedImageName(null);
    } catch {
      toast({ title: "Couldn't read file", description: "Network error while extracting text.", variant: "destructive" });
    }
  }

  async function attachAudioFile(file: File) {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("model", "whisper-1");
    try {
      const res = await fetch("/api/ai/transcribe", { method: "POST", body: fd });
      const data = (await res.json().catch(() => ({}))) as { text?: string; error?: string };
      if (!res.ok || !data.text) {
        toast({ title: "Transcription failed", description: data.error, variant: "destructive" });
        return;
      }
      setInput((prev) => prev + (prev ? " " : "") + data.text);
      toast({ title: "Transcribed!", description: `"${data.text.slice(0, 60)}..."` });
    } catch {
      toast({ title: "Transcription failed", variant: "destructive" });
    }
  }

  function dispatchAttachedFile(file: File) {
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";

    if (file.type.startsWith("image/")) {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedImage(reader.result as string);
        setAttachedImageName(file.name);
        setAttachedFiles([]);
      };
      reader.readAsDataURL(file);
      return;
    }

    if (file.type.startsWith("audio/") || CHAT_AUDIO_EXTS.has(ext)) {
      void attachAudioFile(file);
      return;
    }

    if (SUPPORTED_DOCUMENT_EXTENSIONS.has(ext)) {
      void attachDocumentFile(file);
      return;
    }

    if (CHAT_CODE_EXTS.includes(ext)) {
      const reader = new FileReader();
      reader.onload = () => {
        const content = reader.result as string;
        const secret = detectPromptSecret(content);
        if (secret) {
          toast({
            title: "Secret-looking value blocked",
            description: `Detected ${secret.label}. Store keys in Env/Secrets, then reference the variable name in chat.`,
            variant: "destructive",
          });
          return;
        }
        addAttachedFile({ name: file.name, content });
        setAttachedImage(null);
        setAttachedImageName(null);
      };
      reader.readAsText(file);
      return;
    }

    if (ext === "pdf" || ext === "doc" || ext === "xls" || ext === "ppt") {
      toast({
        title: `.${ext} isn't supported yet`,
        description: "Try exporting to .docx/.xlsx/.pptx, or paste the text directly.",
        variant: "destructive",
      });
      return;
    }

    toast({
      title: "Unsupported file type",
      description: "Attach an image, audio file, .docx/.xlsx/.pptx, or code file.",
      variant: "destructive",
    });
  }

  /**
   * Attaches every file the user picked, not just the first — dispatched
   * through the same per-file logic multi-select and drag-drop share (see
   * attachMultipleFiles below). Reset afterward so re-selecting the same
   * file(s) still fires a change event.
   */
  function handleImageAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const fileList = e.target.files;
    if (!fileList || fileList.length === 0) return;
    attachMultipleFiles(Array.from(fileList));
    e.target.value = "";
  }

  /**
   * Fans a multi-file selection (or drop) out across dispatchAttachedFile.
   *
   * attachedImage stays a single slot deliberately — it feeds an AI vision
   * request built for exactly one image, and that's untouched here (see its
   * declaration). Document/code/text files no longer are: each attaches
   * into attachedFiles up to MAX_ATTACHED_FILES, so selecting several docs
   * at once now attaches all of them instead of silently keeping only the
   * first file and dropping the rest, which is what this whole function
   * replaces.
   *
   * dispatchAttachedFile's image and document branches each still clear the
   * OTHER kind (that mutual-exclusion is pre-existing — this pass isn't
   * making chat messages carry both an image and file attachments, since
   * nothing downstream of the composer has ever been built to send both at
   * once). Given a mixed batch, that means processing order decides the
   * outcome — so instead of letting a later document silently wipe an
   * earlier image (or vice versa) file-by-file, this decides once, up
   * front: any document/code/audio file in the batch takes priority and any
   * images are skipped with an explanation, since that's the direction this
   * pass is actually expanding capability in.
   */
  function attachMultipleFiles(files: File[]) {
    const imageFiles = files.filter((f) => f.type.startsWith("image/"));
    const otherFiles = files.filter((f) => !f.type.startsWith("image/"));

    if (otherFiles.length > 0) {
      if (imageFiles.length > 0) {
        toast({
          title: "Image skipped",
          description: `LifemarkAI can attach an image or files to a message, not both. Attaching your ${otherFiles.length} file${otherFiles.length === 1 ? "" : "s"}; the image you picked was skipped.`,
        });
      }
      for (const file of otherFiles) dispatchAttachedFile(file);
      return;
    }

    if (imageFiles.length > 1) {
      toast({
        title: "Only the first image was attached",
        description: `LifemarkAI can attach one image per message — the other ${imageFiles.length - 1} you picked ${imageFiles.length - 1 === 1 ? "was" : "were"} skipped.`,
      });
    }
    if (imageFiles[0]) dispatchAttachedFile(imageFiles[0]);
  }

  /** Lovable parity: paste an API key → auto-saved as a project secret, and
   *  the composer receives a {{TAG}} instead of the raw value, so the key
   *  never lands in the message, chat history, or AI context. */
  function handleSecretPaste(e: React.ClipboardEvent<HTMLDivElement>) {
    const text = e.clipboardData?.getData("text/plain") ?? "";
    const secret = detectPastedSecret(text);
    if (!secret) return; // normal paste
    e.preventDefault();
    e.stopPropagation();
    const redacted = redactSecret(text, secret);
    setInput((prev) => (prev ? `${prev}${prev.endsWith(" ") ? "" : " "}${redacted}` : redacted));
    setTimeout(() => textareaRef.current?.focus(), 0);
    void fetch(`/api/projects/${project.id}/env`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key: secret.name, value: secret.value }),
    })
      .then((res) => {
        setSecretBanner({
          key: secret.name,
          label: secret.label,
          ok: res.ok,
        });
        toast(
          res.ok
            ? { title: `${secret.label} saved`, description: `Stored as the project secret ${secret.name}. The chat message only carries the tag.` }
            : { title: "Couldn't save the secret", description: "The key was redacted from your message — add it manually in the Env panel.", variant: "destructive" },
        );
      })
      .catch(() => {
        setSecretBanner({ key: secret.name, label: secret.label, ok: false });
        toast({ title: "Couldn't save the secret", description: "The key was redacted from your message — add it manually in the Env panel.", variant: "destructive" });
      });
  }

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files.length === 0) return;
    attachMultipleFiles(Array.from(e.dataTransfer.files));
  }

  function startEditMessage(msg: Message) {
    setEditingMessageId(msg.id);
    setEditInput(getDisplayMessageContent(msg));
  }

  const pendingBranchRef = useRef<{
    snapshotId: string | null;
    branchedAt: string;
  } | null>(null);

  async function truncateChatFromMessage(messageId: string, includePivot: boolean) {
    const res = await fetch(`/api/projects/${project.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        truncate: true,
        afterMessageId: messageId,
        includePivot,
      }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        typeof (err as { error?: string }).error === "string"
          ? (err as { error: string }).error
          : "Failed to truncate chat history",
      );
    }
  }

  // "Revert and resend" (Lovable parity): restore file state back to what it
  // was right before `msg`'s ORIGINAL build ran, not whatever the files
  // happen to be now. sendMessage() fires an auto-snapshot labeled
  // "Before: <prompt>" right before every build/agent/patch run (see the
  // fire-and-forget POST further down, near `Auto-snapshot before AI
  // modifies files`) — that snapshot IS the pre-build state for `msg`. Find
  // the newest one at or before `msg`'s timestamp and restore it.
  //
  // Previously, editing an earlier message (or hitting Regenerate) only ever
  // took a fresh "Before edit"/"Before regenerate" snapshot of the CURRENT
  // state — a manual undo safety net — and then resent against that same
  // current state. If anything built after the original message, the resend
  // ran on top of that later work instead of reproducing the original
  // starting point, which is what both "Revert and resend" and "Regenerate"
  // are supposed to do.
  //
  // Deliberately no dry-run/confirm-schema dance here (unlike the History
  // panel's manual multi-version-jump restore) — same lower-ceremony
  // approach as the existing handleUndo() above. Any failure (network,
  // schema-change confirmation required, no matching snapshot) is
  // non-blocking: we fall through and resend against the current files
  // rather than blocking the edit/regenerate entirely.
  async function revertFilesToBeforeMessage(msg: Message) {
    try {
      const listRes = await fetch(`/api/projects/snapshots?projectId=${project.id}`);
      if (!listRes.ok) return;
      const page = (await listRes.json()) as { snapshots?: Array<{ id: string; created_at: string }> };
      const snapshots = page.snapshots;
      if (!Array.isArray(snapshots)) return;
      const targetAt = new Date(msg.created_at).getTime();
      const target = snapshots.find((s) => new Date(s.created_at).getTime() <= targetAt);
      if (!target) return;

      const restoreRes = await fetch("/api/projects/snapshots/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: target.id, projectId: project.id }),
      });
      if (!restoreRes.ok) return;
      const payload = (await restoreRes.json().catch(() => null)) as { files?: unknown[] } | null;
      if (Array.isArray(payload?.files) && payload.files.length > 0) {
        onFilesUpdate(payload.files as ProjectFile[], { replace: true });
      }
    } catch {
      /* non-blocking, see comment above */
    }
  }

  async function submitEditedMessage() {
    if (!editingMessageId || !editInput.trim()) return;
    // A NEW stream can start after the edit box was opened (queued-message
    // auto-drain, a realtime event, etc.) — see handleRegenerate's identical
    // guard below. Without this check we'd still run the file revert, chat
    // truncation, and onMessagesUpdate() below (all destructive) and only
    // then hit sendMessage's own `streaming || sendingRef.current` guard,
    // which no-ops silently — losing the in-flight stream's output AND the
    // user's edit with no feedback at all.
    if (streaming || sendingRef.current) {
      toast({
        title: "Still generating",
        description: "Wait for the current response to finish before editing this message.",
        variant: "destructive",
      });
      return;
    }
    const idx = messages.findIndex((m) => m.id === editingMessageId);
    if (idx < 0) return;
    const editedMsg = messages[idx]!;

    let snapshotId: string | null = null;
    try {
      const snapRes = await fetch("/api/projects/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          label: `Before edit — ${new Date().toLocaleTimeString()}`,
        }),
      });
      if (snapRes.ok) {
        const snap = (await snapRes.json()) as { id?: string; snapshot?: { id?: string } };
        snapshotId = snap.id ?? snap.snapshot?.id ?? null;
      }
    } catch {
      /* non-blocking */
    }

    // Actually revert files before resending — see revertFilesToBeforeMessage
    // above for why this was missing.
    await revertFilesToBeforeMessage(editedMsg);

    try {
      await truncateChatFromMessage(editingMessageId, true);
    } catch (e) {
      toast({
        title: "Couldn't branch chat",
        description: e instanceof Error ? e.message : "Truncate failed",
        variant: "destructive",
      });
      return;
    }

    const truncated = messages.slice(0, idx);
    const branchedAt = new Date().toISOString();
    pendingBranchRef.current = { snapshotId, branchedAt };
    setEditingMessageId(null);
    onMessagesUpdate(truncated);
    toast({
      title: "Branched conversation",
      description: snapshotId
        ? "Earlier messages removed. File snapshot saved in History."
        : "Earlier messages removed from this chat.",
    });
    await sendMessage(editInput, undefined, truncated, { branchMeta: { snapshotId, branchedAt } });
    setEditInput("");
  }

  async function handleRegenerate() {
    if (streaming) return;
    const lastAsstIdx =
      [...messages].map((m, i) => ({ m, i })).filter(({ m }) => m.role === "assistant").pop()?.i ?? -1;
    if (lastAsstIdx < 0) return;
    const lastUserMsg = messages.slice(0, lastAsstIdx).filter((m) => m.role === "user").pop();
    if (!lastUserMsg) return;

    let snapshotId: string | null = null;
    try {
      const snapRes = await fetch("/api/projects/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          label: `Before regenerate — ${new Date().toLocaleTimeString()}`,
        }),
      });
      if (snapRes.ok) {
        const snap = (await snapRes.json()) as { id?: string; snapshot?: { id?: string } };
        snapshotId = snap.id ?? snap.snapshot?.id ?? null;
      }
    } catch {
      /* non-blocking */
    }

    // Same missing-revert bug as edit-and-resend above — restore files to
    // what they were right before this prompt's original build ran.
    await revertFilesToBeforeMessage(lastUserMsg);

    try {
      // Drop the last assistant (and anything after); keep the user prompt.
      await truncateChatFromMessage(messages[lastAsstIdx]!.id, true);
    } catch (e) {
      toast({
        title: "Couldn't regenerate",
        description: e instanceof Error ? e.message : "Truncate failed",
        variant: "destructive",
      });
      return;
    }

    const truncated = messages.slice(0, lastAsstIdx);
    const branchedAt = new Date().toISOString();
    pendingBranchRef.current = { snapshotId, branchedAt };
    onMessagesUpdate(truncated);
    // Without an explicit overrideMode, sendMessage re-runs resolvePromptMode
    // on the raw prompt text, and — verified live, twice — BOTH plausible
    // "trust existing state" signals turned out to be poisoned once this bug
    // had fired even once:
    //   1. lastUserMsg.mode: a message regenerated while the bug was live
    //      gets persisted with mode="chat" (whatever resolvePromptMode fell
    //      back to), so replaying it just repeats the downgrade forever.
    //   2. the editor's own `mode` prop (the selected chat/build/agent/plan
    //      tab): captured live via a fetch() interceptor on this exact
    //      project — it ALSO read "chat" at the moment handleRegenerate ran,
    //      despite the toolbar visibly showing "Building for web". Something
    //      upstream syncs the active tab to the last message's (poisoned)
    //      mode, so this channel inherits the same corruption.
    // Both are historical/derived state and both were observed corrupted.
    // The only reliable fix is to not read any of it: force "build"
    // unconditionally, same as the already-proven handleDesignPreviewSelect/
    // Skip fix above. Regenerate always re-runs the original prompt from
    // scratch, so a full "build" pass is correct regardless of which tab
    // produced the message being regenerated.
    await sendMessage(
      getDisplayMessageContent(lastUserMsg),
      "build",
      truncated,
      {
        branchMeta: { snapshotId, branchedAt },
      },
    );
  }

  useEffect(() => {
    const fromMeta: Record<string, number> = {};
    messages.forEach((m) => {
      const c = (m.metadata as Record<string, unknown> | null)?.credits_used;
      if (m.role === "assistant" && typeof c === "number") fromMeta[m.id] = c;
    });
    if (Object.keys(fromMeta).length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate per-message credit metadata from loaded messages
      setMessageCredits((prev) => ({ ...fromMeta, ...prev }));
    }
  }, [messages]);

  // Hydrate "using skill" chips from persisted assistant metadata (survives reload).
  useEffect(() => {
    const fromMeta: Record<string, Array<{ id: string; name: string; reason?: string }>> = {};
    messages.forEach((m) => {
      if (m.role !== "assistant") return;
      const raw = (m.metadata as { skills_attached?: unknown } | null)?.skills_attached;
      if (!Array.isArray(raw) || raw.length === 0) return;
      fromMeta[m.id] = raw
        .filter((s): s is { id: string; name: string; reason?: string } =>
          !!s && typeof s === "object" && typeof (s as { id?: unknown }).id === "string" &&
          typeof (s as { name?: unknown }).name === "string",
        )
        .map((s) => ({
          id: s.id,
          name: s.name,
          reason: typeof s.reason === "string" ? s.reason : undefined,
        }));
    });
    if (Object.keys(fromMeta).length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- hydrate skill chips from message metadata
      setMessageSkills((prev) => ({ ...fromMeta, ...prev }));
    }
  }, [messages]);

  // Auto-fire starter prompt from URL (new project with ?prompt=...)
  // Wait until credits are synced — sendMessage no-ops when credits <= 0
  useEffect(() => {
    if (!starterPrompt || starterFired || messages.length > 0 || streaming) return;
    if (credits <= 0) return;

    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot URL starter prompt bootstrap
    setStarterFired(true);
    setInput(starterPrompt);
    const starterMode = resolvePromptMode(starterPrompt, intelCtx);
    onModeChange?.(starterMode);
    const timer = setTimeout(() => {
      setInput("");
      void sendMessage(starterPrompt, starterMode);
    }, 600);
    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [starterPrompt, credits]);

  // Coordinate heal overlay ↔ auto-fix loop
  useEffect(() => {
    function onHealStart() {
      healActiveRef.current = true;
    }
    function onHealDone() {
      healActiveRef.current = false;
    }
    window.addEventListener("lifemark-preview-heal-start", onHealStart);
    window.addEventListener("lifemark-preview-heal-done", onHealDone);
    return () => {
      window.removeEventListener("lifemark-preview-heal-start", onHealStart);
      window.removeEventListener("lifemark-preview-heal-done", onHealDone);
    };
  }, []);

  // Team / Editor Intelligence → chat timeline summary + file refresh.
  useEffect(() => {
    function onIntelligenceDone(e: Event) {
      const detail = (e as CustomEvent<{
        projectId?: string;
        summary?: string;
        changedPaths?: string[];
        ok?: boolean;
      }>).detail;
      if (!detail || detail.projectId !== project.id) return;
      const content = (detail.summary || "Team run finished.").trim();
      const tempId = `temp-team-result-${Date.now()}`;
      const assistantMsg: Message = {
        id: tempId,
        project_id: project.id,
        role: "assistant",
        content,
        tokens_used: null,
        model: null,
        mode: "agent",
        metadata: {
          multi_agent: true,
          team_result: true,
          ok: detail.ok !== false,
          changed_paths: detail.changedPaths ?? [],
        } as Json,
        rating: null,
        created_at: new Date().toISOString(),
      };
      onMessagesUpdate([...messagesRef.current, assistantMsg]);
      void fetch(`/api/projects/${project.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "assistant",
              content,
              mode: "agent",
              metadata: {
                multi_agent: true,
                team_result: true,
                ok: detail.ok !== false,
                changed_paths: detail.changedPaths ?? [],
              },
            },
          ],
        }),
      }).catch(() => {/* best-effort */});
      void refreshProjectFiles().catch(() => {});
      onOpenPanel?.("chat");
    }
    window.addEventListener("lifemark-intelligence-done", onIntelligenceDone);
    return () => window.removeEventListener("lifemark-intelligence-done", onIntelligenceDone);
  }, [project.id, onMessagesUpdate, refreshProjectFiles, onOpenPanel]);

  // Populate input when user clicks "Fix with AI" on the error banner in preview panel
  useEffect(() => {
    if (!pendingFixPrompt || credits <= 0) {
      if (pendingFixPrompt && credits <= 0) {
        onPendingFixConsumed?.();
        // The preview panel already flipped its guard to "healing" the moment
        // it handed us this prompt — the overlay is now showing
        // "Self-repairing…" with no way out. Dropping the prompt here without
        // saying so left that spinner up for the rest of the session. Tell the
        // guard the repair is not happening so it falls back to the actionable
        // "Preview paused" card, and say why in the chat.
        if (pendingFixPrompt.startsWith("Fix the preview/runtime errors")) {
          window.dispatchEvent(new CustomEvent("lifemark-preview-heal-failed"));
          toast({
            title: "Out of credits",
            description: "Self-repair needs credits. The preview is unpaused so you can keep editing.",
            variant: "destructive",
          });
        }
      }
      return;
    }
    const prompt = pendingFixPrompt;
    onPendingFixConsumed?.();
    // Healing overlay sends structured prompt — one-click send (Lovable self-repair)
    if (prompt.startsWith("Fix the preview/runtime errors")) {
      // `sendMessage` silently returns when a build is already streaming. That
      // return used to strand the healing overlay exactly like the credits
      // case above, because nothing downstream ever reported the failure.
      if (streaming || sendingRef.current) {
        window.dispatchEvent(new CustomEvent("lifemark-preview-heal-failed"));
        toast({
          title: "Already working",
          description: "A build is still running — try the fix again once it finishes.",
        });
        return;
      }
      healActiveRef.current = true;
      void sendMessage(appendPreviewDiagnosis(prompt, files), "build").catch(() => {
        healActiveRef.current = false;
        window.dispatchEvent(new CustomEvent("lifemark-preview-heal-failed"));
      });
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- consume preview fix request into composer state
    setInput(`Fix this runtime error:\n\n${prompt}`);
    setTimeout(() => textareaRef.current?.focus(), 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFixPrompt, credits]);

  // Handle "Ask AI" / "Explain" from Monaco selection action bar
  useEffect(() => {
    const handler = (e: Event) => {
      const { code, filename, instruction } = (e as CustomEvent<{ code: string; filename: string; instruction: string }>).detail;
      const prefix = instruction
        ? `${instruction}\n\n\`\`\`\n${code}\n\`\`\``
        : `\`\`\`${filename ? `\n// ${filename}` : ""}\n${code}\n\`\`\`\n`;
      setInput(prefix);
      setTimeout(() => {
        const el = textareaRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(el.value.length, el.value.length);
      }, 50);
    };
    window.addEventListener("monaco-ask-snippet", handler);
    return () => window.removeEventListener("monaco-ask-snippet", handler);

  }, []);

  // Line references from the code panel (Lovable parity): "Reference Line(s)
  // in Chat" / ⌘⇧L inserts `@path:12` or `@path:12-34` into the composer.
  useEffect(() => {
    const handler = (e: Event) => {
      const { path, startLine, endLine } = (e as CustomEvent<{ path: string; startLine: number; endLine: number }>).detail ?? {};
      if (!path || !startLine) return;
      const ref = `@${path}:${startLine}${endLine && endLine !== startLine ? `-${endLine}` : ""} `;
      setInput((prev) => (prev ? `${prev}${prev.endsWith(" ") ? "" : " "}${ref}` : ref));
      setTimeout(() => textareaRef.current?.focus(), 50);
    };
    window.addEventListener("monaco-line-ref", handler);
    return () => window.removeEventListener("monaco-line-ref", handler);
  }, []);

  // Insert "@filename " into input when user clicks "Ask AI" in code panel
  useEffect(() => {
    if (!pendingFileRef) return;
    const mention = `@${pendingFileRef.path} `;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- consume file reference action into composer state
    setInput((prev) => (prev ? `${prev} ${mention}` : mention));
    onPendingFileRefConsumed?.();
    setTimeout(() => {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }, 50);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingFileRef]);

  // Auto-fix loop: when a preview error arrives, call /api/ai/fix automatically.
  //
  // `autoFixAttempts` is component state, so it resets to 0 on every mount. On its
  // own that meant a project with an UNFIXABLE preview error (e.g. a component
  // importing a file that was never created) re-ran the full 3-attempt loop every
  // single time the editor was opened — 3 more paid /api/ai/fix calls, 3 more
  // failures, forever. The persistent ledger remembers that we already tried THIS
  // error on THIS project, so a reload no longer buys the user the same failure
  // twice. It's cleared whenever the code changes, so a real retry is still allowed.
  const [freeFixesRemaining, setFreeFixesRemaining] = useState<number | null>(null);

  useEffect(() => {
    if (
      !previewError ||
      isNoisePreviewError(previewError) ||
      previewError === lastFixedError ||
      autoFixing ||
      streaming ||
      healActiveRef.current ||
      autoFixAttempts >= MAX_AUTO_FIX_ATTEMPTS
      // Allow at 0 credits — /api/ai/fix grants up to 20 free Try-to-fix/day.
    )
      return;

    // Survives reloads — the in-memory counter above does not.
    if (getAutoFixAttempts(project.id, previewError) >= MAX_AUTO_FIX_ATTEMPTS) {
      setAutoFixAttempts(MAX_AUTO_FIX_ATTEMPTS); // show the "needs manual fix" nudge
      return;
    }

    const timer = setTimeout(() => {
      void triggerAutoFix(previewError, previewRuntimeErrors);
    }, 1500); // short delay so user sees the error first

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewError, previewRuntimeErrors]);

  // Track whether the message list is scrolled to the bottom
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const handleScroll = () => {
      const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
      setIsAtBottom(atBottom);
    };
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => el.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (draftHydratedRef.current) return;
    draftHydratedRef.current = true;
    const draft = readString(composerDraftKey);
    if (draft?.trim()) {
      setInput(draft);
      setShowDraftBanner(true);
    }
  }, [composerDraftKey]);

  useEffect(() => {
    if (!draftHydratedRef.current) return;
    const timer = window.setTimeout(() => {
      if (input.trim()) writeString(composerDraftKey, input);
      else removeKey(composerDraftKey);
    }, 400);
    return () => window.clearTimeout(timer);
  }, [input, composerDraftKey]);

  // Restore an in-progress clarify session (unanswered/partially-answered
  // questions) on mount — previously this was a plain useState, so a
  // refresh mid-wizard silently threw away every answer already given.
  useEffect(() => {
    if (clarifyDraftHydratedRef.current) return;
    clarifyDraftHydratedRef.current = true;
    const saved = readJSON<ClarifySession | null>(clarifyDraftKey, null);
    if (saved && Array.isArray(saved.questions) && saved.questions.length > 0) {
      const session = normalizeClarifyInterview(saved) as ClarifySession;
      setActiveClarifySession(session);
      persistClarifyTurns(buildClarifyTimeline(session));
    }
  }, [clarifyDraftKey, persistClarifyTurns]);

  useEffect(() => {
    if (!clarifyDraftHydratedRef.current) return;
    if (activeClarifySession) {
      writeJSON(clarifyDraftKey, activeClarifySession);
    } else {
      removeKey(clarifyDraftKey);
    }
  }, [activeClarifySession, clarifyDraftKey]);

  useEffect(() => {
    if (!showSearch) return;
    try {
      sessionStorage.setItem(
        searchStorageKey,
        JSON.stringify({
          query: searchQuery,
          mode: searchMode,
          role: searchRoleFilter,
          msgMode: searchMsgModeFilter,
        }),
      );
    } catch { /* private mode */ }
  }, [searchQuery, searchMode, searchRoleFilter, searchMsgModeFilter, showSearch, searchStorageKey]);

  const rememberSearchQuery = useCallback(
    (q: string) => {
      const trimmed = q.trim();
      if (trimmed.length < 2) return;
      setRecentSearchQueries((prev) => {
        const next = [trimmed, ...prev.filter((x) => x !== trimmed)].slice(0, 6);
        writeJSON(`lifemark-recent-searches-${project.id}`, next);
        return next;
      });
    },
    [project.id],
  );

  // Load older messages when scrolling near the top (Lovable long-thread parity).
  const loadOlderMessages = useCallback(async () => {
    const el = scrollContainerRef.current;
    if (!hasMoreMessages || loadingOlderRef.current || messages.length === 0 || !el) return;
    const oldest = messages[0];
    if (!oldest?.created_at) return;
    loadingOlderRef.current = true;
    setLoadingOlderMessages(true);
    const prevHeight = el.scrollHeight;
    try {
      const res = await fetch(
        `/api/projects/${project.id}/messages?before=${encodeURIComponent(oldest.created_at)}&limit=50`,
      );
      if (!res.ok) return;
      const data = (await res.json()) as { messages?: Message[]; hasMore?: boolean };
      const older = data.messages ?? [];
      if (older.length > 0) {
        onMessagesUpdate([...older, ...messages]);
        requestAnimationFrame(() => {
          el.scrollTop = el.scrollHeight - prevHeight;
        });
      }
      setHasMoreMessages(Boolean(data.hasMore));
    } finally {
      loadingOlderRef.current = false;
      setLoadingOlderMessages(false);
    }
  }, [hasMoreMessages, messages, onMessagesUpdate, project.id]);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (el.scrollTop > 120) return;
      void loadOlderMessages();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [loadOlderMessages]);

  // Follow new content (messages + streamed chunks), but ONLY while the user
  // is already at the bottom — isAtBottom flips false the moment they scroll
  // up, so streaming never fights their reading position.
  useEffect(() => {
    if (!isAtBottom) return;
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, streamingContent, streamingFiles, agentSteps, isAtBottom]);

  // Broadcast live agent/build steps for the floating Tasks sidebar (Lovable parity).
  const liveTaskSteps = useMemo((): AgentTaskStep[] => {
    if (agentSteps.length > 0) return agentSteps;
    if (!streaming || buildActivitySteps.length === 0) return [];
    return buildActivitySteps.map((s) => ({
      label: s.label,
      status: s.status === "done" ? ("done" as const) : ("running" as const),
      kind: "other" as const,
      key: s.id,
    }));
  }, [agentSteps, buildActivitySteps, streaming]);

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("lifemark-live-tasks", {
        detail: { streaming, steps: liveTaskSteps },
      }),
    );
  }, [streaming, liveTaskSteps]);

  async function triggerAutoFix(error: string, runtimeErrors: PreviewRuntimeError[] = []) {
    setAutoFixing(true);
    setLastFixedError(error);
    setAutoFixAttempts((n) => n + 1);
    // Persist the attempt BEFORE the request, so a mid-flight reload can't reset
    // the count and buy the user another round of the same failing fix.
    recordAutoFixAttempt(project.id, error);

    const fixPayload = appendPreviewDiagnosis(
      error,
      files,
      runtimeErrors.length > 0
        ? runtimeErrors
        : [{ kind: "runtime", message: error, timestamp: Date.now() }],
    );

    // Show an in-chat notification
    const fixingMsg: Message = {
      id: `autofix-${Date.now()}`,
      project_id: project.id,
      role: "assistant",
      content: `Updating the preview…`,
      tokens_used: null,
      model: null,
      mode: "build",
      metadata: null,
      rating: null,
      created_at: new Date().toISOString(),
    };
    const messagesWithFixing = [...messages, fixingMsg];
    onMessagesUpdate(messagesWithFixing);

    try {
      const res = await fetch("/api/ai/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          error: fixPayload,
          runtimeErrors,
          files: files.map((f) => ({ path: f.path, content: f.content })),
        }),
      });

      if (!res.ok) {
        // "Try to fix" is a button, not a typed prompt, so there is no user
        // message to preserve — but the failure still has to be legible.
        // Previously a 402 always read "daily free quota used", which is wrong
        // whenever the real cause is the platform's provider balance: the user
        // waits for a quota that resets tomorrow while nothing ever works.
        const rawError = await readErrorBody(res);
        const described = describeAiFailure({ status: res.status, rawError });
        const fixErrMsg: Message = {
          id: `fix-error-${Date.now()}`,
          project_id: project.id,
          role: "assistant",
          content: described.chatMarkdown,
          tokens_used: null,
          model: null,
          mode: "build",
          metadata: null,
          rating: null,
          created_at: new Date().toISOString(),
        };
        onMessagesUpdate([...messages, fixErrMsg]);
        toast({
          title: described.title,
          description: described.summary,
          variant: "destructive",
        });
        if (res.status === 402 && !described.isPlatformFault) setFreeFixesRemaining(0);
        return;
      }

      const data = (await res.json()) as {
        files: Array<{ path: string; content: string }>;
        explanation: string;
        tokensUsed: number;
        free?: boolean;
        deterministic?: boolean;
        freeFixesRemainingToday?: number;
      };

      if (typeof data.freeFixesRemainingToday === "number") {
        setFreeFixesRemaining(data.freeFixesRemainingToday);
      }

      if (!data.free) {
        try {
          const cr = await fetch("/api/billing/credits");
          if (cr.ok) {
            const { credits: newCredits } = (await cr.json()) as { credits?: number };
            if (typeof newCredits === "number") onCreditsUpdate(newCredits);
          }
        } catch {
          onCreditsUpdate(Math.max(0, credits - 1));
        }
      } else if (data.deterministic) {
        toast({
          title: "Fixed on the server",
          description: data.explanation || "Imports, assets, or dependencies were corrected without AI.",
        });
      } else {
        toast({
          title: "Free Try-to-fix applied",
          description:
            typeof data.freeFixesRemainingToday === "number"
              ? `${data.freeFixesRemainingToday} free fixes left today`
              : "Used a free daily fix — no credits charged",
        });
      }

      // Refresh files from DB
      const supabase = createClient();
      const { data: updatedFiles } = await supabase
        .from("project_files")
        .select("*")
        .eq("project_id", project.id);

      const previewWaitSince = Date.now();
      if (updatedFiles) onFilesUpdate(updatedFiles, { replace: true });
      const freeNote = data.deterministic
        ? " _(server · no AI)_"
        : data.free && typeof data.freeFixesRemainingToday === "number"
          ? ` _(free · ${data.freeFixesRemainingToday} left today)_`
          : data.free
            ? " _(free)_"
            : "";
      const successMsg: Message = {
        id: `autofix-done-${Date.now()}`,
        project_id: project.id,
        role: "assistant",
        content: `✅ **Auto-fix applied**${freeNote} — ${data.explanation ?? "Fixed the error, check the preview."}`,
        tokens_used: data.tokensUsed ?? null,
        model: DEFAULT_CODING_MODEL,
        mode: "build",
        metadata: null,
        rating: null,
        created_at: new Date().toISOString(),
      };
      onMessagesUpdate([...messagesWithFixing, successMsg]);
      const previewOk = await waitForPreviewSuccess(
        GENERATION_PREVIEW_WAIT_MS,
        typeof window === "undefined" ? new EventTarget() : window,
        previewWaitSince,
      );
      healActiveRef.current = false;
      if (previewOk) {
        onAutoFixComplete?.();
        window.dispatchEvent(new CustomEvent("lifemark-preview-heal-done"));
      } else {
        window.dispatchEvent(new CustomEvent("lifemark-preview-heal-failed"));
      }
    } catch {
      const errMsg: Message = {
        id: `autofix-fail-${Date.now()}`,
        project_id: project.id,
        role: "assistant",
        content: `❌ **Auto-fix failed.** Please describe the error in the chat and I'll fix it manually.`,
        tokens_used: null,
        model: null,
        mode: "build",
        metadata: null,
        rating: null,
        created_at: new Date().toISOString(),
      };
      onMessagesUpdate([...messagesWithFixing, errMsg]);
    } finally {
      setAutoFixing(false);
      // Both of these were only reset on the happy path. A throw anywhere
      // above — the fetch, the Supabase refetch, a JSON parse — left
      // `healActiveRef` latched true, which permanently disabled the auto-fix
      // effect for the rest of the session, and left the preview overlay
      // spinning on "Self-repairing…" with no button. Releasing them in
      // `finally` makes both states impossible to strand. Re-dispatching
      // heal-failed after a successful heal-done is harmless: the guard has
      // already cleared and `failHealing` only moves a still-frozen phase.
      const stranded = healActiveRef.current;
      healActiveRef.current = false;
      if (stranded) {
        window.dispatchEvent(new CustomEvent("lifemark-preview-heal-failed"));
      }
    }
  }

  // Extract role names from project knowledge text. Recognises a "Roles" section
  // OR any mention of common app-role nouns. Returns up to 4 unique roles.
  function extractRoles(knowledgeText: string | null | undefined): string[] {
    if (!knowledgeText) return [];
    const text = knowledgeText.toLowerCase();
    const COMMON_ROLES = [
      "admin", "administrator", "user", "investor", "startup",
      "manager", "owner", "editor", "viewer", "guest",
      "moderator", "customer", "seller", "buyer", "agent",
      "reviewer", "approver", "founder", "operator",
    ];
    const found = new Set<string>();
    for (const role of COMMON_ROLES) {
      // Word-boundary match so "user" doesn't match "useradmin"
      const re = new RegExp(`\\b${role}\\b`, "i");
      if (re.test(text)) {
        // Title-case the role for display
        found.add(role.charAt(0).toUpperCase() + role.slice(1));
      }
      if (found.size >= 4) break;
    }
    // Filter out the very generic "User" if other more-specific roles exist
    const list = [...found];
    if (list.length > 1 && list.includes("User")) {
      return list.filter((r) => r !== "User").slice(0, 4);
    }
    return list.slice(0, 4);
  }

  // Build multi-role test prompts. Triggered when the latest build/agent run
  // touched 5+ files AND the project knowledge identifies multiple roles.
  function buildRoleTestChips(generatedFiles: string[]): string[] {
    if (generatedFiles.length < 5) return [];
    const roles = extractRoles(project.knowledge);
    if (roles.length < 2) return [];
    return roles.map((r) => `Test the new changes as the ${r} role`);
  }

  // Generate 3 follow-up suggestion chips from the AI response + user message context
  function generateSuggestions(userMsg: string, aiResponse: string, generatedFiles: string[]): string[] {
    const hasFiles = generatedFiles.length > 0;
    const lowerUser = userMsg.toLowerCase();
    const lowerAi = aiResponse.toLowerCase();

    const pool: string[] = [];

    // File-based suggestions
    if (hasFiles) {
      pool.push("Add dark mode support", "Make it mobile responsive", "Add loading states and animations");
      if (generatedFiles.some((f) => f.includes("auth") || f.includes("login"))) pool.push("Add OAuth with GitHub", "Add email verification flow");
      if (generatedFiles.some((f) => f.includes("dashboard") || f.includes("chart"))) pool.push("Add real-time data updates", "Export data as CSV");
      if (generatedFiles.some((f) => f.includes("form"))) pool.push("Add form validation with error messages", "Add a success confirmation step");
      if (generatedFiles.some((f) => f.includes("api") || f.includes("route"))) pool.push("Add error handling and retry logic", "Add API rate limiting");
    }

    // Content-based suggestions
    if (lowerAi.includes("button") || lowerUser.includes("button")) pool.push("Add hover and click animations", "Add keyboard shortcuts");
    if (lowerAi.includes("color") || lowerUser.includes("color") || lowerUser.includes("style")) pool.push("Try a different color palette", "Add a gradient background");
    if (lowerAi.includes("list") || lowerUser.includes("list") || lowerAi.includes("table")) pool.push("Add search and filter functionality", "Add pagination");
    if (lowerUser.includes("fix") || lowerUser.includes("error") || lowerUser.includes("bug")) pool.push("Add error boundaries", "Write unit tests for this component");
    if (lowerAi.includes("component") || lowerAi.includes("react")) pool.push("Extract into a reusable component", "Add prop types and documentation");
    if (lowerUser.includes("deploy") || lowerAi.includes("deploy")) pool.push("Set up a CI/CD pipeline", "Add environment variable handling");

    // Generic quality improvements
    const generic = [
      "Improve the UI with better spacing",
      "Add empty and error states",
      "Add keyboard accessibility (ARIA)",
      "Optimize for performance",
      "Add unit tests",
      "Add TypeScript types",
    ];
    pool.push(...generic);

    // Deduplicate and pick 3 random ones (weighted toward specific suggestions)
    const unique = [...new Set(pool)];
    const specific = unique.filter((s) => !generic.includes(s));
    const rest = unique.filter((s) => generic.includes(s));
    const ordered = [...specific, ...rest];
    const picked: string[] = [];
    const used = new Set<number>();
    while (picked.length < 3 && used.size < ordered.length) {
      const idx = Math.floor(Math.random() * ordered.length);
      if (!used.has(idx)) { used.add(idx); picked.push(ordered[idx]); }
    }
    return picked;
  }

  async function loadCrossProjects() {
    if (crossProjectsLoaded) return;
    try {
      const res = await fetch("/api/projects");
      if (!res.ok) return;
      const data = normalizeArrayResponse<{id:string;name:string;slug:string}>(
        await res.json(),
        "projects",
      );
      const others = data.filter((p) => p.id !== project.id);
      setCrossProjects(others);
      setCrossProjectsLoaded(true);
    } catch { /* ignore */ }
  }

  async function loadCrossProjectFiles(projectId: string) {
    if (crossProjectFiles[projectId]) return;
    try {
      const res = await fetch("/api/projects/" + projectId + "/files");
      if (!res.ok) return;
      const data = normalizeArrayResponse<{path:string}>(await res.json(), "files");
      setCrossProjectFiles((prev) => ({ ...prev, [projectId]: data }));
    } catch { /* ignore */ }
  }

  async function loadSkills() {
    if (skillsLoaded) return;
    try {
      const res = await fetch("/api/skills");
      if (res.ok) {
        const data = await res.json();
        setSkills(data);
        setSkillsLoaded(true);
      }
    } catch { /* ignore */ }
  }

  function applySkill(prompt: string, skillId?: string) {
    setInput(prompt);
    setShowSkillPicker(false);
    setSkillSearch("");
    // Increment use count for custom skills
    if (skillId) {
      void fetch("/api/skills?id=" + skillId, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ incrementUse: true }),
      }).catch(() => {});
    }
  }

  function toggleStepApproval(msgId: string, idx: number) {
    setApprovedSteps((prev) => {
      const existing = new Set(prev[msgId] ?? []);
      if (existing.has(idx)) existing.delete(idx); else existing.add(idx);
      return { ...prev, [msgId]: existing };
    });
  }

  function executeApprovedSteps(msgId: string, steps: string[]) {
    const selected = approvedSteps[msgId] ?? new Set(Array.from({ length: steps.length }, (_, i) => i));
    const selectedSteps = steps.filter((_, i) => selected.has(i));
    if (selectedSteps.length === 0) return;
    const prompt = "Implement these approved steps in order:\n\n" + selectedSteps.map((s, i) => (i + 1) + ". " + s).join("\n");
    onModeChange?.("build");
    void sendMessage(prompt, "build");
  }

  async function sendMessage(
    userMessage: string,
    overrideMode?: EditorMode,
    historyOverride?: Message[],
    opts?: {
      branchMeta?: { snapshotId: string | null; branchedAt: string };
      imageBase64?: string | null;
      imageName?: string | null;
      attachedText?: { name: string; content: string } | null;
      /** Skip server-side mode downgrades (used by the patch→build fallback retry). */
      forceBuild?: boolean;
      /** Don't append a user bubble — used after the interview (original prompt is already in the thread). */
      skipOptimisticUser?: boolean;
      /** Don't persist that same prompt again as a user row. */
      skipUserPersist?: boolean;
      /** Live interview: ask the model for the next question given answers so far. */
      clarifyContinue?: boolean;
      originalPrompt?: string;
      clarifyHistory?: Array<{ question: string; answer: string }>;
      clarifySession?: ClarifySession;
    },
  ) {
    const queuedImage = opts?.imageBase64 ?? attachedImage;
    const queuedImageName = opts?.imageName ?? attachedImageName;
    const queuedText = opts?.attachedText ?? combinedAttachedText;
    if ((!userMessage.trim() && !queuedImage) || streaming || sendingRef.current) return;
    if (
      activeClarifySession &&
      !opts?.forceBuild &&
      !opts?.clarifyContinue &&
      userMessage.trim() &&
      !queuedImage
    ) {
      setInput("");
      answerClarifyRef.current(userMessage.trim());
      return;
    }
    // Claim the re-entrancy guard IMMEDIATELY (synchronously, before any
    // `await`) rather than after the credits-refresh fetch below. The old
    // placement left a real window open: two overlapping sendMessage() calls
    // (e.g. double-Enter) both pass the guard above, both `await` the same
    // credits fetch, and both proceed — building two competing tempUserMsg
    // objects from the same stale `messages` closure, overwriting each
    // other's optimistic append, and racing over the single
    // abortControllerRef/streamingContent state. Every early-return between
    // here and the streaming send below must reset this back to false.
    sendingRef.current = true;
    if (opts?.clarifySession) {
      clarifySessionRef.current = opts.clarifySession;
    }
    // Set when an AUTO-routed surgical patch missed — after this stream ends we
    // silently retry the same request as a full build (agent resilience).
    let patchFallbackMessage: string | null = null;
    let pendingClarifyBuild: string | null = null;

    // The user is giving a new instruction, so the code is about to change. Past
    // auto-fix failures were about the OLD code — forget them, and let the fixer
    // have a fresh budget against whatever this build produces.
    clearAutoFixLedger(project.id);
    setAutoFixAttempts(0);
    // Any new message supersedes a paused one, so the override chip should not
    // outlive the question that raised it. If this send trips the guard too,
    // the stream handler sets it again.
    setScopeHeldPrompt(null);

    let effectiveMode = resolvePromptMode(userMessage, intelCtx, overrideMode);
    // ── Lovable machinery parity: BUILDS RUN THE FULL AGENT LOOP ────────────
    // On existing projects, structural Build requests execute the ReAct agent
    // (read/edit/write tools, preview+console introspection, db/web tools)
    // instead of a monolithic JSON regeneration — surgical, verifiable edits.
    // Questions still route to chat and micro-edits to patch (server-side),
    // and fresh scaffolds keep the fast blueprint builder. Opt out with
    // NEXT_PUBLIC_AGENT_BUILDS=false.
    // Database/backend design requests get Lovable-style pre-build questions
    // (schema, auth method, roles) — computed BEFORE the agent flip so the
    // request stays in build mode where the clarify pipeline lives.
    const dbClarifyIntent =
      !opts?.forceBuild &&
      files.length > 0 &&
      /\b(database|schema|tables?|migrations?|auth(entication)?|sign[ -]?up|log[ -]?in|user accounts?|roles?|permissions|admin (panel|dashboard)|crud)\b/i.test(
        userMessage,
      );
    const capabilityClarifyIntent = shouldClarifyCapabilities(userMessage, opts?.forceBuild === true);
    const wantsClarify =
      !opts?.forceBuild &&
      !opts?.clarifyContinue &&
      (dbClarifyIntent ||
        capabilityClarifyIntent ||
        isOpenEndedGreenfieldStart(userMessage, countUserAuthoredFiles(files)) ||
        (clarifyFirst && shouldClarifyBeforeBuild(userMessage, countUserAuthoredFiles(files))));
    const interviewing = wantsClarify || opts?.clarifyContinue === true;
    // Interview is a chat turn. Forcing build mode made hello look like a
    // generation (Working…, file steps) before any question appeared.
    if (interviewing) {
      effectiveMode = "chat";
    }
    if (
      effectiveMode === "build" &&
      countUserAuthoredFiles(files) > 0 &&
      !opts?.forceBuild &&
      !wantsClarify &&
      process.env.NEXT_PUBLIC_AGENT_BUILDS !== "false" &&
      !isInformationalQuery(userMessage) &&
      !isSmallSurgicalEdit(userMessage)
    ) {
      effectiveMode = "agent";
    }
    // Our own router (not the user) chose surgical patch mode. The server needs
    // to know so a patch miss triggers the silent patch→build fallback instead
    // of surfacing "try rephrasing" (which is only fair when the USER picked patch).
    const autoRoutedPatchClient =
      effectiveMode === "patch" && mode !== "patch" && overrideMode !== "patch";
    const effectiveModel = modelManuallySelectedRef.current
      ? selectedModel
      : resolveSmartModel(effectiveMode, intelCtx, userMessage);

    // Multi-agent team mode: in Agent mode with the Team toggle on, run the full
    // Editor Intelligence orchestrator (lens debate + waves + durable run) in the
    // Intelligence panel instead of the single-model agent route. Persist the user
    // turn first so the chat timeline isn't empty, then hand off.
    if (effectiveMode === "agent" && multiAgent) {
      const tempUserMsg: Message = {
        id: `temp-team-${Date.now()}`,
        project_id: project.id,
        role: "user",
        content: userMessage.trim() || "[Team run]",
        tokens_used: null,
        model: null,
        mode: "agent",
        metadata: { multi_agent: true } as Json,
        rating: null,
        created_at: new Date().toISOString(),
      };
      onMessagesUpdate([...messages, tempUserMsg]);
      void fetch(`/api/projects/${project.id}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: tempUserMsg.content,
              mode: "agent",
              metadata: { multi_agent: true },
            },
          ],
        }),
      }).catch(() => {/* best-effort */});
      setInput("");
      setAttachedImage(null);
      setAttachedImageName(null);
      setAttachedFiles([]);
      onOpenPanel?.("intelligence");
      window.dispatchEvent(new CustomEvent("lifemark-intelligence-run", {
        detail: { goal: userMessage, fromChat: true },
      }));
      sendingRef.current = false;
      return;
    }

    let availableCredits = credits;
    const minCredits = effectiveMode === "agent" ? AGENT_MIN_CREDITS : 1;
    // Always refresh when low — stale 0 (or "Simulate 0 credits") used to
    // silently return here for chat/build/patch, so nothing appeared in history.
    if (availableCredits < minCredits) {
      try {
        const cr = await fetch("/api/billing/credits");
        if (cr.ok) {
          const { credits: fresh } = (await cr.json()) as { credits?: number };
          if (typeof fresh === "number") {
            availableCredits = fresh;
            onCreditsUpdate(fresh);
          }
        }
      } catch { /* use prop value */ }
    }
    if (availableCredits < minCredits) {
      toast({
        title: "Insufficient credits",
        description:
          effectiveMode === "agent"
            ? `Agent mode needs at least ${AGENT_MIN_CREDITS} credits.`
            : "Add credits or upgrade your plan to continue. (Dev: use Grant 100 credits if the balance is stuck at 0.)",
        variant: "destructive",
      });
      sendingRef.current = false;
      return;
    }
    // Keep the mode chip in sync whenever intelligence upgrades Chat/Build → patch/agent
    // (otherwise the UI still says "Chat" while files are being written — or worse,
    // Chat stayed as Chat and only streamed prose with no file saves).
    if (!interviewing && effectiveMode !== mode) {
      onModeChange?.(effectiveMode);
      if (
        (mode === "chat" || mode === "build") &&
        (effectiveMode === "patch" || effectiveMode === "build" || effectiveMode === "agent") &&
        effectiveMode !== mode
      ) {
        toast({
          title: "Applying your edit",
          description:
            effectiveMode === "patch"
              ? "Running as Quick Edit so the header (and other files) actually update."
              : `Running as ${effectiveMode} so your changes are saved to the project.`,
        });
      }
    } else if (
      !interviewing &&
      effectiveMode === "chat" &&
      files.length > 0 &&
      looksLikeEditRequest(userMessage)
    ) {
      // Lovable honesty: ask-mode won't touch the preview — tell the user how to edit.
      toast({
        title: "Ask mode — preview won't change",
        description: "Switch to Build (or say /build) so this edit is applied to your app.",
      });
    }
    // sendingRef.current was already claimed synchronously right after the
    // top guard (see comment there) — not re-set here so the placement stays
    // obviously correct rather than looking like a duplicate no-op.
    setInput("");
    // Request desktop notification permission on first build (non-blocking)
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    setStreamingWithCallback(true, 0);
    if (interviewing) setClarifyStreaming(true);
    genStartRef.current = Date.now();
    setStoppedDraft(null);
    setShowDraftBanner(false);
    removeKey(composerDraftKey);
    setStreamingContent("");
    setStreamingFiles([]);
    setPendingSkills([]);
    setSubagentSteps([]);
    setPreviewVerify(null);
    const imageToSend = queuedImage;
    const imageNameToSend = queuedImageName;
    setAttachedImage(null);
    setAttachedImageName(null);
    const textToSend = queuedText;
    setAttachedFiles([]);
    const contextFilesToSend = contextFiles;
    setContextFiles([]);
    // Capture + clear URL scrape state
    const scrapedMetaToSend = scrapedMeta;
    const detectedUrlToSend = detectedUrl;
    setDetectedUrl(null);
    setScrapedMeta(null);

    // Agent mode: initialise task step visibility
    if (interviewing) {
      setAgentSteps([]);
      setBuildStatus(null);
      applyBuildSteps([]);
    } else if (effectiveMode === "agent") {
      serverStreamedPathsRef.current = new Set<string>();
      setAgentSteps([{ label: "Starting agent...", status: "running", kind: "other", key: "start" }]);
      setBuildStatus(null);
    } else if (effectiveMode === "build" || effectiveMode === "patch") {
      setAgentSteps([]);
      const intent = classifyBuildIntent(userMessage);
      setBuildStatus(intent);
      applyBuildSteps(initialBuildActivitySteps(files.length));
    } else {
      setAgentSteps([]);
      setBuildStatus(null);
      applyBuildSteps([]);
    }

    // Set up AbortController for stop generation
    const controller = new AbortController();
    abortControllerRef.current = controller;
    // Throttle timer for streaming UI updates (declared here so `finally`
    // can clear it on any exit path).
    let streamFlushTimer: ReturnType<typeof setTimeout> | null = null;

    // Auto-snapshot before AI modifies files (Build / Agent / Patch modes).
    // This must finish before the generation request begins. Fire-and-forget
    // allowed a fast build to replace files before the snapshot route read
    // them, producing an "undo" snapshot of the already-modified project.
    if ((effectiveMode === "build" || effectiveMode === "agent" || effectiveMode === "patch") && files.length > 0) {
      try {
        const snapshotRes = await fetch("/api/projects/snapshots", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: project.id,
            label: `Before: ${userMessage.slice(0, 60)}${userMessage.length > 60 ? "…" : ""}`,
          }),
          signal: controller.signal,
        });
        if (!snapshotRes.ok) {
          toast({
            title: "Undo checkpoint unavailable",
            description: "The build can continue, but this turn may not be reversible from History.",
            variant: "destructive",
          });
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          toast({
            title: "Undo checkpoint unavailable",
            description: "The build can continue, but this turn may not be reversible from History.",
            variant: "destructive",
          });
        }
      }
    }

    // Optimistically add user message
    const branchMeta = opts?.branchMeta ?? pendingBranchRef.current;
    const tempUserMsg: Message = {
      id: `temp-${Date.now()}`,
      project_id: project.id,
      role: "user",
      content: userMessage.trim() ? userMessage : "[Image attached]",
      tokens_used: null,
      model: null,
      // EditorMode includes "patch" but the persisted Message['mode'] does
      // not. "patch" is a transient client-only mode, so collapse it to
      // "build" for the optimistic user message.
      mode: (effectiveMode === "patch" ? "build" : effectiveMode) as "chat" | "plan" | "build" | "agent",
      metadata: branchMeta
        ? ({
            branched_at: branchMeta.branchedAt,
            branch_from_snapshot_id: branchMeta.snapshotId,
          } as Json)
        : null,
      rating: null,
      created_at: new Date().toISOString(),
    };
    const baseMessages = historyOverride ?? messages;
    const skipOptimisticUser = opts?.skipOptimisticUser === true;
    if (!skipOptimisticUser) {
      onMessagesUpdate([...baseMessages, tempUserMsg]);
    }
    const commitTurn = (...rest: Message[]) => {
      onMessagesUpdate(
        skipOptimisticUser ? [...baseMessages, ...rest] : [...baseMessages, tempUserMsg, ...rest],
      );
    };

    /**
     * Report a failure without erasing what the user typed.
     *
     * Every failure path used to call `onMessagesUpdate(baseMessages)`, which
     * is the message list from BEFORE the optimistic user message — so the
     * prompt the user had just written vanished from the thread along with any
     * chance of resending it, leaving a five-second toast as the only evidence
     * anything had happened at all. That is the "nothing happens when I hit
     * send" report. Keep `tempUserMsg`, and put the explanation under it.
     */
    const failInChat = (input: { status?: number; rawError?: string | null }) => {
      const described = describeAiFailure(input);
      const errMsg: Message = {
        id: `ai-error-${Date.now()}`,
        project_id: project.id,
        role: "assistant",
        content: described.chatMarkdown,
        tokens_used: null,
        model: null,
        mode: (effectiveMode === "patch" ? "build" : effectiveMode) as
          | "chat" | "plan" | "build" | "agent",
        metadata: null,
        rating: null,
        created_at: new Date().toISOString(),
      };
      commitTurn(errMsg);
      toast({
        title: described.title,
        description: described.summary,
        variant: "destructive",
      });
      return described;
    };

    try {
      // If user sent an image without a custom message (or only the auto-suggested mockup prompt),
      // prepend a strong mockup-to-code system instruction so the AI knows to reproduce the UI.
      let userMessageFinal = userMessage;
      if (imageToSend && !userMessage.trim()) {
        userMessageFinal = "Recreate this UI as a complete React component. Match the layout, colors, typography, spacing, and all visual elements exactly. Use Tailwind CSS for styling. Make it fully interactive and production-ready.";
      } else if (imageToSend && userMessage.trim()) {
        // Prepend a short image-context hint so the AI knows there's a visual reference
        userMessageFinal = `[Image attached — use it as a visual reference]\n${userMessage}`;
      }

      // Inject scraped URL content when available
      if (scrapedMetaToSend && detectedUrlToSend) {
        const pageBlock = [
          `<scraped_page url="${detectedUrlToSend}">`,
          scrapedMetaToSend.title ? `Title: ${scrapedMetaToSend.title}` : "",
          scrapedMetaToSend.description ? `Description: ${scrapedMetaToSend.description}` : "",
          "",
          scrapedMetaToSend.textContent ? scrapedMetaToSend.textContent.slice(0, 6000) : "",
          `</scraped_page>`,
        ].filter(Boolean).join("\n");
        userMessageFinal = `${pageBlock}\n\n${userMessageFinal}`;
      }

      // Prepend explicit context file attachments to the message
      let messageWithContext = userMessageFinal;
      if (contextFilesToSend.length > 0) {
        const contextBlock = contextFilesToSend.map((f) =>
          `<attached_file path="${f.path}">
${(f.content ?? "").slice(0, 8000)}
</attached_file>`
        ).join("\n\n");
        messageWithContext = `${contextBlock}\n\n${userMessageFinal}`;
      }

      messageWithContext = `${buildProjectContextBlock({ ...intelCtx, lastPrompt: userMessage })}\n\n${messageWithContext}`;

      // Extract @file mentions (current project) and @ProjectName/path (cross-project)
      // Include `:` so @chat:ProjectName and @project:… refs are captured.
      const mentionedPaths = [...userMessageFinal.matchAll(/@([\w./\-:]+)/g)].map((m) => m[1]);
      const mentionedFiles = mentionedPaths.length > 0
        ? files.filter((f) => mentionedPaths.some((p) => f.path.includes(p)))
        : null;

      // Line-level references (Lovable parity): @path:12 or @path:12-34.
      // For files referenced with line numbers, send only the referenced
      // slice (±5 lines, numbered) instead of the whole file — sharper focus
      // for the AI and fewer tokens.
      const lineRefs = [...userMessageFinal.matchAll(/@([\w./\-]+):(\d+)(?:-(\d+))?/g)]
        .map((m) => ({ path: m[1], start: parseInt(m[2], 10), end: parseInt(m[3] ?? m[2], 10) }));
      const mentionedFilesForAI = mentionedFiles?.map((f) => {
        const refs = lineRefs.filter((r) => f.path.includes(r.path));
        if (refs.length === 0) return { path: f.path, content: f.content };
        const lines = f.content.split("\n");
        const excerpts = refs.map((r) => {
          const s = Math.max(1, Math.min(r.start, r.end) - 5);
          const e = Math.min(lines.length, Math.max(r.start, r.end) + 5);
          const marked = lines.slice(s - 1, e).map((ln, i) => `${s + i}: ${ln}`).join("\n");
          return `// ${f.path} — referenced lines ${r.start}${r.end !== r.start ? `-${r.end}` : ""} (showing ${s}-${e} with line numbers)\n${marked}`;
        });
        return { path: f.path, content: excerpts.join("\n// …\n") };
      }) ?? null;

      // Extract cross-project references: @ProjectName/path/to/file and @chat:ProjectName
      const crossProjectRefs = crossProjects.flatMap((p) => {
        const prefix = p.name + "/";
        return mentionedPaths
          .filter((mp) => mp.startsWith(prefix))
          .map((mp) => ({ projectId: p.id, projectName: p.name, filePath: mp.slice(prefix.length) }));
      });
      const crossChatRefs = [
        ...mentionedPaths
          .filter((mp) => mp.startsWith("chat:"))
          .map((mp) => {
            const name = mp.slice("chat:".length).trim();
            const p = crossProjects.find(
              (cp) => cp.name === name || cp.slug === name || cp.name.replace(/\s+/g, "-") === name,
            );
            return p ? { projectId: p.id, projectName: p.name } : null;
          })
          .filter(Boolean) as Array<{ projectId: string; projectName: string }>,
      ];
      let crossProjectContext = "";
      if (crossProjectRefs.length > 0) {
        const fetched = await Promise.all(
          crossProjectRefs.map(async (ref) => {
            try {
              const r = await fetch("/api/projects/" + ref.projectId + "/files");
              if (!r.ok) return null;
              const referencedFiles = normalizeArrayResponse<{path:string;content:string}>(
                await r.json(),
                "files",
              );
              const match = referencedFiles.find((f) => f.path === ref.filePath);
              if (!match) return null;
              return "// Cross-project reference: @" + ref.projectName + "/" + ref.filePath + "\n" + match.content;
            } catch { return null; }
          })
        );
        const valid = fetched.filter(Boolean) as string[];
        if (valid.length > 0) {
          crossProjectContext = "\n\n--- Referenced files from other projects ---\n" + valid.join("\n\n---\n");
        }
      }
      if (crossChatRefs.length > 0) {
        const chatFetched = await Promise.all(
          crossChatRefs.map(async (ref) => {
            try {
              const r = await fetch(`/api/projects/${ref.projectId}/messages?limit=30`);
              if (!r.ok) return null;
              const body = (await r.json()) as { messages?: Array<{ role: string; content: string }> };
              const msgs = Array.isArray(body.messages) ? body.messages : [];
              if (msgs.length === 0) return null;
              const transcript = msgs
                .slice(-20)
                .map((m) => `${m.role === "user" ? "User" : "AI"}: ${(m.content ?? "").slice(0, 600)}`)
                .join("\n");
              return `--- Chat history from @chat:${ref.projectName} ---\n${transcript}`;
            } catch {
              return null;
            }
          }),
        );
        const chatValid = chatFetched.filter(Boolean) as string[];
        if (chatValid.length > 0) {
          crossProjectContext +=
            (crossProjectContext ? "\n\n" : "\n\n") + chatValid.join("\n\n");
        }
      }

      if (effectiveMode === "agent") {
        const agentTask = messageWithContext + crossProjectContext;
        const res = await fetch("/api/ai/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          signal: controller.signal,
          body: JSON.stringify({
            projectId: project.id,
            task: agentTask,
            rawTask: userMessage,
            ...(modelManuallySelectedRef.current ? { model: effectiveModel } : {}),
            modelManuallySelected: modelManuallySelectedRef.current,
            // Prefer live Modal preview URL over published deploy for browse_preview.
            previewUrl: (() => {
              try {
                return sessionStorage.getItem("lifemark-live-preview-url") || undefined;
              } catch {
                return undefined;
              }
            })(),
          }),
        });

        if (!res.ok || !res.body) {
          // The agent route now rejects informational questions (409) rather than
          // burning a 30-iteration run on something needing no edits. Silently
          // re-send in chat mode — the user asked a question, they should just
          // get an answer, not an error telling them to try again differently.
          if (res.status === 409) {
            let payload: { error?: string } | null = null;
            try { payload = await res.json(); } catch { /* ignore */ }
            if (payload?.error === "informational_query") {
              setStreaming(false);
              onModeChange?.("chat");
              void sendMessage(userMessage, "chat");
              return;
            }
          }
          const described = failInChat({
            status: res.status,
            rawError: await readErrorBody(res),
          });
          if (res.status === 402 && !described.isPlatformFault) {
            // Only re-read the balance for a USER-level 402. On a platform
            // 402 the user's credits are untouched, and refetching them would
            // repaint a number that had nothing to do with the failure.
            try {
              const cr = await fetch("/api/billing/credits");
              if (cr.ok) {
                const { credits: newCredits } = (await cr.json()) as { credits?: number };
                if (typeof newCredits === "number") onCreditsUpdate(newCredits);
              }
            } catch {}
          }
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        const changedPaths = new Set<string>();
        // SSE lines routinely split across network chunks (and multi-byte
        // UTF-8 can split across reads). Buffer the trailing partial line so
        // JSON.parse never sees a truncated payload and silently drops it.
        let sseTail = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = sseTail + decoder.decode(value, { stream: true });
          const lines = text.split("\n");
          sseTail = lines.pop() ?? "";
          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));

              if (data.step) {
                const step = data.step as AgentStep;
                setAgentSteps((prev) => mergeAgentStep(prev, step));
                // Connector approval card (Lovable parity): a blocked write
                // surfaces as an approval_required observation.
                const obs = step.type === "observation" ? step.content ?? "" : "";
                if (obs.includes('"approval_required":true')) {
                  try {
                    const payload = JSON.parse(obs.slice(obs.indexOf("{"))) as { connector?: string; method?: string; path?: string; summary?: string };
                    if (payload.connector) {
                      setConnectorApproval({
                        connector: payload.connector,
                        method: payload.method ?? "POST",
                        path: payload.path ?? "",
                        summary: payload.summary ?? `${payload.method} ${payload.path} via ${payload.connector}`,
                        retryPrompt: userMessage,
                      });
                    }
                  } catch { /* malformed — ignore */ }
                }
                // browse_preview screenshot → chat thumbnail (applied to assistant id on done)
                const shotMatch = obs.match(/screenshot_url=(https?:\/\/\S+)/);
                if (shotMatch?.[1]) {
                  pendingBrowseShotRef.current = shotMatch[1];
                  setMessageScreenshots((prev) => ({ ...prev, __pending__: shotMatch[1]! }));
                }
              }

              if (typeof data.fileUpdated?.path === "string") {
                changedPaths.add(data.fileUpdated.path);
                setStreamingFiles(Array.from(changedPaths));
                onStreamingChange?.(true, changedPaths.size);
              }

              // Backend wiring + self-verification progress (Lovable-style)
              if (typeof data.wiring_status === "string" || typeof data.verify_status === "string") {
                setPostBuildStatus((data.wiring_status ?? data.verify_status) as string);
              }

              // Cloud ops approval card (pause / wake / resize from chat)
              if (data.cloud_action && typeof data.cloud_action === "object") {
                const ca = data.cloud_action as { kind: "pause" | "resume" | "resize"; currentTier: string; paused: boolean; actionable: boolean };
                if (ca.actionable) {
                  setCloudAction(ca);
                  setCloudTierPick(ca.currentTier || "tiny");
                }
              }

              if (data.done) {
                setPostBuildStatus(null);
                setAgentSteps((prev) => prev.map((s) => ({ ...s, status: "done" as const })));
                setTimeout(() => setAgentSteps([]), 5000);

                const previewWaitSince = Date.now();
                const supabase = createClient();
                const { data: updatedFiles } = await supabase
                  .from("project_files")
                  .select("*")
                  .eq("project_id", project.id);

                if (updatedFiles) {
                  const diffSource = Array.from(changedPaths).map((path) => {
                    const row = (updatedFiles as Array<{ path: string; content: string }>).find((f) => f.path === path);
                    return { path, content: row?.content ?? "" };
                  });
                  const assistantId =
                    (typeof data.assistantMessageId === "string" && data.assistantMessageId) ||
                    `assistant-${Date.now()}`;
                  const diffs: FileDiffEntry[] = diffSource
                    .map((newFile) => {
                      const oldFile = files.find((f) => f.path === newFile.path);
                      return {
                        path: newFile.path,
                        fileId: oldFile?.id,
                        oldContent: oldFile?.content ?? "",
                        newContent: newFile.content ?? "",
                      };
                    })
                    .filter((d) => d.oldContent !== d.newContent || !files.find((f) => f.path === d.path));
                  if (diffs.length > 0) {
                    setMessageDiffs((prev) => ({ ...prev, [assistantId]: diffs }));
                    setCanUndo(true);
                  }
                  if (Array.isArray(updatedFiles) && updatedFiles.length > 0) {
                    onFilesUpdate(updatedFiles, { replace: true });
                  }
                  if (healActiveRef.current) {
                    healSettlingRef.current = true;
                    void (async () => {
                      const previewOk = await waitForPreviewSuccess(
                        GENERATION_PREVIEW_WAIT_MS,
                        typeof window === "undefined" ? new EventTarget() : window,
                        previewWaitSince,
                      );
                      healActiveRef.current = false;
                      healSettlingRef.current = false;
                      if (previewOk) {
                        window.dispatchEvent(new CustomEvent("lifemark-preview-heal-done"));
                        onAutoFixComplete?.();
                      } else {
                        window.dispatchEvent(new CustomEvent("lifemark-preview-heal-failed"));
                      }
                    })();
                  }

                  const missingPkgs = findMissingPackages(diffSource, updatedFiles.find((f: { path: string }) => f.path === "package.json")?.content ?? null);
                  if (missingPkgs.length > 0) {
                    const pkgContent = updatedFiles.find((f: { path: string; content: string }) => f.path === "package.json")?.content;
                    if (pkgContent) {
                      const sync = syncPackageJsonDeps(updatedFiles as Array<{ path: string; content: string }>, pkgContent);
                      if (sync && sync.rejectedPackages.length > 0) {
                        toast({
                          title: "Some packages were not installed",
                          description: describeRejectedPackages(sync.rejectedPackages),
                          variant: "destructive",
                        });
                      }
                      if (sync && sync.addedPackages.length > 0) {
                        try {
                          const supabase = createClient();
                          await supabase.from("project_files").upsert({
                            project_id: project.id,
                            path: "package.json",
                            content: sync.updated,
                            language: "json",
                          }, { onConflict: "project_id,path" });
                          const { data: refreshed } = await supabase
                            .from("project_files")
                            .select("*")
                            .eq("project_id", project.id);
                          if (refreshed) onFilesUpdate(refreshed);
                        } catch { /* preview installs deps */ }
                      }
                    }
                  }
                }

                try {
                  const cr = await fetch("/api/billing/credits");
                  if (cr.ok) {
                    const { credits: newCredits } = (await cr.json()) as { credits?: number };
                    if (typeof newCredits === "number") onCreditsUpdate(newCredits);
                  }
                } catch {}

                const { data: syncedMessages } = await supabase
                  .from("messages")
                  .select("*")
                  .eq("project_id", project.id)
                  .order("created_at", { ascending: true });
                if (syncedMessages) {
                  onMessagesUpdate(
                    syncedMessages.map((message) => ({
                      ...message,
                      role: (["user", "assistant", "system"] as const).includes(
                        message.role as "user" | "assistant" | "system",
                      )
                        ? (message.role as "user" | "assistant" | "system")
                        : "assistant",
                      mode: (["chat", "agent", "plan", "build", "patch"] as const).includes(
                        message.mode as "chat" | "agent" | "plan" | "build" | "patch",
                      )
                        ? (message.mode as "chat" | "agent" | "plan" | "build" | "patch")
                        : "chat",
                      rating: message.rating === 1 || message.rating === -1 ? message.rating : null,
                    })),
                  );
                }

                const captureId = syncedMessages?.at(-1)?.id ?? `assistant-${Date.now()}`;
                const browseShot = pendingBrowseShotRef.current;
                pendingBrowseShotRef.current = null;
                if (browseShot) {
                  setMessageScreenshots((prev) => {
                    const { __pending__, ...rest } = prev;
                    return { ...rest, [captureId]: browseShot };
                  });
                  void fetch(`/api/projects/${project.id}/messages/${captureId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      metadata: { screenshot_url: browseShot },
                      mergeMetadata: true,
                    }),
                  }).catch(() => {});
                }
                void closeGenerationLoop(captureId, Boolean(browseShot), previewWaitSince);
              }

              if (data.error) {
                // Same treatment as every other failure: keep the user's
                // message, explain the cause under it. Shares describeAiFailure
                // with the pre-stream paths so a 402 cannot mean one thing here
                // and something else two hundred lines away.
                failInChat({ rawError: String(data.error) });
              }
            } catch {}
          }
        }
        return;
      }

      // Design baseline (starter template) chosen on the create screen — carried
      // in the editor URL (?template=). Only applied for build mode.
      const designTemplateId =
        typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("template") : null;
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          projectId: project.id,
          message: messageWithContext + crossProjectContext,
          rawMessage: userMessage,
          mode: effectiveMode,
          ...(autoRoutedPatchClient ? { autoRouted: true } : {}),
          ...(opts?.forceBuild ? { forceBuild: true } : {}),
          ...(opts?.skipUserPersist ? { skipUserPersist: true } : {}),
          ...(opts?.clarifyContinue
            ? {
                clarifyContinue: true,
                originalPrompt: opts.originalPrompt,
                clarifyHistory: opts.clarifyHistory ?? [],
              }
            : {}),
          // Declares that this client can pick up an `initiative_routed` handoff
          // (see the handler below). The server only promotes a build to the
          // 11-role team when it knows someone will run it — without this flag a
          // promoted request would silently do nothing.
          canRouteInitiative: true,
          ...(modelManuallySelectedRef.current ? { model: effectiveModel } : {}),
          modelManuallySelected: modelManuallySelectedRef.current,
          framework: mobileMode ? "react-native" : (project.framework ?? "web"),
          // Live interview: one model-written question per turn (or continue).
          clarifyFirst: wantsClarify,
          ...(effectiveMode === "build" && designTemplateId ? { templateId: designTemplateId } : {}),
          // If @mentions present, only send those files for context (saves tokens + focuses AI)
          files: mentionedFilesForAI
            ? mentionedFilesForAI
            : files.map((f) => ({ path: f.path, content: f.content })),
          ...(imageToSend ? { imageBase64: imageToSend, imageFileName: imageNameToSend } : {}),
          // `queuedText` is `string | { name, content } | null`: live sends carry
          // the object, but the QUEUE serialises the attachment down to a bare
          // string (see where queued items are built), losing the filename.
          // Reading .name/.content off the union unnarrowed meant a queued
          // message sent `{ name: undefined, content: undefined }` — the
          // attachment was silently dropped every time.
          ...(textToSend
            ? {
                attachedFile: {
                  name: textToSend.name,
                  content: textToSend.content.slice(0, 20000),
                },
              }
            : {}),
          // Lovable-agent parity: the AI always sees the CURRENT preview
          // console state, not only during explicit fix flows.
          ...(previewRuntimeErrors.length > 0
            ? {
                previewErrors: previewRuntimeErrors.slice(-5).map((e) => ({
                  kind: e.kind,
                  message: String(e.message ?? "").slice(0, 400),
                  filename: e.filename,
                  lineno: e.lineno,
                })),
              }
            : {}),
        }),
      });

      if (!res.ok || !res.body) {
        // Every non-2xx lands here, including the ones that used to fall
        // through to a bare `throw new Error("API error: 500")` and surface as
        // a toast the user could easily miss. The server's error body is read
        // rather than discarded — it is the only thing that distinguishes a
        // user out of credits from the platform's provider account being empty,
        // and telling the first story to the second user sends them to buy
        // credits that cannot possibly help.
        const described = failInChat({
          status: res.status,
          rawError: await readErrorBody(res),
        });
        if (res.status === 402 && !described.isPlatformFault) {
          onCreditsUpdate(0);
        }
        return;
      }

      let accumulated = "";
      const streamedPathTracker = createStreamedFilePathTracker();
      let hasPendingStreamedPathUpdate = false;
      const streamingAssistantId = `assistant-${Date.now()}`;
      let clarifyExited = false;
      // SSE callbacks are synchronous, while completion handlers refresh files,
      // persist messages, and can await preview work. Serialize those handlers
      // so a later `done` event cannot overtake an earlier status/file event.
      let streamEventQueue: Promise<void> = Promise.resolve();
      // Local mirror of pendingSkills — the async stream handlers below close
      // over the pre-send render, so reading `pendingSkills` state on data.done
      // would always be stale (empty, or worse, the PREVIOUS message's skills).
      let attachedSkills: Array<{ id: string; name: string; reason?: string }> = [];

      const processChatStreamEvent = async (data: Record<string, unknown>) => {
        try {
          if (data.chunk) return;

          // The scope guard paused instead of building. Its message is already
          // streaming in as an ordinary assistant reply; all that's needed here
          // is to remember what it paused on so the chip below can override.
          if (data.scope_query === true) {
            setScopeHeldPrompt(userMessage);
            return;
          }

          if (data.status === "no_files") {
            toast({
              title: "No files generated",
              description: (data.message as string | undefined) ?? "Try again or switch to a stronger model.",
              variant: "destructive",
            });
          }

          if (data.status === "patches_applied" && data.count != null) {
            const count = data.count as number;
            const paths = Array.isArray(data.paths)
              ? (data.paths as unknown[]).filter((p): p is string => typeof p === "string")
              : [];
            setPatchCounts((prev) => ({ ...prev, __pending: count }));
            if (paths.length > 0) {
              setMessageChangedPaths((prev) => ({ ...prev, __pending: paths }));
            }
            if (count > 0) {
              toast({
                title: "Edit applied",
                description: liveFileApplyRef.current
                  ? `Updated ${data.count} file${(data.count as number) === 1 ? "" : "s"}.`
                  : `Updated ${data.count} file${(data.count as number) === 1 ? "" : "s"}. Preview is refreshing…`,
              });
              if (!liveFileApplyRef.current) {
                void refreshProjectFiles().catch(() => {
                  toast({
                    title: "Refresh needed",
                    description: "The edit saved, but the preview did not refresh automatically. Use the preview refresh button.",
                    variant: "destructive",
                  });
                });
              }
            }
          }

          // ── Handed off to the 11-role engineering team ────────────────────
          // The server scored this request as a multi-part build and stopped
          // without generating or charging. Run the initiative the server chose,
          // and tell the user in-thread — a handoff the user cannot see is
          // indistinguishable from a request that was dropped.
          if (data.initiative_routed) {
            const routed = data.initiative_routed as {
              goal?: string;
              reason?: string;
              signals?: string[];
              budgetCredits?: number;
            };
            const signals = (routed.signals ?? []).map((s) => `• ${s}`).join("\n");
            onMessagesUpdate([
              ...baseMessages,
              {
                id: `initiative-routed-${Date.now()}`,
                project_id: project.id,
                role: "assistant",
                content:
                  `**Engineering team mode** — this looked like a multi-part build, so the ` +
                  `11-role team is planning it instead of a single pass.\n\n${signals}\n\n` +
                  `Budget ceiling: ${routed.budgetCredits ?? 0} credits. Progress appears in ` +
                  `the Intelligence panel. Ask again with "just build it" for a single-pass build.`,
                tokens_used: null,
                model: null,
                mode: "build",
                metadata: null,
                rating: null,
                created_at: new Date().toISOString(),
              } as Message,
            ]);
            onOpenPanel?.("intelligence");
            // Reuse the panel's existing external-run channel rather than adding a
            // second one — it already drives runBuild through a ref, so the goal
            // cannot go stale.
            window.dispatchEvent(
              new CustomEvent("lifemark-intelligence-run", {
                detail: { goal: routed.goal ?? userMessage },
              }),
            );
          }

          if (data.status === "patches_failed") {
            if ((data.auto_routed || autoRoutedPatchClient) && !opts?.forceBuild) {
              // The server auto-chose a surgical patch and it missed — fall
              // back to a full build automatically instead of asking the user
              // to rephrase (Lovable: the agent recovers on its own).
              patchFallbackMessage = userMessage;
              toast({
                title: "Switching to full edit",
                description: "The quick patch didn't match — rebuilding the change properly.",
              });
            } else {
              toast({
                title: "Edit not applied",
                description:
                  (data.message as string | undefined) ??
                  "The patch could not be applied. Try Quick Edit or rephrase.",
                variant: "destructive",
              });
            }
          }

          if (data.subagent) {
            const step = data.subagent as SubagentStep;
            setSubagentSteps((prev) => {
              const idx = prev.findIndex((s) => s.id === step.id);
              if (idx >= 0) {
                const next = [...prev];
                next[idx] = step;
                return next;
              }
              return [...prev, step];
            });
          }

          if (data.build_intent) {
            const intent = data.build_intent as BuildIntent;
            setBuildStatus(intent);
            applyBuildSteps((prev) =>
              prev.length > 0 ? applyBuildIntentLabel(prev, intent.statusLabel) : prev,
            );
          }

          if (Array.isArray(data.skills_attached) && data.skills_attached.length > 0) {
            attachedSkills = data.skills_attached.map((s: { id: string; name: string; reason?: string }) => ({
              id: s.id,
              name: s.name,
              reason: s.reason,
            }));
            setPendingSkills(attachedSkills);
          }

          if (typeof data.streamedFile === "string") {
            serverStreamedPathsRef.current.add(data.streamedFile);
            applyBuildSteps((prev) => (prev.length > 0 ? onBuildFileProgress(prev) : prev));
          }

          if (typeof data.wiring_status === "string" || typeof data.verify_status === "string") {
            setPostBuildStatus((data.wiring_status ?? data.verify_status) as string);
          }

          if (data.readyToBuild === true || Array.isArray(data.clarifying_questions)) {
            const incoming = Array.isArray(data.clarifying_questions)
              ? (data.clarifying_questions as Array<{
                  id: string;
                  question: string;
                  type?: string;
                  kind?: string;
                  multiple?: boolean;
                  options?: ClarifyQuestion["options"];
                }>).slice(0, 1)
              : [];
            const ack = typeof data.ack === "string" && data.ack.trim() ? data.ack.trim() : undefined;
            const original =
              typeof data.originalPrompt === "string" ? data.originalPrompt : userMessage;

            if (data.readyToBuild === true || incoming.length === 0) {
              const session = opts?.clarifySession ?? clarifySessionRef.current;
              persistClarifyTurns([
                { id: "clarify-build-lead-in", role: "assistant", content: CLARIFY_BUILD_LEAD_IN },
              ]);
              setActiveClarifySession(null);
              clarifySessionRef.current = null;
              pendingClarifyBuild = session
                ? buildClarifyEnrichedPrompt(normalizeClarifyInterview(session))
                : original;
              setStreamingWithCallback(false);
              setStreamingContent("");
              setStreamingFiles([]);
              clarifyExited = true;
              controller.abort();
              return;
            }

            if (opts?.clarifyContinue) {
              const session = opts?.clarifySession ?? clarifySessionRef.current;
              if (session && incoming[0]) {
                const next = appendLiveClarifyQuestion(
                  normalizeClarifyInterview(session),
                  incoming[0],
                );
                clarifySessionRef.current = next;
                setActiveClarifySession(next);
                persistClarifyTurns(liveClarifyQuestionTurn(normalizeClarifyInterview(next), ack));
                setTimeout(() => textareaRef.current?.focus(), 50);
              }
              setStreamingWithCallback(false);
              setStreamingContent("");
              setStreamingFiles([]);
              clarifyExited = true;
              controller.abort();
              return;
            }

            const openingSession = clarifySessionFromQuestions(
              original,
              incoming,
              isOpenEndedGreenfieldStart(userMessage, countUserAuthoredFiles(files)),
            );
            clarifySessionRef.current = openingSession;
            setActiveClarifySession(openingSession);
            const keptUser =
              typeof (data as { userMessageId?: string }).userMessageId === "string"
                ? { ...tempUserMsg, id: (data as { userMessageId: string }).userMessageId }
                : tempUserMsg;
            const withHello = skipOptimisticUser ? [...baseMessages] : [...baseMessages, keptUser];
            messagesRef.current = withHello;
            onMessagesUpdate(withHello);
            persistClarifyTurns(
              liveClarifyQuestionTurn(normalizeClarifyInterview(openingSession), ack),
            );
            setTimeout(() => textareaRef.current?.focus(), 50);
            setStreamingWithCallback(false);
            setStreamingContent("");
            setStreamingFiles([]);
            clarifyExited = true;
            controller.abort();
            return;
          }

          if (data.done) {
              // Auto-routed surgical patch parsed but every find string missed —
              // recover by rebuilding (patches_failed status only covers the
              // zero-patches case; this covers the all-missed case).
              if (data.patch_failed && (data.auto_routed || autoRoutedPatchClient) && !opts?.forceBuild && !patchFallbackMessage) {
                patchFallbackMessage = userMessage;
                toast({
                  title: "Switching to full edit",
                  description: "The quick patch didn't match — rebuilding the change properly.",
                });
              }
              setPostBuildStatus(null);
              const assistantId =
                (typeof data.assistantMessageId === "string" && data.assistantMessageId) ||
                streamingAssistantId;
              let completedBuildActivity: BuildActivityStep[] | null = null;

              const streamedCount = Math.max(
                serverStreamedPathsRef.current.size,
                (data.files as unknown[] | undefined)?.length ?? 0,
              );
              if (buildActivityStepsRef.current.length > 0) {
                completedBuildActivity = finalizeBuildActivity(
                  buildActivityStepsRef.current,
                  streamedCount,
                  { githubRepo: project.github_repo },
                );
              } else if (Array.isArray(data.build_activity) && data.build_activity.length > 0) {
                completedBuildActivity = data.build_activity as BuildActivityStep[];
              }
              if (completedBuildActivity) {
                const mapped: AgentTaskStep[] = completedBuildActivity.map((s) => ({
                  label: s.label,
                  status: "done" as const,
                  kind: "other" as const,
                  key: s.id,
                }));
                setAgentSteps(mapped);
                setTimeout(() => setAgentSteps([]), 5000);
                applyBuildSteps([]);
                setMessageBuildActivity((prev) => ({ ...prev, [assistantId]: completedBuildActivity! }));
              }
              setBuildStatus(null);
              // Update credits. Deduct from `availableCredits`, NOT the
              // `credits` prop this closure captured at call time: when the
              // low-credit guard above found `credits` stale (e.g. still 0
              // while the real balance was higher) it refreshed
              // `availableCredits` and pushed the correction via
              // onCreditsUpdate, but `credits` itself never changes for the
              // rest of this call. Subtracting from the stale prop here
              // computed a wrong (sometimes negative) balance and could lock
              // the composer into "insufficient credits" with real credits
              // still available, only fixable by a reload/project switch.
              if (typeof data.creditsUsed === "number") {
                onCreditsUpdate(availableCredits - data.creditsUsed);
                setMessageCredits((prev) => ({ ...prev, [assistantId]: data.creditsUsed as number }));
              }

              // Persist any auto-matched skills onto the final assistant message
              // and clear the pending state so the chip doesn't flash onto the
              // next stream's placeholder.
              if (attachedSkills.length > 0) {
                setMessageSkills((prev) => ({ ...prev, [assistantId]: attachedSkills }));
              }
              setPendingSkills([]);

              // Move any pending patch count from "__pending" to the real
              // assistant id so the badge renders on the right message.
              setPatchCounts((prev) => {
                if (prev.__pending == null) return prev;
                const { __pending, ...rest } = prev;
                return { ...rest, [assistantId]: __pending };
              });

              // Update files if code was generated — capture diffs.
              // Even when data.files is empty, re-fetch when the server
              // confirmed it wrote files mid-stream. That covers the case
              // where parseAIResponse came back empty but the streaming
              // extractor (or Strategy 6 rescue inside parseAIResponse)
              // produced rows in project_files.
              setMessageChangedPaths((prev) => {
                const pending = prev.__pending;
                if (!pending || pending.length === 0) return prev;
                const { __pending, ...rest } = prev;
                return { ...rest, [assistantId]: pending };
              });

              const reportedFileCount =
                typeof data.fileCount === "number"
                  ? data.fileCount
                  : (data.files as unknown[] | undefined)?.length ?? 0;
              const haveStreamedFiles = serverStreamedPathsRef.current.size > 0;
              const filesChanged = data.filesChanged === true;
              const changedPaths = Array.isArray(data.changedPaths)
                ? (data.changedPaths as unknown[]).filter((p): p is string => typeof p === "string")
                : [];
              if (changedPaths.length > 0) {
                setMessageChangedPaths((prev) => {
                  const merged = [...(prev[assistantId] ?? []), ...changedPaths]
                    .filter((path, index, arr) => arr.indexOf(path) === index);
                  return { ...prev, [assistantId]: merged };
                });
              }
              let previewWaitSince: number | undefined;
              if ((data.files && (data.files as unknown[]).length > 0) || haveStreamedFiles || reportedFileCount > 0 || filesChanged) {
                previewWaitSince = Date.now();
                const updatedFiles = await refreshProjectFiles();
                {
                  // Build diff entries. Prefer data.files (has fresh content from
                  // the AI response) when present; fall back to the streamed
                  // paths + their re-fetched content when only streaming
                  // happened.
                  const diffSource: Array<{ path: string; content: string }> =
                    (data.files as Array<{ path: string; content: string }> | undefined)?.length
                      ? (data.files as Array<{ path: string; content: string }>)
                      : (changedPaths.length > 0 ? changedPaths : Array.from(serverStreamedPathsRef.current)).map((path) => {
                          const row = (updatedFiles as Array<{ path: string; content: string }>).find((f) => f.path === path);
                          return { path, content: row?.content ?? "" };
                        });

                  const diffs: FileDiffEntry[] = diffSource
                    .map((newFile) => {
                      const oldFile = files.find((f) => f.path === newFile.path);
                      return {
                        path: newFile.path,
                        fileId: oldFile?.id,
                        oldContent: oldFile?.content ?? "",
                        newContent: newFile.content ?? "",
                      };
                    })
                    .filter((d) => d.oldContent !== d.newContent || !files.find((f) => f.path === d.path));

                  if (diffs.length > 0) {
                    setMessageDiffs((prev) => ({ ...prev, [assistantId]: diffs }));
                    setCanUndo(true);
                  }

                  if (healActiveRef.current) {
                    healSettlingRef.current = true;
                    void (async () => {
                      const previewOk = await waitForPreviewSuccess(
                        GENERATION_PREVIEW_WAIT_MS,
                        typeof window === "undefined" ? new EventTarget() : window,
                        previewWaitSince,
                      );
                      healActiveRef.current = false;
                      healSettlingRef.current = false;
                      if (previewOk) {
                        window.dispatchEvent(new CustomEvent("lifemark-preview-heal-done"));
                        onAutoFixComplete?.();
                      } else {
                        window.dispatchEvent(new CustomEvent("lifemark-preview-heal-failed"));
                      }
                    })();
                  }

                  if (effectiveMode === "build") {
                    // Same fallback as the diff source — use data.files when present,
                    // otherwise reconstruct from streamed paths + DB content.
                    const generatedFiles: Array<{ path: string; content: string }> =
                      (data.files as Array<{ path: string; content: string }> | undefined)?.length
                        ? (data.files as Array<{ path: string; content: string }>)
                        : Array.from(serverStreamedPathsRef.current).map((path) => {
                            const row = (updatedFiles as Array<{ path: string; content: string }>).find((f) => f.path === path);
                            return { path, content: row?.content ?? "" };
                          });
                    const pkgJsonFile = updatedFiles.find((f: { path: string; content: string }) => f.path === "package.json");
                    const missingPkgs = findMissingPackages(generatedFiles, pkgJsonFile?.content ?? null);
                    if (missingPkgs.length > 0 && pkgJsonFile?.content) {
                      // Lovable parity: sync package.json silently; preview installs deps.
                      // Silent only for ALLOWED packages — a refused one has to be
                      // said out loud, or the user just gets an import that never
                      // resolves and no idea why.
                      const sync = syncPackageJsonDeps(updatedFiles as Array<{ path: string; content: string }>, pkgJsonFile.content);
                      if (sync && sync.rejectedPackages.length > 0) {
                        toast({
                          title: "Some packages were not installed",
                          description: describeRejectedPackages(sync.rejectedPackages),
                          variant: "destructive",
                        });
                      }
                      if (sync && sync.addedPackages.length > 0) {
                        try {
                          const supabase = createClient();
                          await supabase.from("project_files").upsert({
                            project_id: project.id,
                            path: "package.json",
                            content: sync.updated,
                            language: "json",
                          }, { onConflict: "project_id,path" });
                          const { data: refreshed } = await supabase
                            .from("project_files")
                            .select("*")
                            .eq("project_id", project.id);
                          if (refreshed) onFilesUpdate(refreshed);
                        } catch {
                          // not critical
                        }
                      }
                    }
                  }
                }
              }

              // Add assistant message
              const assistantMsg: Message = {
                id: assistantId,
                project_id: project.id,
                role: "assistant",
                content: (data.displayMessage as string | undefined) || accumulated,
                tokens_used: typeof data.tokensUsed === "number" ? data.tokensUsed : null,
                model: effectiveModel,
                mode: (effectiveMode === "patch" ? "build" : effectiveMode) as "chat" | "plan" | "build" | "agent",
                metadata: (() => {
                  const meta: Record<string, unknown> = {};
                  if (completedBuildActivity) meta.build_activity = completedBuildActivity;
                  if (data.verification) meta.verification = data.verification;
                  if (data.backend_wired) meta.backend_wired = data.backend_wired;
                  // Pre-build snapshot id — powers per-message Revert / Preview version
                  if (typeof data.snapshot_id === "string") meta.snapshot_id = data.snapshot_id;
                  if (attachedSkills.length > 0) meta.skills_attached = attachedSkills;
                  return Object.keys(meta).length > 0 ? (meta as unknown as Json) : null;
                })(),
                rating: null,
                created_at: new Date().toISOString(),
              };
              commitTurn(assistantMsg);
              {
                const realUserId =
                  typeof (data as { userMessageId?: string }).userMessageId === "string"
                    ? (data as { userMessageId: string }).userMessageId
                    : null;
                if (realUserId) {
                  void persistPendingBranchMeta(realUserId);
                } else if (pendingBranchRef.current) {
                  // Fallback: refresh latest user row and stamp branch metadata.
                  void (async () => {
                    try {
                      const supabase = createClient();
                      const { data: latestUser } = await supabase
                        .from("messages")
                        .select("id")
                        .eq("project_id", project.id)
                        .eq("role", "user")
                        .order("created_at", { ascending: false })
                        .limit(1)
                        .maybeSingle();
                      if (latestUser?.id) await persistPendingBranchMeta(latestUser.id);
                    } catch { /* ignore */ }
                  })();
                }
              }
              if (!data.assistantMessageId) {
                console.warn(
                  "[chat] turn finished without assistantMessageId — persisting via client fallback",
                  { mode: effectiveMode, projectId: project.id },
                );
                try {
                  const persistRes = await fetch(`/api/projects/${project.id}/messages`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      messages: [
                        ...(skipOptimisticUser || opts?.skipUserPersist
                          ? []
                          : [
                              {
                                role: "user" as const,
                                content: tempUserMsg.content,
                                mode: effectiveMode === "patch" ? "build" : effectiveMode,
                              },
                            ]),
                        {
                          role: "assistant",
                          content: assistantMsg.content,
                          mode: effectiveMode === "patch" ? "build" : effectiveMode,
                          tokens_used: assistantMsg.tokens_used,
                          model: assistantMsg.model,
                          metadata: assistantMsg.metadata,
                        },
                      ],
                    }),
                  });
                  if (persistRes.ok) {
                    const persisted = (await persistRes.json()) as { assistantMessageId?: string };
                    if (persisted.assistantMessageId) {
                      commitTurn({ ...assistantMsg, id: persisted.assistantMessageId });
                    }
                  } else {
                    toast({
                      title: "Chat history may not have saved",
                      description: "Reload the page after your next successful edit to confirm.",
                      variant: "destructive",
                    });
                  }
                } catch {
                  toast({
                    title: "Chat history may not have saved",
                    description: "Check your connection and try again.",
                    variant: "destructive",
                  });
                }
              }
              setGenTimes((prev) => ({ ...prev, [assistantId]: Math.round((Date.now() - genStartRef.current) / 100) / 10 }));

              // Generate follow-up suggestion chips. The static pass below
              // paints instantly (zero AI cost/latency by design — see
              // src/lib/ai/follow-up-suggestions.ts); /api/ai/follow-up-suggestions
              // then runs in the background and swaps in response-specific
              // chips once it resolves, so a slow or failed call never blocks
              // or breaks the UI — the static chips just stay put.
              const filePaths = (data.files as Array<{ path: string }> | undefined)?.map((f) => f.path)
                ?? Array.from(serverStreamedPathsRef.current);
              const chips = enrichFollowUpSuggestions(
                generateSuggestions(userMessage, accumulated, filePaths),
                inferProjectStage(files),
                filePaths,
              );
              setSuggestions((prev) => ({ ...prev, [assistantId]: chips }));
              if (suggestionChipsEnabled && filePaths.length > 0) {
                fetch("/api/ai/follow-up-suggestions", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    projectId: project.id,
                    userMessage,
                    aiResponse: accumulated,
                    changedFiles: filePaths,
                  }),
                })
                  .then((r) => (r.ok ? r.json() : null))
                  .then((data: { suggestions?: string[] } | null) => {
                    if (!data?.suggestions?.length) return;
                    setSuggestions((prev) => ({ ...prev, [assistantId]: data.suggestions! }));
                  })
                  .catch(() => {/* static chips already shown — best-effort only */});
              }

              if (data.verification) {
                const v = data.verification as {
                  passed?: boolean;
                  engine?: string;
                  fixesApplied?: number;
                  errors?: string[];
                };
                setPreviewVerify({
                  ok: v.passed !== false,
                  checks: [
                    {
                      name: `Self-verify (${v.engine ?? "auto"})`,
                      pass: v.passed !== false,
                      detail: v.fixesApplied ? `${v.fixesApplied} fix(es) applied` : undefined,
                    },
                    ...(v.errors ?? []).map((e) => ({ name: e, pass: false, detail: undefined })),
                  ],
                });
              }
              if (previewWaitSince) {
                void closeGenerationLoop(assistantId, false, previewWaitSince);
              }

              // Multi-role test chips (Lovable best-practice: recheck multi-role behavior after big edits)
              const roleChips = buildRoleTestChips(filePaths);
              if (roleChips.length > 0) {
                setRoleTestChips((prev) => ({ ...prev, [assistantId]: roleChips }));
                const isPersistedId =
                  !!assistantId &&
                  !assistantId.startsWith("assistant-") &&
                  !assistantId.startsWith("temp-");
                if (isPersistedId) {
                  void fetch(`/api/projects/${project.id}/messages/${assistantId}`, {
                    method: "PATCH",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                      metadata: { role_test_chips: roleChips },
                      mergeMetadata: true,
                    }),
                  }).catch(() => {/* best-effort */});
                }
              }
            }

            if (data.error) {
              // A 5s toast alone is easy to miss — the thread then looks like
              // the AI silently ignored the request (this hid a drained
              // OpenRouter balance for days: every build 402'd invisibly).
              // Persist a readable in-chat error with the actual cause, and
              // keep the user's message so it can be resent.
              failInChat({ rawError: String(data.error) });
            }
          } catch {}
        };

      const liveApply = (["build", "agent", "patch"] as EditorMode[]).includes(effectiveMode);
      liveFileApplyRef.current = liveApply;
      await consumeAIStream(res, {
        signal: controller.signal,
        applyFileUpdates: liveApply,
        onFileUpdate: (update) => {
          const norm = update.path.replace(/\\/g, "/").replace(/^\//, "");
          if (streamedPathTracker.add(norm)) {
            const paths = streamedPathTracker.getPaths();
            setStreamingFiles(paths);
            onStreamingChange?.(true, paths.length);
          }
          applyBuildSteps((prev) =>
            prev.length > 0 ? onBuildFileProgress(prev) : prev,
          );
        },
        handlers: {
          // Throttled: SSE delivers dozens of chunks/sec and each setState
          // re-renders the whole panel, while the path scan below regex-walks
          // the ENTIRE accumulated text (O(n²) if run per chunk). Flush at
          // most every 66ms; the pending timer guarantees the final chunk
          // still renders.
          onTextChunk: (piece) => {
            accumulated += piece;
            hasPendingStreamedPathUpdate = streamedPathTracker.append(piece) || hasPendingStreamedPathUpdate;
            if (streamFlushTimer === null) {
              streamFlushTimer = setTimeout(() => {
                streamFlushTimer = null;
                setStreamingContent(accumulated);
                if (hasPendingStreamedPathUpdate) {
                  hasPendingStreamedPathUpdate = false;
                  const paths = streamedPathTracker.getPaths();
                  // Paths only ever grow — skip the state update (and the
                  // re-render it causes) when nothing new appeared.
                  setStreamingFiles(paths);
                  onStreamingChange?.(true, paths.length);
                  applyBuildSteps((prev) =>
                    prev.length > 0 ? onBuildFileProgress(prev) : prev,
                  );
                }
              }, 66);
            }
          },
          onEvent: (data) => {
            streamEventQueue = streamEventQueue.then(() => processChatStreamEvent(data));
          },
          // handleAIStream special-cases a `{ error }` SSE frame: it routes it
          // to onError instead of onEvent (see dispatchSseEvent in
          // lib/ai/handle-ai-stream.ts) and returns without ever calling
          // onEvent for that frame. Without this handler, a mid-stream failure
          // (e.g. self-verify blocking a broken generation) was dispatched to
          // nothing — no toast, no in-chat message, the thread just went
          // quiet with the last "Writing files…" status stuck on screen.
          // processChatStreamEvent's own `data.error` branch (which calls
          // failInChat) is unreachable for this frame shape, so call
          // failInChat directly here instead.
          onError: (err) => {
            failInChat({ rawError: err.message });
          },
        },
      });
      await streamEventQueue;

      if (clarifyExited) return;
    } catch (err: unknown) {
      applyBuildSteps([]);
      // A user-initiated Stop (or unmount) aborts the controller — that's
      // not a failure, so don't scare the user with a destructive toast.
      const isAbort =
        controller.signal.aborted ||
        (err instanceof DOMException && err.name === "AbortError");
      if (!isAbort) {
        toast({
          title: "Request failed",
          description: err instanceof Error ? err.message : "Unknown error",
          variant: "destructive",
        });
      }
    } finally {
      sendingRef.current = false;
      liveFileApplyRef.current = false;
      setClarifyStreaming(false);
      if (streamFlushTimer !== null) {
        clearTimeout(streamFlushTimer);
        streamFlushTimer = null;
      }
      setStreamingWithCallback(false);
      setBuildStatus(null);
      setSubagentSteps([]);
      setPreviewVerify(null);
      // buildActivitySteps cleared in data.done; completed steps live on the assistant message
      if (patchFallbackMessage) {
        const retry = patchFallbackMessage;
        patchFallbackTimerRef.current = setTimeout(() => {
          patchFallbackTimerRef.current = null;
          if (unmountedRef.current) return; // panel gone — drop the retry
          void sendMessage(retry, "build", undefined, { forceBuild: true });
        }, 250);
      }
      if (pendingClarifyBuild) {
        const prompt = pendingClarifyBuild;
        pendingClarifyBuild = null;
        void sendMessage(prompt, "build", undefined, {
          forceBuild: true,
          skipOptimisticUser: true,
          skipUserPersist: true,
        });
      }
      // A self-repair send that never reached its completion handler — the
      // stream threw, the user pressed Stop, the response carried no files.
      // The success paths inside the stream clear `healActiveRef` themselves,
      // so anything still latched here means the repair died silently and the
      // preview overlay is sitting on "Self-repairing…" with no way out.
      if (healActiveRef.current && !healSettlingRef.current) {
        healActiveRef.current = false;
        window.dispatchEvent(new CustomEvent("lifemark-preview-heal-failed"));
      }
    }
  }

  async function handleSend() {
    if (isLocked) return;
    let text = input.trim();
    if (!text && !attachedImage) return;

    // NOTE: there used to be an early return here that pushed typed follow-ups
    // into the SIMPLE `queuedMessages` string array and returned. Because it ran
    // before the rich-queue branch below, `promptQueue` only ever received
    // image-only sends — so the entire LovablePromptQueue UI (reorder, inline
    // edit, repeat-N, pause, clear) never saw a typed message, the header queue
    // pill read 0 while items were pending, and the pause control acted on the
    // wrong queue. Removed so every queued send flows through the rich queue,
    // which is drained by the effect below (guarded on sendingRef, credits,
    // paused state, and per-item repeats).

    const redaction = text ? redactPromptSecrets(text) : null;
    if (redaction && redaction.assignments.length > 0) {
      if (redaction.hasUnsecuredSecret) {
        toast({
          title: "Secret-looking value blocked",
          description: `Detected ${redaction.unsecuredSecret?.label ?? "a raw secret"} that is not attached to a variable name. Use NAME=value so LifemarkAI can save it safely.`,
          variant: "destructive",
        });
        return;
      }
      try {
        const saved = await saveSecretAssignments(redaction.assignments);
        text = redaction.redactedText.trim();
        setInput(text);
        toast({
          title: "Secret saved",
          description: `${saved.join(", ")} saved to Secrets Vault and hidden from the prompt.`,
        });
      } catch (error) {
        toast({
          title: "Could not save secret",
          description: error instanceof Error ? error.message : "Open Secrets Vault and add it manually.",
          variant: "destructive",
        });
        return;
      }
    }

    const inputSecret = text ? detectPromptSecret(text) : null;
    if (inputSecret) {
      toast({
        title: "Secret-looking value blocked",
        description: `Detected ${inputSecret.label}. Store keys in Env/Secrets and reference the variable name instead.`,
        variant: "destructive",
      });
      return;
    }
    for (const f of attachedFiles) {
      const attachmentSecret = detectPromptSecret(f.content);
      if (attachmentSecret) {
        toast({
          title: "Attached file contains a secret-looking value",
          description: `Detected ${attachmentSecret.label} in ${f.name}. Remove the secret before sending it to AI.`,
          variant: "destructive",
        });
        return;
      }
    }
    if (text.length > CHAT_INPUT_CAPABILITIES.maxMessageLength) {
      toast({
        title: "Prompt is too large",
        description: `Keep the prompt under ${CHAT_INPUT_CAPABILITIES.maxMessageLength.toLocaleString()} characters or attach the extra context as a file.`,
        variant: "destructive",
      });
      return;
    }

    if (streaming) {
      // AI is busy — queue the follow-up (attachments ride along when present).
      setPromptQueue((prev) => [
        ...prev,
        {
          id: `q-${Date.now()}`,
          text,
          repeat: 1,
          remaining: 1,
          imageBase64: attachedImage,
          imageName: attachedImageName,
          attachedText: combinedAttachedText,
        },
      ]);
      setInput("");
      setAttachedImage(null);
      setAttachedImageName(null);
      setAttachedFiles([]);
      return;
    }
    if (activeClarifySession && text && !attachedImage) {
      setInput("");
      answerClarifyRef.current(text);
      return;
    }
    if (
      !skipDesignPreviewOnceRef.current &&
      !attachedImage &&
      shouldOfferDesignPreviews(text, files.length)
    ) {
      setPendingDesignPrompt(text);
      setDesignPreviewOpen(true);
      setInput("");
      return;
    }
    skipDesignPreviewOnceRef.current = false;
    // Do NOT pass `mode` as override — that blocks Chat→patch / Build→agent
    // promotion, so edits like "add menu items in header" stay in Chat and
    // never write project_files (preview stays unchanged).
    void sendMessage(text);
  }

  /** Feature: file generation in chat — POST the current prompt to /api/ai/generate-file. */
  async function handleGenerateFile(format: LovableFileGenFormat) {
    const prompt = input.trim();
    if (!prompt || fileGenBusy) return;
    const isBinary = format === "pdf" || format === "xlsx" || format === "pptx";
    if (isBinary && !analyzeEnabled) {
      toast({
        title: "Binary file generation unavailable",
        description: analyzeUnavailableReason ?? "Analyze sandbox is not configured.",
        variant: "destructive",
      });
      return;
    }
    setShowFileGenPicker(false);
    setFileGenBusy(format);
    try {
      if (isBinary) {
        const res = await fetch("/api/ai/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectId: project.id,
            instruction:
              `Generate a ${format.toUpperCase()} file for this request. Use Python with ` +
              `(reportlab for PDF, openpyxl for XLSX, python-pptx for PPTX). ` +
              `Write the file to OUTPUT_DIR as output.${format}.\n\nRequest: ${prompt}`,
          }),
        });
        const data = (await res.json()) as {
          files?: Array<{ name: string; base64: string; mimeType?: string }>;
          error?: string;
        };
        if (!res.ok || !data.files?.length) {
          throw new Error(data.error ?? `Binary generation failed (${res.status})`);
        }
        const file =
          data.files.find((f) => f.name.toLowerCase().endsWith(`.${format}`)) ?? data.files[0]!;
        const mime =
          file.mimeType ??
          (format === "pdf"
            ? "application/pdf"
            : format === "xlsx"
              ? "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              : "application/vnd.openxmlformats-officedocument.presentationml.presentation");
        setFileGenResults((prev) => [
          ...prev,
          {
            id: `gen-${Date.now()}`,
            prompt,
            filename: file.name,
            content: file.base64,
            mimeType: mime,
            base64: true,
          },
        ]);
        setInput("");
        toast({ title: `Generated ${file.name}`, description: "Ready to download below." });
        return;
      }

      const res = await fetch("/api/ai/generate-file", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, prompt, format }),
      });
      const data = (await res.json()) as {
        filename?: string; content?: string; mimeType?: string; error?: string;
      };
      if (!res.ok || !data.filename || data.content == null) {
        throw new Error(data.error ?? `Generation failed (${res.status})`);
      }
      setFileGenResults((prev) => [
        ...prev,
        {
          id: `gen-${Date.now()}`,
          prompt,
          filename: data.filename!,
          content: data.content!,
          mimeType: data.mimeType ?? "text/plain",
        },
      ]);
      setInput("");
      // Route deducts 1 credit server-side — refresh the balance badge
      try {
        const cr = await fetch("/api/billing/credits");
        if (cr.ok) {
          const { credits: fresh } = (await cr.json()) as { credits?: number };
          if (typeof fresh === "number") onCreditsUpdate(fresh);
        }
      } catch {}
      toast({ title: `Generated ${data.filename}`, description: "Ready to download below." });
    } catch (err) {
      toast({
        title: "File generation failed",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setFileGenBusy(null);
    }
  }


  async function handleSaveSkill() {
    if (!saveSkillDraft || savingSkill) return;
    const draft = saveSkillDraft;
    if (!draft.name.trim() || !draft.prompt.trim()) {
      toast({ title: "Name and playbook are required", variant: "destructive" });
      return;
    }
    setSavingSkill(true);
    try {
      const res = await fetch("/api/skills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: draft.name.trim(),
          description: draft.description.trim() || null,
          prompt: draft.prompt.trim(),
          icon: "⚡",
          tags: [],
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error((err as { error?: string }).error ?? "Failed to save skill");
      }
      toast({ title: "Skill saved", description: `"${draft.name}" will auto-attach when future prompts match.` });
      setSaveSkillDraft(null);
    } catch (err) {
      toast({
        title: "Save failed",
        description: err instanceof Error ? err.message : "Try again.",
        variant: "destructive",
      });
    } finally {
      setSavingSkill(false);
    }
  }

  async function handleRunAnalyze() {
    if (!analyzeInstruction.trim() || analyzeRunning) return;
    setAnalyzeRunning(true);
    try {
      const res = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          instruction: analyzeInstruction.trim(),
          projectId: project.id,
          inputFile: analyzeFile ?? undefined,
        }),
      });
      const data = await res.json() as {
        ok?: boolean;
        error?: string;
        script?: string;
        stdout?: string;
        stderr?: string;
        files?: GeneratedFile[];
        messages?: Message[];
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error ?? data.stderr ?? "Analysis failed");
      }
      if (data.messages?.length) {
        onMessagesUpdate([...messages, ...data.messages]);
      }
      toast({
        title: `Analysis complete · ${(data.files ?? []).length} file${(data.files ?? []).length === 1 ? "" : "s"}`,
      });
      setAnalyzeOpen(false);
      setAnalyzeInstruction("");
      setAnalyzeFile(null);
    } catch (err) {
      toast({
        title: "Analysis failed",
        description: err instanceof Error ? err.message : "Try again with a smaller file or simpler request.",
        variant: "destructive",
      });
    } finally {
      setAnalyzeRunning(false);
    }
  }

  // Both handlers below fire only after the user has already committed to a
  // build (they typed a build request and the design picker offered to
  // refine it) — there is no vagueness left to resolve. Without an explicit
  // overrideMode, sendMessage re-runs resolvePromptMode on the raw prompt,
  // and isVagueGreenfieldProjectPrompt() silently reclassifies short generic
  // asks ("Build the bakery landing page.") as Chat mode on a fileCount===0
  // project. Chat mode never writes project_files, so the model happily
  // narrates a full build and shows the code as an inert chat suggestion —
  // the live preview and Code tab stay on the placeholder scaffold forever.
  // Selecting a direction accidentally dodged this bug (buildDesignBrief()
  // pads the prompt past the 100-char vagueness cutoff), but Skip re-sends
  // the original short prompt unchanged and reliably hit it — every
  // "Skip — AI picks for me" click on a short prompt silently no-op'd the
  // build. Passing overrideMode="build" here matches what resolvePromptMode
  // would have returned anyway for a non-vague version of this same prompt
  // (design previews are only offered for visual/website builds, never
  // erp/pos/crm app-shells, so "build" — not "agent" — is always right here).
  function handleDesignPreviewSelect(direction: DesignPreviewDirection) {
    const base = pendingDesignPrompt;
    setDesignPreviewOpen(false);
    setPendingDesignPrompt(null);
    if (!base) return;
    void sendMessage(`${base}\n\n${buildDesignBrief(direction)}`, "build", undefined, { forceBuild: true });
  }

  function handleDesignPreviewSkip() {
    const base = pendingDesignPrompt;
    setDesignPreviewOpen(false);
    setPendingDesignPrompt(null);
    skipDesignPreviewOnceRef.current = true;
    if (base) void sendMessage(base, "build", undefined, { forceBuild: true });
  }

  // Auto-drain the queue when streaming finishes (unless paused)
  useEffect(() => {
    if (streaming) return;
    const q = promptQueueRef.current;
    if (queuePausedRef.current || q.length === 0) return;
    // Don't dequeue when the send would be refused — sendMessage no-ops while
    // a previous send is tearing down or when credits are exhausted, and the
    // item would be silently lost (it was already popped from the queue).
    if (sendingRef.current || credits < 1) return;
    const [next, ...rest] = q;
    const newRemaining = next.remaining - 1;
    if (newRemaining > 0) {
      // Still has repeats left — put a decremented copy back at the front
      setPromptQueue([{ ...next, remaining: newRemaining }, ...rest]);
    } else {
      setPromptQueue(rest);
    }
    // Same as handleSend: let resolvePromptMode promote surgical edits.
    // Pass attachments via opts — setState would race before sendMessage reads them.
    void sendMessage(next.text, undefined, undefined, {
      imageBase64: next.imageBase64,
      imageName: next.imageName,
      attachedText: next.attachedText,
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  // Debounce ref for URL scraping
  const scrapeDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  function replaceInputRange(selection: { from: number; to: number }, replacement: string) {
    setInput((prev) => {
      const from = Math.max(0, Math.min(selection.from, prev.length));
      const to = Math.max(from, Math.min(selection.to, prev.length));
      return `${prev.slice(0, from)}${replacement}${prev.slice(to)}`;
    });
  }

  async function saveSecretAssignments(assignments: SecretAssignment[]): Promise<string[]> {
    const unique = new Map<string, string>();
    for (const assignment of assignments) unique.set(assignment.name, assignment.value);
    const names: string[] = [];
    for (const [key, value] of unique) {
      const res = await fetch(`/api/projects/${project.id}/secrets`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key,
          value,
          description: "Saved automatically from chat input",
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(data.error ?? `Could not save ${key}`);
      }
      names.push(key);
    }
    return names;
  }

  function handlePromptPaste(
    text: string,
    _event: ClipboardEvent,
    selection: { from: number; to: number },
  ): boolean {
    // Lovable parity: bare API-key paste → project .env.local + {{TAG}} (same path as capture handler).
    const pastedKey = detectPastedSecret(text);
    if (pastedKey && !text.includes("=")) {
      const redacted = redactSecret(text, pastedKey);
      replaceInputRange(selection, redacted);
      void fetch(`/api/projects/${project.id}/env`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: pastedKey.name, value: pastedKey.value }),
      })
        .then((res) => {
          setSecretBanner({ key: pastedKey.name, label: pastedKey.label, ok: res.ok });
          toast(
            res.ok
              ? {
                  title: `${pastedKey.label} saved`,
                  description: `Stored as ${pastedKey.name}. The chat message only carries the tag.`,
                }
              : {
                  title: "Couldn't save the secret",
                  description: "The key was redacted — add it manually in the Env panel.",
                  variant: "destructive",
                },
          );
        })
        .catch(() => {
          setSecretBanner({ key: pastedKey.name, label: pastedKey.label, ok: false });
          toast({
            title: "Couldn't save the secret",
            description: "The key was redacted — add it manually in the Env panel.",
            variant: "destructive",
          });
        });
      return true;
    }

    const redaction = redactPromptSecrets(text);
    if (redaction.assignments.length > 0) {
      if (redaction.hasUnsecuredSecret) {
        toast({
          title: "Secret-looking paste blocked",
          description: `Detected ${redaction.unsecuredSecret?.label ?? "a raw secret"} that is not attached to a variable name. Paste secrets as NAME=value so LifemarkAI can save them safely.`,
          variant: "destructive",
        });
        return true;
      }

      void (async () => {
        try {
          const saved = await saveSecretAssignments(redaction.assignments);
          if (shouldAttachLongPaste(redaction.redactedText)) {
            const attachment = createLongPasteAttachment(redaction.redactedText);
            addAttachedFile({ name: attachment.name, content: attachment.content });
            setAttachedImage(null);
            setAttachedImageName(null);
            const mentionLine = saved.map((name) => `@secret:${name}`).join(" ");
            const note = `Use the attached pasted context file (${attachment.name}) for this request. ${mentionLine}`.trim();
            replaceInputRange(selection, note);
          } else {
            replaceInputRange(selection, redaction.redactedText);
          }
          toast({
            title: "Secret saved",
            description: `${saved.join(", ")} saved to Secrets Vault and hidden from the chat prompt.`,
          });
        } catch (error) {
          toast({
            title: "Could not save secret",
            description: error instanceof Error ? error.message : "Open Secrets Vault and add it manually.",
            variant: "destructive",
          });
        }
      })();
      return true;
    }

    const secret = detectPromptSecret(text);
    if (secret) {
      // Prefer auto-save when the pattern matches known key shapes (even with surrounding prose).
      const known = detectPastedSecret(text);
      if (known) {
        const redacted = redactSecret(text, known);
        replaceInputRange(selection, redacted);
        void fetch(`/api/projects/${project.id}/env`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: known.name, value: known.value }),
        })
          .then((res) => {
            setSecretBanner({ key: known.name, label: known.label, ok: res.ok });
            toast(
              res.ok
                ? { title: `${known.label} saved`, description: `Stored as ${known.name}.` }
                : { title: "Couldn't save the secret", variant: "destructive" },
            );
          })
          .catch(() => {
            setSecretBanner({ key: known.name, label: known.label, ok: false });
          });
        return true;
      }
      toast({
        title: "Secret-looking paste blocked",
        description: `Detected ${secret.label}. Paste as NAME=value so LifemarkAI can save it to Secrets Vault.`,
        variant: "destructive",
      });
      return true;
    }

    if (!shouldAttachLongPaste(text)) return false;

    const attachment = createLongPasteAttachment(text);
    addAttachedFile({ name: attachment.name, content: attachment.content });
    setAttachedImage(null);
    setAttachedImageName(null);
    replaceInputRange(selection, `Use the attached pasted context file (${attachment.name}) for this request.`);
    toast({
      title: "Long paste attached",
      description: attachment.truncated
        ? `Attached the first ${CHAT_INPUT_CAPABILITIES.longPasteMaxChars.toLocaleString()} characters as ${attachment.name}.`
        : `Attached as ${attachment.name} instead of filling the prompt box.`,
    });
    return true;
  }

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    // Programmatic echo (tiptap syncing a hydrated draft / pill insert fires
    // a synthetic change with the SAME value but a stale caret) — never open
    // pickers for it. Only real edits should drive mention/template detection;
    // this was popping the @mention dropdown on page load when a draft
    // containing "@" was restored.
    const isEcho = val === input;
    setInput(val);
    if (isEcho) return;
    // "/" at start of input opens the template/skill picker
    if (val.startsWith("/")) {
      setShowTemplates(true);
      setTemplateCursor(0); // reset keyboard selection as the query changes
      // Ensure skills are loaded when "/" is typed
      if (!skillsLoaded) void loadSkills();
      return;
    }
    if (showTemplates && !val.startsWith("/")) {
      setShowTemplates(false);
    }
    // Detect @mention trigger: find the last @ before the cursor
    const cursor = e.target.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const atIdx = before.lastIndexOf("@");
    if (atIdx >= 0) {
      const query = before.slice(atIdx + 1);
      // Only show if no space in query (still typing the mention)
      if (!query.includes(" ") && !query.includes("\n")) {
        setMentionQuery(query);
        setMentionCursor(0);
        return;
      }
    }
    setMentionQuery(null);

    // URL detection — debounced scrape
    const urlMatch = val.match(/https?:\/\/[^\s]+/);
    const foundUrl = urlMatch ? urlMatch[0] : null;
    if (foundUrl && foundUrl !== detectedUrl) {
      setDetectedUrl(foundUrl);
      setScrapedMeta(null);
      if (scrapeDebounceRef.current) clearTimeout(scrapeDebounceRef.current);
      scrapeDebounceRef.current = setTimeout(async () => {
        setIsScraping(true);
        try {
          const res = await fetch("/api/scrape", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ url: foundUrl }),
          });
          if (res.ok) {
            const data = await res.json() as { title: string; description: string; ogImage: string; textContent: string };
            setScrapedMeta(data);
          }
        } catch {
          // Silently fail — URL scraping is optional
        } finally {
          setIsScraping(false);
        }
      }, 700);
    } else if (!foundUrl && detectedUrl) {
      setDetectedUrl(null);
      setScrapedMeta(null);
      setIsScraping(false);
      if (scrapeDebounceRef.current) clearTimeout(scrapeDebounceRef.current);
    }
  }

  function insertTemplate(prompt: string) {
    setInput(prompt);
    setShowTemplates(false);
    setTimeout(() => {
      textareaRef.current?.focus();
      const len = prompt.length;
      textareaRef.current?.setSelectionRange(len, len);
    }, 10);
  }

  // Flat, ordered list of slash-picker items for keyboard navigation. The order
  // here mirrors the render (skills first, then template groups) so `templateCursor`
  // indexes and the per-button highlight keys stay in sync.
  type SlashItem =
    | { kind: "skill"; key: string; prompt: string; skillId: string }
    | { kind: "template"; key: string; prompt: string };
  const slashItems: SlashItem[] = useMemo(() => {
    if (!showTemplates) return [];
    const slashQuery = input.startsWith("/") ? input.slice(1).toLowerCase().trim() : "";
    const allSkills = [...(skills.custom ?? []), ...(skills.builtin ?? [])];
    const matched = allSkills
      .filter((s) =>
        !slashQuery ||
        s.name.toLowerCase().includes(slashQuery) ||
        (s.description ?? "").toLowerCase().includes(slashQuery) ||
        (s.tags ?? []).some((t: string) => t.toLowerCase().includes(slashQuery))
      )
      .slice(0, 8)
      .map((s): SlashItem => ({ kind: "skill", key: `skill:${s.id}`, prompt: s.prompt, skillId: s.id }));
    const showTpl = input === "/" || !input.startsWith("/");
    const tpl: SlashItem[] = showTpl
      ? LOVABLE_PROMPT_TEMPLATES.flatMap((g) => g.prompts.map((p): SlashItem => ({ kind: "template", key: `tpl:${p}`, prompt: p })))
      : [];
    return [...matched, ...tpl];
  }, [showTemplates, input, skills]);
  const slashSelectedKey = slashItems[templateCursor]?.key;

  function selectSlashItem(item: SlashItem) {
    if (item.kind === "skill") applySkill(item.prompt, item.skillId);
    else if (item.prompt === LOVABLE_DESIGN_DIRECTIONS_SLASH_KEY) openDesignDirections();
    else if (item.prompt === LOVABLE_PUBLISH_SLASH_KEY) void handlePublishFromChat();
    else insertTemplate(item.prompt);
    setShowTemplates(false);
  }

  // Files + collaborators filtered by @mention query
  type MentionItem = LovableMentionItem;

  // Detect @project:name/path pattern
  const isCrossProjectQuery = mentionQuery !== null && mentionQuery.startsWith("project:");
  const crossProjectQuery = isCrossProjectQuery ? mentionQuery.slice("project:".length) : "";
  // Cross-project items: match project name or file path
  const crossProjectItems: MentionItem[] = isCrossProjectQuery
    ? crossProjects.flatMap((p) => {
        const nameMatch = p.name.toLowerCase().includes(crossProjectQuery.toLowerCase());
        const filesForProject = crossProjectFiles[p.id] ?? [];
        const wantsChat =
          crossProjectQuery.toLowerCase().includes("chat") ||
          crossProjectQuery.toLowerCase().endsWith("/chat");
        if (crossProjectQuery.includes("/") || filesForProject.length > 0) {
          const fileItems = filesForProject
            .filter((f) => !crossProjectQuery || f.path.toLowerCase().includes(crossProjectQuery.toLowerCase()) || nameMatch)
            .slice(0, 4)
            .map((f): MentionItem => ({ kind: "xproject", projectName: p.name, projectId: p.id, filePath: f.path }));
          const chatItem: MentionItem[] =
            nameMatch || wantsChat
              ? [{ kind: "xchat", projectName: p.name, projectId: p.id }]
              : [];
          return [...chatItem, ...fileItems];
        }
        // No files loaded yet — show the project itself + chat history option
        return nameMatch
          ? [
              { kind: "xproject" as const, projectName: p.name, projectId: p.id, filePath: "" },
              { kind: "xchat" as const, projectName: p.name, projectId: p.id },
            ]
          : [];
      }).slice(0, 8)
    : [];

  const mentionItems: MentionItem[] = mentionQuery !== null
    ? isCrossProjectQuery
      ? crossProjectItems
      : [
          ...files
            .filter((f) => f.path.toLowerCase().includes(mentionQuery.toLowerCase()))
            .slice(0, 5)
            .map((f): MentionItem => ({ kind: "file", path: f.path })),
          ...collaborators
            .filter((c) =>
              c.display.toLowerCase().includes(mentionQuery.toLowerCase()) ||
              c.email.toLowerCase().includes(mentionQuery.toLowerCase())
            )
            .slice(0, 4)
            .map((c): MentionItem => ({ kind: "user", display: c.display, email: c.email })),
          // App connectors (Lovable parity: "@" references a connector)
          ...connectorCatalog
            .filter((c) =>
              mentionQuery.length > 0 &&
              (c.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
               c.id.toLowerCase().includes(mentionQuery.toLowerCase())),
            )
            .slice(0, 4)
            .map((c): MentionItem => ({
              kind: "connector",
              id: c.id,
              name: c.name,
              emoji: c.emoji,
              configured: configuredConnectorIds.has(c.id),
            })),
          // Hint to trigger cross-project mode
          ...(!mentionQuery || "project".startsWith(mentionQuery.toLowerCase()) ? [{ kind: "xproject" as const, projectName: "Other project…", projectId: "", filePath: "" }] : []),
        ]
    : [];

  function insertMention(item: MentionItem | string) {
    if (typeof item !== "string" && item.kind === "xchat") {
      // Prefer slug / hyphenated name so @chat:… matches the token regex.
      const token =
        crossProjects.find((p) => p.id === item.projectId)?.slug ||
        item.projectName.replace(/\s+/g, "-");
      const insertText = `chat:${token}`;
      const val = input;
      const cursor = textareaRef.current?.selectionStart ?? val.length;
      const before = val.slice(0, cursor);
      const atIdx = before.lastIndexOf("@");
      const after = val.slice(cursor);
      const newVal = val.slice(0, atIdx) + "@" + insertText + " " + after;
      setInput(newVal);
      setMentionQuery(null);
      setTimeout(() => {
        const newPos = atIdx + insertText.length + 2;
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(newPos, newPos);
      }, 10);
      return;
    }
    // Handle cross-project project node — load files and switch query
    if (typeof item !== "string" && item.kind === "xproject") {
      if (!item.projectId) {
        void loadCrossProjects();
        setMentionQuery("project:");
        const val = input;
        const cursor = textareaRef.current?.selectionStart ?? val.length;
        const before = val.slice(0, cursor);
        const atIdx = before.lastIndexOf("@");
        const after = val.slice(cursor);
        setInput(val.slice(0, atIdx) + "@project:" + after);
        return;
      }
      if (!item.filePath) {
        // Project-level click: load files and refine query
        void loadCrossProjectFiles(item.projectId);
        const newQuery = "project:" + item.projectName + "/";
        setMentionQuery("project:" + item.projectName + "/");
        // Update textarea to reflect new query
        const val = input;
        const cursor = textareaRef.current?.selectionStart ?? val.length;
        const before = val.slice(0, cursor);
        const atIdx = before.lastIndexOf("@");
        const after = val.slice(cursor);
        setInput(val.slice(0, atIdx) + "@" + newQuery + after);
        return;
      }
      // Full cross-project file reference: @projectName/filePath
      const insertText = item.projectName + "/" + item.filePath;
      const val = input;
      const cursor = textareaRef.current?.selectionStart ?? val.length;
      const before = val.slice(0, cursor);
      const atIdx = before.lastIndexOf("@");
      const after = val.slice(cursor);
      const newVal = val.slice(0, atIdx) + "@" + insertText + " " + after;
      setInput(newVal);
      setMentionQuery(null);
      setTimeout(() => {
        const newPos = atIdx + insertText.length + 2;
        textareaRef.current?.focus();
        textareaRef.current?.setSelectionRange(newPos, newPos);
      }, 10);
      return;
    }
    const insertText = typeof item === "string"
      ? item
      : item.kind === "file" ? item.path
      : item.kind === "connector" ? `connector:${item.id}`
      : item.display;
    const val = input;
    const cursor = textareaRef.current?.selectionStart ?? val.length;
    const before = val.slice(0, cursor);
    const atIdx = before.lastIndexOf("@");
    const after = val.slice(cursor);
    const newVal = val.slice(0, atIdx) + `@${insertText} ` + after;
    setInput(newVal);
    setMentionQuery(null);
    setTimeout(() => {
      const newPos = atIdx + insertText.length + 2;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(newPos, newPos);
    }, 10);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    // Slash picker keyboard navigation (skills + prompt templates)
    if (showTemplates) {
      if (e.key === "Escape") { e.preventDefault(); setShowTemplates(false); return; }
      if (slashItems.length > 0) {
        if (e.key === "ArrowDown") { e.preventDefault(); setTemplateCursor((c) => Math.min(c + 1, slashItems.length - 1)); return; }
        if (e.key === "ArrowUp") { e.preventDefault(); setTemplateCursor((c) => Math.max(c - 1, 0)); return; }
        if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); selectSlashItem(slashItems[templateCursor]); return; }
      }
    }
    // Navigate mention dropdown with arrow keys
    // Trigger cross-project load when "@project" typed
    if (isCrossProjectQuery && !crossProjectsLoaded) { void loadCrossProjects(); }
    if (mentionQuery !== null && mentionItems.length > 0) {
      if (e.key === "ArrowDown") { e.preventDefault(); setMentionCursor((c) => Math.min(c + 1, mentionItems.length - 1)); return; }
      if (e.key === "ArrowUp") { e.preventDefault(); setMentionCursor((c) => Math.max(c - 1, 0)); return; }
      if (e.key === "Enter" || e.key === "Tab") { e.preventDefault(); insertMention(mentionItems[mentionCursor]); return; }
      if (e.key === "Escape") { setMentionQuery(null); return; }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  }

  const clarifyInterview = useMemo(
    () => (activeClarifySession ? normalizeClarifyInterview(activeClarifySession) : null),
    [activeClarifySession],
  );

  const visibleMessages = useMemo(() => {
    const raw = messages
      .filter((m): m is Message => !!m && typeof m.id === "string")
      .map((m) => ({ ...m, content: getDisplayMessageContent(m) }));
    const lastByTurn = new Map<string, number>();
    raw.forEach((message, index) => {
      const turnId = messageClarifyTurnId(message.metadata, message.id);
      if (turnId) lastByTurn.set(turnId, index);
    });
    const base = raw.filter((message, index) => {
      const turnId = messageClarifyTurnId(message.metadata, message.id);
      return !turnId || lastByTurn.get(turnId) === index;
    });
    if (!clarifyInterview) return base;
    const persisted = new Set<string>();
    for (const message of base) {
      const turnId = messageClarifyTurnId(message.metadata, message.id);
      if (turnId) persisted.add(turnId);
    }
    const turns: Message[] = [];
    for (const turn of buildClarifyTimeline(clarifyInterview)) {
      if (persisted.has(turn.id)) continue;
      turns.push(
        syntheticClarifyMessage(
          project.id,
          turn.id,
          turn.role,
          turn.content,
          {
            clarifyTurnId: turn.id,
            ...(turn.current ? { clarifyCurrent: true } : {}),
            ...(turn.ack ? { clarifyAck: turn.ack } : {}),
          },
        ),
      );
    }
    return turns.length > 0 ? [...base, ...turns] : base;
  }, [messages, clarifyInterview, project.id]);

  const searchHitMessageIds = useMemo(() => {
    const q = searchQuery.trim();
    if (!q) return [];
    const qLower = q.toLowerCase();
    let source = searchHitIds
      ? visibleMessages.filter((m) => searchHitIds.has(m.id))
      : visibleMessages.filter((m) => m.content.toLowerCase().includes(qLower));
    if (searchRoleFilter !== "all") {
      source = source.filter((m) => m.role === searchRoleFilter);
    }
    if (searchMsgModeFilter !== "all") {
      source = source.filter((m) => (m.mode ?? "chat") === searchMsgModeFilter);
    }
    return source.map((m) => m.id);
  }, [searchQuery, searchHitIds, visibleMessages, searchRoleFilter, searchMsgModeFilter]);

  const activeSearchHitId = searchHitMessageIds[activeSearchHitIndex] ?? null;

  useEffect(() => {
    setActiveSearchHitIndex(0);
  }, [searchQuery, searchMode, searchRoleFilter, searchMsgModeFilter]);

  function navigateSearchHit(delta: number) {
    if (searchHitMessageIds.length === 0) return;
    setActiveSearchHitIndex(
      (i) => (i + delta + searchHitMessageIds.length) % searchHitMessageIds.length,
    );
  }

  function openDesignDirections(seed?: string) {
    const prompt =
      seed?.trim() || input.trim() || contextualEmptyPrompts[0] || "Build a modern web app";
    setPendingDesignPrompt(prompt);
    setDesignPreviewOpen(true);
  }

  // Debounced message search (keyword + semantic via API).
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchHitIds(null);
      setSearchMatchCount(0);
      setSearchSource(null);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    // Clearing the debounce timer is not enough: a request already in flight
    // still resolves and writes its hits. Typing fast means an older, slower
    // response can land after a newer one and paint results for a query the
    // user has moved on from — with the spinner already cleared.
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/projects/${project.id}/messages/search?q=${encodeURIComponent(q)}&mode=${searchMode}`,
        );
        const data = (await res.json()) as {
          hits?: Array<{ id: string }>;
          cached?: boolean;
          fallback?: boolean;
        };
        if (cancelled) return;
        const ids = new Set((data.hits ?? []).map((h) => h.id));
        setSearchHitIds(ids);
        setSearchMatchCount(ids.size);
        setSearchSource(
          data.fallback ? "fallback" : data.cached ? "cached" : null,
        );
        if (ids.size > 0) rememberSearchQuery(q);
      } catch {
        if (cancelled) return;
        setSearchHitIds(null);
        setSearchMatchCount(0);
        setSearchSource(null);
      } finally {
        if (!cancelled) setSearchLoading(false);
      }
    }, 320);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [searchQuery, searchMode, project.id, rememberSearchQuery]);

  // Prefetch analyze sandbox availability (gates binary file-gen formats).
  useEffect(() => {
    let cancelled = false;
    void fetch("/api/ai/analyze/capabilities")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d || cancelled) return;
        setAnalyzeEnabled(d.analyzeEnabled !== false);
        setAnalyzeUnavailableReason(typeof d.reason === "string" ? d.reason : null);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Which @connectors already have env credentials configured.
  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      fetch(`/api/projects/${project.id}/env`).then((r) => (r.ok ? r.json() : { envVars: [] })),
      import("./app-connectors-panel").then((module) => module.CONNECTORS),
    ])
      .then(([data, connectors]: [{ envVars?: Array<{ key: string }> }, (typeof import("./app-connectors-panel"))["CONNECTORS"]]) => {
        if (cancelled) return;
        setConnectorCatalog(connectors);
        const keys = new Set((data.envVars ?? []).map((e) => e.key));
        const connected = new Set<string>();
        for (const c of connectors) {
          if (c.fields.every((f) => keys.has(f.key))) connected.add(c.id);
        }
        setConfiguredConnectorIds(connected);
      })
      .catch(() => null);
    return () => { cancelled = true; };
  }, [project.id]);

  // Lovable-parity per-message versions: the newest assistant message carrying
  // a pre-build snapshot represents the CURRENT version — its Revert action is
  // disabled ("This is the current version"), mirroring Lovable's editor.
  const latestSnapshotMessageId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role === "assistant" && (m.metadata as { snapshot_id?: string } | null)?.snapshot_id) {
        return m.id;
      }
    }
    return null;
  }, [messages]);

  // AFTER-state semantics (exact Lovable behavior) at zero storage cost:
  // each snapshot_id captures the state BEFORE its own message, which is
  // identical to the state AFTER the PREVIOUS build. So message N's version
  // ("this version") = message N+1's pre-build snapshot. Map: messageId →
  // the NEXT build message's snapshot_id. The latest build message has no
  // successor — its after-state IS the current files (Revert disabled).
  const afterSnapshotByMessageId = useMemo(() => {
    const map = new Map<string, string>();
    let pending: string[] = [];
    for (const m of messages) {
      const snapId = (m.metadata as { snapshot_id?: string } | null)?.snapshot_id;
      if (m.role === "assistant" && snapId) {
        for (const prevId of pending) map.set(prevId, snapId);
        pending = [m.id];
      }
    }
    return map;
  }, [messages]);

  // Follow-up suggestion chips (Lovable parity): static, zero-cost pool keyed
  // to the last build prompt + current files. Only shown once a build exists.
  const followUpChips = useMemo(() => {
    // Takes precedence over everything: the user asked for something, we
    // stopped to ask a question, and the one thing they must always be able to
    // do is overrule us.
    if (scopeHeldPrompt) return [SCOPE_OVERRIDE_CHIP];
    // Lovable dump: horizontal chip “Re-run full security scan” above composer.
    if (securityIssueCount > 0) {
      return ["Re-run full security scan"];
    }
    // Lovable parity: "can be toggled off in account settings" — this is the
    // generic suggestion-chip pool the toggle controls. It does NOT gate the
    // two branches above (scope override, security re-scan), which are
    // functional recovery actions, not "suggested next things to build".
    if (!suggestionChipsEnabled) return [];
    if (!latestSnapshotMessageId) return [];
    let lastPrompt = "";
    const buildIdx = messages.findIndex((m) => m.id === latestSnapshotMessageId);
    for (let i = buildIdx; i >= 0; i--) {
      if (messages[i]?.role === "user") {
        lastPrompt = typeof messages[i].content === "string" ? messages[i].content : "";
        break;
      }
    }
    return suggestFollowUps(
      lastPrompt,
      files.map((f) => (typeof f.path === "string" ? f.path : "")).filter(Boolean),
      4,
    );
  }, [latestSnapshotMessageId, messages, files, securityIssueCount, scopeHeldPrompt, suggestionChipsEnabled]);

  const composerLineRefs = useMemo(() => parseLineRefs(input), [input]);

  const { count: guestCommentCount } = useGuestCommentCount(project.id);

  const streamingReasoning = useMemo(
    () => (streaming ? extractStreamingReasoning(streamingContent) : null),
    [streaming, streamingContent],
  );

  const showGuestCommentsBanner = useMemo(
    () =>
      !guestCommentsBannerDismissed &&
      !streaming &&
      guestCommentCount > 0 &&
      !!project.is_public,
    [guestCommentsBannerDismissed, streaming, guestCommentCount, project.is_public],
  );

  // After a build: first-publish CTA when unpublished; "Update" only when the
  // latest snapshot actually changed files (skip no-op / chat-only snapshots).
  const latestBuildHadFileChanges = useMemo(() => {
    if (!latestSnapshotMessageId) return false;
    const m = messages.find((msg) => msg.id === latestSnapshotMessageId);
    const changed = (m?.metadata as { files_changed?: unknown } | null)?.files_changed;
    return Array.isArray(changed) && changed.length > 0;
  }, [latestSnapshotMessageId, messages]);

  const showPublishBanner = useMemo(
    () =>
      !publishBannerDismissed &&
      !streaming &&
      !previewError &&
      !isLocked &&
      files.length > 0 &&
      !!latestSnapshotMessageId &&
      (!project.deployed_url || latestBuildHadFileChanges),
    [
      publishBannerDismissed,
      streaming,
      previewError,
      isLocked,
      files.length,
      latestSnapshotMessageId,
      project.deployed_url,
      latestBuildHadFileChanges,
    ],
  );

  const showSharePreview = files.length > 0 && !streaming;

  useEffect(() => {
    if (!secretBanner) return;
    const t = window.setTimeout(() => setSecretBanner(null), 12_000);
    return () => window.clearTimeout(t);
  }, [secretBanner]);

  useEffect(() => {
    if (latestSnapshotMessageId) setPublishBannerDismissed(false);
  }, [latestSnapshotMessageId]);

  useEffect(() => {
    if (guestCommentCount > 0) setGuestCommentsBannerDismissed(false);
  }, [guestCommentCount]);

  useEffect(() => {
    if (previewRuntimeErrors.length > 0) setRuntimeErrorsDismissed(false);
  }, [previewRuntimeErrors.length]);

  async function handlePublishFromChat() {
    setPublishBusy(true);
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data as { error?: string }).error ?? "Deploy failed");
      }
      toast({
        title: project.deployed_url ? "Update queued" : "Deployment started",
        description: "Your project is being deployed.",
      });
      setPublishBannerDismissed(true);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Deploy failed";
      toast({ title: "Deploy error", description: msg, variant: "destructive" });
    } finally {
      setPublishBusy(false);
    }
  }

  async function handleFixGuestComments() {
    try {
      const res = await fetch(`/api/projects/${project.id}/comments`);
      if (!res.ok) throw new Error("Failed to load comments");
      const rows = await res.json() as Array<{
        content: string;
        resolved?: boolean;
        is_guest?: boolean;
        parent_id?: string | null;
        guest_name?: string | null;
        page_path?: string | null;
        element_preview?: string | null;
        element_tag?: string | null;
      }>;
      const unresolved = rows.filter((c) => !c.resolved && c.is_guest && !c.parent_id);
      if (!unresolved.length) {
        toast({ title: "No unresolved guest comments" });
        return;
      }
      setInput(formatGuestCommentsForAi(unresolved));
      setGuestCommentsBannerDismissed(true);
      if (mode === "chat" || mode === "plan") onModeChange?.("build");
      setTimeout(() => textareaRef.current?.focus(), 0);
    } catch {
      toast({ title: "Could not load guest comments", variant: "destructive" });
    }
  }

  function handleFixRuntimeErrors() {
    const formatted = formatErrorsForHealing(previewRuntimeErrors);
    if (!formatted) return;
    setInput(
      `Fix these preview errors without breaking unrelated features:\n\n${formatted}\n\nAfter fixing, summarize what changed.`,
    );
    setRuntimeErrorsDismissed(true);
    if (mode === "chat" || mode === "plan") onModeChange?.("build");
    setTimeout(() => textareaRef.current?.focus(), 0);
  }

  const handleOpenLineRefAtLine = useCallback((path: string, line: number) => {
    window.dispatchEvent(
      new CustomEvent("lifemark-open-file-at-line", { detail: { path, line } }),
    );
  }, []);

  async function handleAddToKnowledge(msg: Message) {
    const excerpt = msg.content.trim().slice(0, 2000);
    if (!excerpt) return;
    const existing = (project.knowledge ?? "").trim();
    const stamp = new Date().toISOString().slice(0, 10);
    const block = `\n\n---\n\n## From chat (${stamp})\n${excerpt}`;
    const next = (existing ? existing + block : excerpt).slice(0, 10_000);
    try {
      const res = await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ knowledge: next }),
      });
      if (!res.ok) throw new Error("Save failed");
      onProjectUpdate?.({ knowledge: next });
      toast({
        title: "Added to knowledge",
        description: "AI will use this context in future messages.",
      });
    } catch {
      toast({ title: "Failed to add to knowledge", variant: "destructive" });
    }
  }

  async function copyMessage(msg: Message) {
    const role = msg.role === "user" ? "You" : "LifemarkAI";
    const body = getDisplayMessageContent(msg);
    try {
      await navigator.clipboard.writeText(`**${role}:**\n\n${body}`);
    } catch {
      toast({ title: "Could not copy", description: "Clipboard access was denied or unavailable.", variant: "destructive" });
      return;
    }
    setCopiedId(msg.id);
    setTimeout(() => setCopiedId(null), 2000);
    toast({ description: "Copied as Markdown" });
  }

  async function copyMessageLink(messageId: string) {
    const url = `${window.location.origin}/editor/${project.id}?message=${encodeURIComponent(messageId)}`;
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      toast({ title: "Could not copy link", variant: "destructive" });
      return;
    }
    setCopiedLinkId(messageId);
    setTimeout(() => setCopiedLinkId(null), 2000);
    toast({ description: "Message link copied" });
  }

  function exportMessage(msg: Message) {
    const role = msg.role === "user" ? "You" : "LifemarkAI";
    const body = getDisplayMessageContent(msg);
    const md = `### ${role}\n\n${body}\n\n---\n_${new Date(msg.created_at).toLocaleString()}_\n`;
    downloadBlob(md, "text/markdown", `${project.name.replace(/\s+/g, "-").toLowerCase()}-message-${msg.id.slice(0, 8)}.md`);
    toast({ description: "Message exported" });
  }

  function useMessageInComposer(msg: Message) {
    const body = getDisplayMessageContent(msg);
    const snippet = body.length > 600 ? `${body.slice(0, 600)}…` : body;
    const quoted =
      msg.role === "user"
        ? snippet
        : `Follow up on this:\n\n> ${snippet.replace(/\n/g, "\n> ")}\n\n`;
    setInput((prev) => (prev.trim() ? `${prev.trim()}\n\n${quoted}` : quoted));
    setTimeout(() => textareaRef.current?.focus(), 50);
  }

  async function restoreMessagesSnapshot(snapshot: Message[]) {
    const res = await fetch(`/api/projects/${project.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        restore: true,
        messages: snapshot.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          mode: m.mode,
          tokens_used: m.tokens_used,
          model: m.model,
          metadata: m.metadata,
          rating: m.rating,
          created_at: m.created_at,
        })),
      }),
    });
    if (!res.ok) throw new Error("restore failed");
  }

  async function undoClearChat() {
    const snapshot = clearedSnapshotRef.current;
    if (!snapshot?.length) return;
    if (messagesRef.current.length > 0) {
      toast({
        title: "Can't undo",
        description: "New messages were sent after clearing.",
        variant: "destructive",
      });
      return;
    }
    try {
      await restoreMessagesSnapshot(snapshot);
      onMessagesUpdate(snapshot);
      clearedSnapshotRef.current = null;
      toast({ description: "Conversation restored" });
    } catch {
      toast({ title: "Failed to restore conversation", variant: "destructive" });
    }
  }

  async function undoDeleteMessage() {
    const snapshot = deletedSnapshotRef.current;
    if (!snapshot) return;
    try {
      await restoreMessagesSnapshot([snapshot]);
      const current = messagesRef.current;
      const next = current.some((m) => m.id === snapshot.id)
        ? current
        : [...current, snapshot].sort(
            (a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
          );
      onMessagesUpdate(next);
      deletedSnapshotRef.current = null;
      toast({ description: "Message restored" });
    } catch {
      toast({ title: "Failed to restore message", variant: "destructive" });
    }
  }

  function stripForSpeech(text: string): string {
    return text
      .replace(/```[\s\S]*?```/g, " ")
      .replace(/`[^`]+`/g, " ")
      .replace(/[#*_~>\[\]()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function toggleReadAloud(msg: Message) {
    if (typeof window === "undefined" || !window.speechSynthesis) {
      toast({ title: "Speech not supported in this browser", variant: "destructive" });
      return;
    }
    if (speakingMessageId === msg.id) {
      window.speechSynthesis.cancel();
      setSpeakingMessageId(null);
      return;
    }
    const text = stripForSpeech(getDisplayMessageContent(msg)).slice(0, 4000);
    if (!text) {
      toast({ description: "Nothing to read" });
      return;
    }
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeakingMessageId(null);
    utterance.onerror = () => setSpeakingMessageId(null);
    setSpeakingMessageId(msg.id);
    window.speechSynthesis.speak(utterance);
  }

  async function deleteMessage(msg: Message) {
    if (!window.confirm("Delete this message?")) return;
    try {
      const res = await fetch(`/api/projects/${project.id}/messages/${msg.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("delete failed");
      deletedSnapshotRef.current = msg;
      onMessagesUpdate(messages.filter((m) => m.id !== msg.id));
      if (pinnedMsgId === msg.id) setPinnedMsgId(null);
      if (speakingMessageId === msg.id) {
        window.speechSynthesis?.cancel();
        setSpeakingMessageId(null);
      }
      setBookmarkedIds((prev) => {
        if (!prev.has(msg.id)) return prev;
        const next = new Set(prev);
        next.delete(msg.id);
        writeJSON(bookmarkKey, [...next]);
        return next;
      });
      toast({
        description: "Message deleted",
        duration: 8000,
        action: { label: "Undo", onClick: () => void undoDeleteMessage() },
      });
    } catch {
      toast({ title: "Failed to delete message", variant: "destructive" });
    }
  }

  async function handleClearChat() {
    if (!window.confirm("Clear this conversation?")) return;
    const snapshot = [...messages];
    try {
      const res = await fetch(`/api/projects/${project.id}/messages`, { method: "DELETE" });
      if (!res.ok) throw new Error(`Clear failed (${res.status})`);
    } catch (error) {
      toast({
        title: "Conversation was not cleared",
        description: error instanceof Error ? error.message : "Check your connection and try again.",
        variant: "destructive",
      });
      return;
    }
    clearedSnapshotRef.current = snapshot;
    window.speechSynthesis?.cancel();
    setSpeakingMessageId(null);
    onMessagesUpdate([]);
    toast({
      title: "Conversation cleared",
      duration: 10000,
      action: { label: "Undo", onClick: () => void undoClearChat() },
    });
  }

  function exportChatAsMarkdown() {
    if (visibleMessages.length === 0) return;
    const lines: string[] = [
      `# ${project.name} — Chat Export`,
      ``,
      `> Exported ${new Date().toLocaleString()}`,
      ``,
    ];
    for (const msg of visibleMessages) {
      const role = msg.role === "user" ? "**You**" : "**LifemarkAI**";
      lines.push(`### ${role}`);
      lines.push(``);
      lines.push(msg.content ?? "");
      lines.push(``);
      lines.push(`---`);
      lines.push(``);
    }
    downloadBlob(lines.join("\n"), "text/markdown", `${project.name.replace(/\s+/g, "-").toLowerCase()}-chat.md`);
    toast({ description: "Chat exported ✓" });
  }

  function exportChatAsJson() {
    if (visibleMessages.length === 0) return;
    const payload = {
      project: { id: project.id, name: project.name },
      exportedAt: new Date().toISOString(),
      messages: visibleMessages.map((m) => ({
        id: m.id,
        role: m.role,
        mode: m.mode ?? null,
        content: getDisplayMessageContent(m),
        model: m.model ?? null,
        created_at: m.created_at,
        metadata: m.metadata ?? null,
      })),
    };
    downloadBlob(JSON.stringify(payload, null, 2), "application/json", `${project.name.replace(/\s+/g, "-").toLowerCase()}-chat.json`);
    toast({ description: "Chat exported as JSON ✓" });
  }

  function printChat() {
    void import("@/lib/editor/print-chat").then(({ printChatConversation }) => printChatConversation({
      projectName: project.name,
      messages: visibleMessages,
      getDisplayContent: getDisplayMessageContent,
    }));
  }

  const noCredits = credits <= 0;

  // Hoisted out of the message map — the previous inline
  // `[...messages].filter().pop()` ran once per assistant row per render
  // (O(n²) over the conversation).
  const lastAssistantMsgId = useMemo(() => {
    for (let i = visibleMessages.length - 1; i >= 0; i--) {
      if (visibleMessages[i]?.role === "assistant") return visibleMessages[i].id;
    }
    return null;
  }, [visibleMessages]);

  const chatThreads = useMemo(() => {
    let filtered = showBookmarks
      ? visibleMessages.filter((m) => bookmarkedIds.has(m.id))
      : searchQuery && searchHitIds
        ? visibleMessages.filter((m) => searchHitIds.has(m.id))
        : searchQuery
          ? visibleMessages.filter((m) =>
              m.content.toLowerCase().includes(searchQuery.toLowerCase()),
            )
          : visibleMessages;
    if (searchQuery.trim() && searchRoleFilter !== "all") {
      filtered = filtered.filter((m) => m.role === searchRoleFilter);
    }
    if (searchQuery.trim() && searchMsgModeFilter !== "all") {
      filtered = filtered.filter((m) => (m.mode ?? "chat") === searchMsgModeFilter);
    }
    return groupIntoThreads(filtered);
  }, [
    visibleMessages,
    showBookmarks,
    bookmarkedIds,
    searchQuery,
    searchHitIds,
    searchRoleFilter,
    searchMsgModeFilter,
  ]);

  // Prune stale collapse indices when the thread list shrinks — do not
  // auto-collapse older turns (that hid message bodies behind Turn labels).
  useEffect(() => {
    const threadCount = chatThreads.length;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- align collapse set with rendered turns
    setCollapsedThreads((prev) => pruneCollapsedThreads(prev, threadCount));
  }, [chatThreads.length, pruneCollapsedThreads]);

  const scrollToMessage = useCallback((messageId: string) => {
    const threadIdx = chatThreads.findIndex((t) => t.some((m) => m.id === messageId));
    if (threadIdx < 0) return;

    setFocusedMessageId(messageId);

    if (!searchQuery) {
      setCollapsedThreads((prev) => {
        if (!prev.has(threadIdx)) return prev;
        const next = new Set(prev);
        next.delete(threadIdx);
        return next;
      });
    }

    timelineRef.current?.scrollToThreadIndex(threadIdx, "center");

    // Virtualized rows mount asynchronously — retry until the message node exists.
    const tryScroll = (attemptsLeft: number) => {
      const el = scrollContainerRef.current?.querySelector(
        `[data-message-id="${messageId}"]`,
      ) as HTMLElement | null;
      if (el) {
        el.scrollIntoView({ block: "center", behavior: "smooth" });
        return;
      }
      if (attemptsLeft <= 0) return;
      window.setTimeout(() => tryScroll(attemptsLeft - 1), 40);
    };
    window.requestAnimationFrame(() => tryScroll(15));
  }, [chatThreads, searchQuery]);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    setIsAtBottom(true);
    lastSeenCountRef.current = visibleMessages.length + (streaming ? 1 : 0);
    setNewMessageCount(0);
  }, [visibleMessages.length, streaming]);

  const scrollToTop = useCallback(() => {
    scrollContainerRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const navigateFocusedMessage = useCallback((delta: number) => {
    if (visibleMessages.length === 0) return;
    setFocusedMessageId((current) => {
      let idx = current ? visibleMessages.findIndex((m) => m.id === current) : -1;
      if (idx < 0) idx = delta > 0 ? -1 : visibleMessages.length;
      const nextIdx = Math.max(0, Math.min(visibleMessages.length - 1, idx + delta));
      const nextId = visibleMessages[nextIdx]?.id ?? null;
      if (nextId) {
        window.setTimeout(() => scrollToMessage(nextId), 0);
      }
      return nextId;
    });
  }, [visibleMessages, scrollToMessage]);

  const focusComposer = useCallback(() => {
    setFocusedMessageId(null);
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    return () => {
      window.speechSynthesis?.cancel();
    };
  }, []);

  const chatDays = useMemo(
    () => buildLovableChatDayJumps(visibleMessages),
    [visibleMessages],
  );

  useEffect(() => {
    if (isAtBottom) {
      lastSeenCountRef.current = visibleMessages.length + (streaming ? 1 : 0);
      setNewMessageCount(0);
    } else {
      const pending = visibleMessages.length - lastSeenCountRef.current + (streaming ? 1 : 0);
      setNewMessageCount(Math.max(0, pending));
    }
  }, [visibleMessages.length, isAtBottom, streaming]);

  useEffect(() => {
    if (!activeSearchHitId || !showSearch) return;
    scrollToMessage(activeSearchHitId);
  }, [activeSearchHitId, showSearch, scrollToMessage]);

  useEffect(() => {
    if (deepLinkedRef.current || messages.length === 0) return;
    const params = new URLSearchParams(window.location.search);
    const hashMatch = window.location.hash.match(/^#message=([^\s&]+)/);
    const msgId = params.get("message") ?? (hashMatch ? decodeURIComponent(hashMatch[1]) : null);
    if (!msgId || !messages.some((m) => m.id === msgId)) return;
    deepLinkedRef.current = true;
    const timer = window.setTimeout(() => scrollToMessage(msgId), 400);
    return () => window.clearTimeout(timer);
  }, [messages, scrollToMessage]);

  // ⌘F search · Alt+B bookmarks · End jump to bottom · Alt+P Plan/Build · Alt+V voice · Esc stop
  useChatKeyboardShortcuts({
    mode,
    streaming,
    showSearch,
    onModeChange,
    onClearChat: () => void handleClearChat(),
    onSearchShortcut: () => {
      setShowSearch((v) => {
        const next = !v;
        if (next) {
          try {
            const raw = sessionStorage.getItem(searchStorageKey);
            if (raw) {
              const saved = JSON.parse(raw) as {
                query?: string;
                mode?: ChatSearchMode;
                role?: ChatSearchRoleFilter;
                msgMode?: ChatSearchMsgModeFilter;
              };
              if (saved.query) setSearchQuery(saved.query);
              if (saved.mode === "keyword" || saved.mode === "semantic") setSearchMode(saved.mode);
              if (saved.role === "all" || saved.role === "user" || saved.role === "assistant") {
                setSearchRoleFilter(saved.role);
              }
              if (
                saved.msgMode === "all" ||
                saved.msgMode === "chat" ||
                saved.msgMode === "plan" ||
                saved.msgMode === "build" ||
                saved.msgMode === "agent" ||
                saved.msgMode === "patch"
              ) {
                setSearchMsgModeFilter(saved.msgMode);
              }
            }
          } catch { /* private mode */ }
          setTimeout(() => searchInputRef.current?.focus(), 50);
        }
        return next;
      });
    },
    onNavigateSearchHit: (delta = 1) => navigateSearchHit(delta),
    onBookmarksShortcut: () => {
      setShowBookmarks((v) => {
        const next = !v;
        if (next && bookmarkedIds.size > 0) {
          const first = visibleMessages.find((m) => bookmarkedIds.has(m.id));
          if (first) setTimeout(() => scrollToMessage(first.id), 80);
        }
        return next;
      });
    },
    onScrollToBottom: scrollToBottom,
    onScrollToTop: scrollToTop,
    onNavigateMessage: navigateFocusedMessage,
    onFocusComposer: focusComposer,
    onStopGeneration: stopGeneration,
    onVoiceShortcut: () => voiceModeRef.current?.toggle(),
  });

  // Dump places chat utilities in `#main-menu` (editor top bar), not an in-panel header.
  useEffect(() => {
    const onSettings = (e: Event) => {
      const action = (e as CustomEvent<{ action: LifemarkChatSettingsAction }>).detail?.action;
      if (!action) return;
      switch (action) {
        case "search": {
          setShowSearch((v) => {
            const next = !v;
            if (next) {
              try {
                const raw = sessionStorage.getItem(searchStorageKey);
                if (raw) {
                  const saved = JSON.parse(raw) as {
                    query?: string;
                    mode?: ChatSearchMode;
                    role?: ChatSearchRoleFilter;
                    msgMode?: ChatSearchMsgModeFilter;
                  };
                  if (saved.query) setSearchQuery(saved.query);
                  if (saved.mode === "keyword" || saved.mode === "semantic") setSearchMode(saved.mode);
                  if (saved.role === "all" || saved.role === "user" || saved.role === "assistant") {
                    setSearchRoleFilter(saved.role);
                  }
                  if (
                    saved.msgMode === "all" ||
                    saved.msgMode === "chat" ||
                    saved.msgMode === "plan" ||
                    saved.msgMode === "build" ||
                    saved.msgMode === "agent" ||
                    saved.msgMode === "patch"
                  ) {
                    setSearchMsgModeFilter(saved.msgMode);
                  }
                }
              } catch { /* private mode */ }
              setTimeout(() => searchInputRef.current?.focus(), 50);
            }
            return next;
          });
          break;
        }
        case "bookmarks":
          setShowBookmarks((v) => {
            const next = !v;
            if (next && bookmarkedIds.size > 0) {
              const first = visibleMessages.find((m) => bookmarkedIds.has(m.id));
              if (first) setTimeout(() => scrollToMessage(first.id), 80);
            }
            return next;
          });
          break;
        case "export-markdown":
          exportChatAsMarkdown();
          break;
        case "export-json":
          exportChatAsJson();
          break;
        case "print":
          printChat();
          break;
        case "copy-all":
          void (async () => {
            const text = visibleMessages.map((m) => `${m.role === "user" ? "You" : "AI"}: ${m.content}`).join("\n\n");
            try {
              await navigator.clipboard.writeText(text);
            } catch {
              toast({ title: "Could not copy", variant: "destructive" });
              return;
            }
            setCopiedAll(true);
            setTimeout(() => setCopiedAll(false), 2000);
            toast({ description: "All messages copied" });
          })();
          break;
        case "clear":
          void handleClearChat();
          break;
        case "toggle-code-blocks": {
          const next = !allCodeBlocksCollapsed;
          setAllCodeBlocksCollapsed(next);
          window.dispatchEvent(new CustomEvent("chat-codeblock-set-all", { detail: { collapsed: next } }));
          break;
        }
        case "collapse-threads":
          // Collapse all but the newest turn (manual action from #main-menu).
          setCollapsedThreads(pruneCollapsedThreads(
            new Set(Array.from({ length: Math.max(0, chatThreads.length - 1) }, (_, i) => i)),
            chatThreads.length,
          ));
          break;
        case "expand-threads":
          setCollapsedThreads(new Set());
          break;
        case "toggle-density":
          setCompactDensity((v) => {
            const next = !v;
            writeString(`lifemark-chat-density-${project.id}`, next ? "compact" : "comfortable");
            return next;
          });
          break;
        default:
          break;
      }
    };
    window.addEventListener(LIFEMARK_CHAT_SETTINGS_EVENT, onSettings);
    return () => window.removeEventListener(LIFEMARK_CHAT_SETTINGS_EVENT, onSettings);
  }, [
    searchStorageKey,
    bookmarkedIds,
    visibleMessages,
    allCodeBlocksCollapsed,
    chatThreads.length,
    project.id,
    scrollToMessage,
    toast,
    pruneCollapsedThreads,
  ]);

  const threadMessageProps = useThreadMessageProps({
    searchQuery,
    activeSearchHitId,
    focusedMessageId,
    streaming,
    showBookmarks,
    lastAssistantMsgId,
    copiedId,
    copiedLinkId,
    pinnedMsgId,
    ratings,
    editingMessageId,
    editInput,
    bookmarkedIds,
    expandedDiffs,
    reactions,
    messageDiffs,
    messageChangedPaths,
    messageScreenshots,
    messageBuildActivity,
    messageSkills,
    messageCredits,
    genTimes,
    suggestions: suggestionChipsEnabled ? suggestions : EMPTY_SUGGESTIONS,
    roleTestChips,
    approvedSteps,
    fileStates,
    afterSnapshotByMessageId,
    latestSnapshotMessageId,
    visibleMessages,
    onCopy: copyMessage,
    onCopyLink: copyMessageLink,
    onExportMessage: exportMessage,
    onUseInComposer: useMessageInComposer,
    onDeleteMessage: deleteMessage,
    onReadAloud: toggleReadAloud,
    speakingMessageId,
    onStartEdit: startEditMessage,
    onTogglePin: (msgId) =>
      setPinnedMsgId((prev) => {
        const next = prev === msgId ? null : msgId;
        toast({
          title: next ? "Message pinned" : "Message unpinned",
          description: next
            ? "Jump to it anytime from the pin banner above the chat."
            : undefined,
        });
        return next;
      }),
    onRate: rateMessage,
    onEditInputChange: setEditInput,
    onSubmitEdit: submitEditedMessage,
    onCancelEdit: () => setEditingMessageId(null),
    onRegenerate: handleRegenerate,
    onToggleBookmark: toggleBookmark,
    onToggleDiffDetails: (msgId) =>
      setExpandedDiffs((prev) => {
        const next = new Set(prev);
        if (next.has(msgId)) next.delete(msgId);
        else next.add(msgId);
        return next;
      }),
    onPreviewChanges: (msgId) =>
      setExpandedDiffs((prev) => {
        const next = new Set(prev);
        next.delete(msgId);
        return next;
      }),
    onFocusPreview,
    onToggleReaction: toggleReaction,
    onRevertFile: handleRevertFile,
    onReApplyFile: handleReApplyFile,
    onAcceptFile: (msgId, path) => {
      const diff = messageDiffs[msgId]?.find((d) => d.path === path);
      if (diff) {
        void handleReApplyFile(msgId, diff);
        return;
      }
      setFileStates((prev) => ({
        ...prev,
        [msgId]: { ...(prev[msgId] ?? {}), [path]: "accepted" },
      }));
    },
    onRevertToVersion: handleRevertToVersion,
    onSaveAsSkill: (msg) => {
      const idx = visibleMessages.findIndex((m) => m.id === msg.id);
      const prevUser =
        idx > 0 ? [...visibleMessages.slice(0, idx)].reverse().find((m) => m.role === "user") : null;
      setSaveSkillDraft({
        sourceMessageId: msg.id,
        name: prevUser?.content?.slice(0, 60).trim() || "Saved skill",
        description: prevUser?.content?.slice(0, 200) ?? "",
        prompt: msg.content,
      });
    },
    onAddToKnowledge: (msg) => void handleAddToKnowledge(msg),
    onSendMessage: (text, m) => void sendMessage(text, m),
    onApprovePlan,
    onModeChange,
    onToggleStep: toggleStepApproval,
    onSelectAllSteps: (msgId, stepCount) => {
      if (!stepCount) return;
      setApprovedSteps((prev) => ({ ...prev, [msgId]: new Set(Array.from({ length: stepCount }, (_, i) => i)) }));
    },
    onClearSteps: (msgId) => setApprovedSteps((prev) => ({ ...prev, [msgId]: new Set() })),
    onBuildSteps: executeApprovedSteps,
    onSelectSuggestion: (msgId, chip) => {
      setSuggestions((prev) => {
        const n = { ...prev };
        delete n[msgId];
        return n;
      });
      void sendMessage(chip);
    },
    onSelectRoleTestChip: (msgId, chip) => {
      setRoleTestChips((prev) => {
        const n = { ...prev };
        delete n[msgId];
        return n;
      });
      const role = chip.replace(/^Test the new changes as the\s+/i, "").replace(/\s+role$/i, "");
      const description =
        `Validate recent changes for the ${role} role. Cover: ` +
        `1) login/auth for ${role}, 2) routes ${role} can/cannot reach, ` +
        `3) UI visible/hidden for ${role}, 4) role-specific actions.`;
      void sendMessage(description);
    },
    onOpenTestingPanel: () => {
      void sendMessage(
        "Check the latest UI changes: auth, main flows, empty/error states, and anything that looks broken.",
      );
    },
    onSaveAnalyzeFile: saveGeneratedFileToProject,
    onOpenBranchSnapshot: (snapshotId) => {
      onOpenPanel?.("history");
      window.dispatchEvent(
        new CustomEvent("lifemark-preview-version", {
          detail: { snapshotId, label: "Before branch" },
        }),
      );
    },
  });

  const composerDock = useComposerDockController({
    textareaRef,
    previewError,
    previewRuntimeErrors,
    noCredits,
    streaming,
    messagesLength: messages.length,
    contextualEmptyPrompts,
    autoFixing,
    autoFixAttempts,
    maxAutoFixAttempts: MAX_AUTO_FIX_ATTEMPTS,
    freeFixesRemaining,
    fileGenResults,
    activeClarifySession,
    promptQueue,
    queuePaused,
    editingQueueId,
    editingQueueText,
    clarifyFirst,
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
    runtimeErrorsDismissed,
    onFixRuntimeErrors: handleFixRuntimeErrors,
    onDismissRuntimeErrors: () => setRuntimeErrorsDismissed(true),
    persistClarifyTurns,
  });
  answerClarifyRef.current = composerDock.onAnswerClarifyTurn;
  skipClarifyCurrentRef.current = composerDock.onSkipClarifyCurrent;
  skipClarifyAllRef.current = () => {
    if (activeClarifySession) composerDock.onClarifySkipAndBuild(activeClarifySession.originalPrompt);
  };

  const getMessageProps = useCallback(
    (msg: Message, msgIdx: number, thread: Message[]) => {
      const base = threadMessageProps(msg, msgIdx, thread);
      const meta = msg.metadata as { clarifyCurrent?: boolean; clarifyAck?: string; clarifyTurnId?: string } | null;
      const current = currentClarifyQuestion(clarifyInterview);
      const turnId = messageClarifyTurnId(meta, msg.id);
      const isCurrentQuestion =
        !!current &&
        (meta?.clarifyCurrent === true || turnId === `clarify-q-${current.id}`);
      if (!isCurrentQuestion || !current || !clarifyInterview) return base;
      const timelineAck = buildClarifyTimeline(clarifyInterview).find((turn) => turn.current)?.ack;
      return {
        ...base,
        clarifyTurn: {
          question: current,
          step: clarifyInterview.currentIndex + 1,
          total: Math.max(clarifyInterview.questions.length, clarifyInterview.currentIndex + 1),
          isFirst: clarifyInterview.currentIndex === 0,
          ack: typeof meta?.clarifyAck === "string" ? meta.clarifyAck : timelineAck,
          awaitingDetails: clarifyInterview.awaitingDetails === true,
          onAnswer: (answer: string) => answerClarifyRef.current(answer),
          onSkip: () => skipClarifyCurrentRef.current(),
          onSkipAll: () => skipClarifyAllRef.current(),
        },
      };
    },
    [threadMessageProps, clarifyInterview],
  );

  return (
    <LovableChatPanelShell
      // Lift the chat panel above the on-screen keyboard on mobile. inset is 0
      // on desktop, ~250-300px on iOS/Android when the keyboard is up. The
      // padding-bottom approach (vs. translateY) preserves scroll position
      // and keeps the most-recent messages visible.
      style={{ paddingBottom: keyboardInset }}
      compactDensity={compactDensity}
    >
      <LovableChatHeader
        draftSwitcherSlot={<LovableDraftSwitcher projectId={project.id} />}
        mode={mode}
        queueCount={promptQueue.length}
        queuePaused={queuePaused}
        creditLabel={`${mode === "build" || mode === "agent" ? "2" : "1"} credit${mode === "patch" ? " · patch" : ""} / msg`}
        hasMessages={visibleMessages.length > 0}
        messageCount={visibleMessages.length}
        showSearch={showSearch}
        showBookmarks={showBookmarks}
        bookmarkCount={bookmarkedIds.size}
        allCodeBlocksCollapsed={allCodeBlocksCollapsed}
        copiedAll={copiedAll}
        compactDensity={compactDensity}
        onToggleCompactDensity={() => {
          setCompactDensity((v) => {
            const next = !v;
            writeString(`lifemark-chat-density-${project.id}`, next ? "compact" : "comfortable");
            return next;
          });
        }}
        onExportMarkdown={exportChatAsMarkdown}
        onExportJson={exportChatAsJson}
        onPrintChat={printChat}
        onCopyAll={async () => {
          const text = visibleMessages.map((m) => `${m.role === "user" ? "You" : "AI"}: ${m.content}`).join("\n\n");
          try {
            await navigator.clipboard.writeText(text);
          } catch {
            toast({ title: "Could not copy", variant: "destructive" });
            return;
          }
          setCopiedAll(true);
          setTimeout(() => setCopiedAll(false), 2000);
          toast({ description: "All messages copied" });
        }}
        onClearChat={() => void handleClearChat()}
        onToggleSearch={() => {
          window.dispatchEvent(
            new CustomEvent(LIFEMARK_CHAT_SETTINGS_EVENT, { detail: { action: "search" } }),
          );
        }}
        onToggleBookmarks={() => {
          window.dispatchEvent(
            new CustomEvent(LIFEMARK_CHAT_SETTINGS_EVENT, { detail: { action: "bookmarks" } }),
          );
        }}
        onToggleCodeBlocks={() => {
          window.dispatchEvent(
            new CustomEvent(LIFEMARK_CHAT_SETTINGS_EVENT, { detail: { action: "toggle-code-blocks" } }),
          );
        }}
        onCollapseAllThreads={() => {
          window.dispatchEvent(
            new CustomEvent(LIFEMARK_CHAT_SETTINGS_EVENT, { detail: { action: "collapse-threads" } }),
          );
        }}
        onExpandAllThreads={() => {
          window.dispatchEvent(
            new CustomEvent(LIFEMARK_CHAT_SETTINGS_EVENT, { detail: { action: "expand-threads" } }),
          );
        }}
        chatDays={chatDays}
        onJumpToDay={(messageId) => scrollToMessage(messageId)}
      />
      <LovableChatHeaderStatus />

      <AnimatePresence>
        {showSearch && (
          <LovableChatSearchBar
            ref={searchInputRef}
            query={searchQuery}
            mode={searchMode}
            roleFilter={searchRoleFilter}
            msgModeFilter={searchMsgModeFilter}
            loading={searchLoading}
            searchSource={searchSource}
            matchCount={searchHitMessageIds.length || searchMatchCount}
            activeIndex={searchHitMessageIds.length > 0 ? activeSearchHitIndex : undefined}
            recentQueries={recentSearchQueries}
            onNavigate={navigateSearchHit}
            onJumpFirst={() => {
              if (searchHitMessageIds.length === 0) return;
              setActiveSearchHitIndex(0);
            }}
            onJumpLast={() => {
              if (searchHitMessageIds.length === 0) return;
              setActiveSearchHitIndex(searchHitMessageIds.length - 1);
            }}
            onQueryChange={(value) => {
              setSearchQuery(value);
            }}
            onSelectRecent={(q) => {
              setSearchQuery(q);
              searchInputRef.current?.focus();
            }}
            onClearRecent={() => {
              setRecentSearchQueries([]);
              removeKey(`lifemark-recent-searches-${project.id}`);
            }}
            onClearQuery={() => {
              setSearchQuery("");
              setSearchHitIds(null);
              setSearchMatchCount(0);
              setActiveSearchHitIndex(0);
              searchInputRef.current?.focus();
            }}
            onModeChange={setSearchMode}
            onRoleFilterChange={setSearchRoleFilter}
            onMsgModeFilterChange={setSearchMsgModeFilter}
            onClose={() => {
              setShowSearch(false);
              setSearchQuery("");
              setSearchHitIds(null);
              setSearchMatchCount(0);
              setActiveSearchHitIndex(0);
            }}
          />
        )}
      </AnimatePresence>

      {!!privateContext?.context_summary && (
        <LovableContextSummaryBanner coversLabel={privateContext.context_summary_covers} />
      )}

      {/* Messages — Lovable virtualized timeline */}
      <div className="flex-1 relative min-h-0 flex flex-col">
      <LovableChatTimeline
        ref={timelineRef}
        projectId={project.id}
        scrollRef={scrollContainerRef}
        items={chatThreads}
        getItemKey={(thread, i) => thread[0]?.id ?? `thread-${i}`}
        estimateSize={(index) => {
          const thread = chatThreads[index];
          if (!thread?.length) return 220;
          let h = 160;
          for (const m of thread) {
            const len = (m.content ?? "").length;
            h += Math.min(420, 80 + Math.floor(len / 4));
            const diffs = messageDiffs[m.id];
            if (diffs?.length) h += Math.min(360, 120 + diffs.length * 48);
            if (messageScreenshots[m.id]) h += 220;
            if (messageBuildActivity[m.id]?.length) h += 80;
          }
          return Math.min(900, Math.max(180, h));
        }}
        header={
          <LovableChatTimelineHeader
            loadingOlderMessages={loadingOlderMessages}
            isMessagesLoading={isMessagesLoading}
            messagesLength={messages.length}
            streaming={streaming}
            contextualEmptyPrompts={contextualEmptyPrompts}
            onSelectEmptyPrompt={(prompt) => {
              setInput(prompt);
              textareaRef.current?.focus();
            }}
            onExploreDesignDirections={() => openDesignDirections()}
            pinnedMsgId={pinnedMsgId}
            visibleMessages={visibleMessages}
            onUnpin={() => setPinnedMsgId(null)}
            onJumpToPinned={
              pinnedMsgId ? () => scrollToMessage(pinnedMsgId) : undefined
            }
            showBookmarks={showBookmarks}
            bookmarkCount={bookmarkedIds.size}
            hasMoreMessages={hasMoreMessages}
            onLoadOlder={() => void loadOlderMessages()}
            showSearch={showSearch}
            searchQuery={searchQuery}
            searchMode={searchMode}
            searchLoading={searchLoading}
            searchMatchCount={searchHitMessageIds.length || searchMatchCount}
          />
        }
        renderItem={(thread, threadIdx) => (
          <LovableThreadItem
            key={thread[0]?.id ?? `thread-${threadIdx}`}
            thread={thread}
            threadIdx={threadIdx}
            searchQuery={searchQuery}
            // Collapse is opt-in per thread and NEVER applies to the newest one,
            // so the current turn is always readable. It was previously pinned to
            // `false`, which left the "Collapse all threads" menu item, the
            // onToggleCollapse handler and the sessionStorage persistence all
            // writing state that nothing ever read.
            collapsed={collapsedThreads.has(threadIdx) && threadIdx !== chatThreads.length - 1}
            onToggleCollapse={() =>
              setCollapsedThreads((prev) => {
                const n = new Set(prev);
                if (n.has(threadIdx)) n.delete(threadIdx);
                else n.add(threadIdx);
                return n;
              })
            }
            onDateSeparatorClick={(messageId) => {
              const msg = visibleMessages.find((m) => m.id === messageId);
              if (!msg) return;
              if (chatDays.length > 1) {
                const idx = chatDays.findIndex((d) => d.key === lovableChatDayKey(msg.created_at));
                const next = chatDays[(idx >= 0 ? idx + 1 : 0) % chatDays.length];
                if (next) scrollToMessage(next.messageId);
                return;
              }
              navigator.clipboard.writeText(new Date(msg.created_at).toLocaleString()).then(() => {
                toast({ description: "Date copied" });
              }).catch(() => {
                toast({ title: "Could not copy", variant: "destructive" });
              });
            }}
            onCopyThread={async (thread) => {
              const text = thread
                .map((m) => `**${m.role === "user" ? "You" : "LifemarkAI"}:**\n\n${getDisplayMessageContent(m)}`)
                .join("\n\n---\n\n");
              try {
                await navigator.clipboard.writeText(text);
              } catch {
                toast({ title: "Could not copy", variant: "destructive" });
                return;
              }
              toast({ description: "Turn copied" });
            }}
            getMessageProps={getMessageProps}
          />
        )}
        footer={
          <LovableChatStreamingFooter
            streaming={streaming || streamingContent.length > 0 || streamingFiles.length > 0}
            thoughtSeconds={thoughtSeconds}
            reasoningText={streamingReasoning}
            streamingContent={streamingContent}
            streamingFiles={streamingFiles}
            pendingSkills={pendingSkills}
            agentSteps={clarifyStreaming ? [] : agentSteps}
            subagentSteps={subagentSteps}
            previewVerify={previewVerify}
            buildActivitySteps={clarifyStreaming ? [] : buildActivitySteps}
            mode={clarifyStreaming ? "chat" : mode}
            buildStatus={clarifyStreaming ? null : buildStatus}
            postBuildStatus={postBuildStatus}
            messagesEndRef={messagesEndRef}
          />
        }
      />

      <LovableScrollToBottom
        visible={!isAtBottom}
        newCount={newMessageCount}
        onClick={scrollToBottom}
      />
      </div>{/* end messages wrapper */}

      {stoppedDraft && !streaming && (
        <LovableContinueBanner
          preview={stoppedDraft.replace(/\s+/g, " ").slice(0, 72) + (stoppedDraft.length > 72 ? "…" : "")}
          onContinue={continueAfterStop}
          onDismiss={() => setStoppedDraft(null)}
        />
      )}

      {showDraftBanner && input.trim() && !streaming && (
        <LovableDraftRestoreBanner
          preview={input.replace(/\s+/g, " ").slice(0, 72) + (input.length > 72 ? "…" : "")}
          onKeep={() => setShowDraftBanner(false)}
          onDiscard={() => {
            setInput("");
            setShowDraftBanner(false);
            removeKey(composerDraftKey);
          }}
        />
      )}

      <LovableComposerDock
        {...composerDock}
        projectId={project.id}
        showSharePreview={showSharePreview}
        showPublishBanner={showPublishBanner}
        deployedUrl={project.deployed_url ?? null}
        publishBusy={publishBusy}
        onPublish={() => void handlePublishFromChat()}
        onOpenPublishPanel={() => onOpenPanel?.("publishpanel")}
        onDismissPublishBanner={() => setPublishBannerDismissed(true)}
        guestCommentCount={guestCommentCount}
        showGuestCommentsBanner={showGuestCommentsBanner}
        onOpenCommentsPanel={() => onOpenPanel?.("comments")}
        onFixGuestComments={() => void handleFixGuestComments()}
        onDismissGuestCommentsBanner={() => setGuestCommentsBannerDismissed(true)}
      />

      {/* ── Lovable-style input area (mobile = bottom sheet) ── */}
      <LovableComposerMobileSheet enabled={isMobile}>
      <LovableChatComposerShell
        className={isMobile ? "border-0 bg-transparent backdrop-blur-none px-2 pb-2 pt-0" : undefined}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
        }}
        onDrop={handleDrop}
        onPasteCapture={handleSecretPaste}
      >
        <LovableComposerPreInput
          isDragging={isDragging}
          projectId={project.id}
          connectorApproval={connectorApproval}
          onConnectorApprovalClear={() => setConnectorApproval(null)}
          cloudAction={cloudAction}
          onCloudActionClear={() => setCloudAction(null)}
          cloudTierPick={cloudTierPick}
          onCloudTierPick={setCloudTierPick}
          onRetryAgent={(prompt) => void sendMessage(prompt, "agent")}
          streaming={streaming}
          followUpChips={followUpChips}
          onSelectFollowUp={(chip) => {
            if (chip === SCOPE_OVERRIDE_CHIP && scopeHeldPrompt) {
              const held = scopeHeldPrompt;
              setScopeHeldPrompt(null);
              // forceBuild is what makes this an override rather than a loop —
              // the held prompt still matches whatever the guard caught.
              void sendMessage(held, "build", undefined, { forceBuild: true });
              return;
            }
            if (chip === "Re-run full security scan") {
              onOpenPanel?.("security");
              void triggerAutoFix(
                `Re-run a full security scan and fix all ${securityIssueCount} security issue${securityIssueCount === 1 ? "" : "s"} in this project.`,
              );
              return;
            }
            setInput(chip);
            setTimeout(() => textareaRef.current?.focus(), 0);
          }}
          attachedImage={attachedImage}
          attachedImageName={attachedImageName}
          onRemoveAttachedImage={() => { setAttachedImage(null); setAttachedImageName(null); }}
          onAnnotateAttachedImage={() => setChatAnnotateOpen(true)}
          onAttachedImagePreset={(prompt) => {
            setInput(prompt);
            setTimeout(() => textareaRef.current?.focus(), 50);
          }}
          attachedFiles={attachedFiles}
          onRemoveAttachedFile={(index) => setAttachedFiles((prev) => prev.filter((_, i) => i !== index))}
          detectedUrl={detectedUrl}
          isScraping={isScraping}
          scrapedMeta={scrapedMeta}
          onDismissUrlScrape={() => {
            setDetectedUrl(null);
            setScrapedMeta(null);
            setIsScraping(false);
          }}
          onUrlQuickAction={(prompt) => {
            setInput(prompt);
            setTimeout(() => textareaRef.current?.focus(), 50);
          }}
          contextFiles={contextFiles}
          onRemoveContextFile={(id) => setContextFiles((prev) => prev.filter((cf) => cf.id !== id))}
          lineRefs={composerLineRefs}
          onRemoveLineRef={(raw) => setInput((prev) => removeLineRefFromInput(prev, raw))}
          onOpenLineRefAtLine={handleOpenLineRefAtLine}
          secretBanner={secretBanner}
          onDismissSecretBanner={() => setSecretBanner(null)}
          onOpenSecrets={() => onOpenPanel?.("cloud")}
        />

        {/* Above the card, not inside it. Lovable's composer card holds exactly
            two children and measures 100px; with these two in there ours
            measured 163. They are full-width notices, they were never part of
            the thing you type into, and out here they can be as tall as they
            need to be. */}
        {!isLocked && (
          <LovableSecurityIssuesBar
            issueCount={securityIssueCount}
            noCredits={noCredits}
            freeFixesRemaining={freeFixesRemaining}
            onViewIssues={() => onOpenPanel?.("security")}
            onFixAll={() => {
              void triggerAutoFix(
                `Fix all ${securityIssueCount} security issue${securityIssueCount === 1 ? "" : "s"} in this project. ` +
                  "Review findings (secrets, XSS, auth/RLS gaps, unsafe deps), apply the safest fix for each, and keep the app building.",
              );
            }}
          />
        )}
        {isLocked && <LovableLiveLockBanner />}

        <LovableChatInputCard isDragging={isDragging}>
          <LovableComposerInputArea
            textareaRef={textareaRef}
            input={input}
            onInputChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPasteText={handlePromptPaste}
            placeholder={composerPlaceholder}
            noCredits={noCredits}
            isLocked={isLocked}
            securityIssueCount={securityIssueCount}
            freeFixesRemaining={freeFixesRemaining}
            onOpenPanel={onOpenPanel}
            onViewSecurityIssues={() => onOpenPanel?.("security")}
            onFixAllSecurityIssues={() => {
              // Use the free Try-to-fix path (/api/ai/fix), not Editor Intelligence.
              void triggerAutoFix(
                `Fix all ${securityIssueCount} security issue${securityIssueCount === 1 ? "" : "s"} in this project. ` +
                  "Review findings (secrets, XSS, auth/RLS gaps, unsafe deps), apply the safest fix for each, and keep the app building.",
              );
            }}
            hasAttachments={!!attachedImage || attachedFiles.length > 0}
            contextFileCount={contextFiles.length}
            mentionOpen={mentionQuery !== null}
            isCrossProjectQuery={isCrossProjectQuery}
            mentionItems={mentionItems}
            mentionCursor={mentionCursor}
            onMentionSelect={insertMention}
            showSkillPicker={showSkillPicker}
            skills={[...(skills.custom ?? []), ...(skills.builtin ?? [])]}
            skillSearch={skillSearch}
            onSkillSearchChange={setSkillSearch}
            onSkillSelect={applySkill}
            onSkillPickerClose={() => {
              setShowSkillPicker(false);
              setSkillSearch("");
            }}
            showTemplates={showTemplates}
            slashSelectedKey={slashSelectedKey}
            onTemplateSkillSelect={applySkill}
            onTemplateSelect={(prompt) => {
              if (prompt === LOVABLE_PUBLISH_SLASH_KEY) void handlePublishFromChat();
              else insertTemplate(prompt);
            }}
            onExploreDesignDirections={() => openDesignDirections()}
            onTemplatesClose={() => setShowTemplates(false)}
            showSnippets={showSnippets}
            currentUserId={currentUserId}
            onSnippetInsert={(content) => {
              setInput((prev) => prev ? `${prev}\n${content}` : content);
            }}
            onSnippetsClose={() => setShowSnippets(false)}
            analyzeOpen={analyzeOpen}
            analyzeInstruction={analyzeInstruction}
            analyzeFile={analyzeFile}
            analyzeRunning={analyzeRunning}
            analyzeEnabled={analyzeEnabled}
            analyzeUnavailableReason={analyzeUnavailableReason}
            onAnalyzeInstructionChange={setAnalyzeInstruction}
            onAnalyzeFileSelect={setAnalyzeFile}
            onAnalyzeClose={() => setAnalyzeOpen(false)}
            onAnalyzeRun={() => void handleRunAnalyze()}
            onAnalyzeFileTooLarge={() => toast({ title: "File too large (max 20 MB)", variant: "destructive" })}
            saveSkillDraft={saveSkillDraft}
            savingSkill={savingSkill}
            onSaveSkillDraftChange={(d) => setSaveSkillDraft(d)}
            onSaveSkillClose={() => setSaveSkillDraft(null)}
            onSaveSkill={() => void handleSaveSkill()}
            showFilePicker={showFilePicker}
            files={files}
            contextFiles={contextFiles}
            filePickerSearch={filePickerSearch}
            maxContextFiles={MAX_CONTEXT_FILES}
            onFilePickerSearchChange={setFilePickerSearch}
            onFilePickerClose={() => {
              setShowFilePicker(false);
              setFilePickerSearch("");
            }}
            onToggleContextFile={(f) =>
              setContextFiles((prev) =>
                prev.some((cf) => cf.id === f.id) ? prev.filter((cf) => cf.id !== f.id) : [...prev, f],
              )
            }
            onClearContextFiles={() => setContextFiles([])}
            onScreenshot={() => window.dispatchEvent(new CustomEvent("lifemark-request-screenshot", { detail: { messageId: "manual" } }))}
            onAddReference={() => setShowFilePicker((v) => !v)}
            onAddSkill={() => setShowSkillPicker((v) => !v)}
            onAnalyzeData={() => {
              setAnalyzeOpen(true);
              void fetch("/api/ai/analyze/capabilities")
                .then((r) => (r.ok ? r.json() : null))
                .then((d) => {
                  if (!d) return;
                  setAnalyzeEnabled(d.analyzeEnabled !== false);
                  setAnalyzeUnavailableReason(
                    typeof d.reason === "string" ? d.reason : null,
                  );
                })
                .catch(() => {});
            }}
            onDesignDirections={() => openDesignDirections()}
            onAttach={() => fileInputRef.current?.click()}
            fileInputRef={fileInputRef}
            onImageAttach={handleImageAttach}
            isVisualEditActive={isVisualEditActive}
            onVisualEditToggle={onVisualEditToggle}
            onFocusPreview={onFocusPreview}
            onToggleTemplates={() => setShowTemplates((v) => !v)}
            mobileMode={mobileMode}
            onToggleMobileMode={() => persistMobileMode(!mobileMode)}
            mobileDisabled={noCredits || isLocked || streaming}
            mode={mode}
            clarifyFirst={clarifyFirst}
            showClarifyToggle={(mode === "build" || mode === "agent") && isGreenfieldProject(files)}
            onModeChange={onModeChange}
            onToggleClarify={() => setClarifyFirst((v) => !v)}
            multiAgent={multiAgent}
            onMultiAgentChange={setMultiAgent}
            modelManuallySelectedRef={modelManuallySelectedRef}
            selectedModel={selectedModel}
            onSelectModel={(model, manual) => {
              modelManuallySelectedRef.current = manual;
              setSelectedModel(model);
            }}
            autoModel={autoModel}
            activeModelLabel={activeModelLabel}
            onTranscript={(t) => setInput((prev) => prev + (prev ? " " : "") + t)}
            voiceModeRef={voiceModeRef}
            showFileGenPicker={showFileGenPicker}
            fileGenBusy={fileGenBusy}
            fileGenDisabled={!input.trim() || !!fileGenBusy || noCredits || isLocked || streaming}
            fileGenBinaryEnabled={analyzeEnabled}
            fileGenBinaryReason={analyzeUnavailableReason}
            showModelMenu={showModelMenu}
            onToggleModelMenu={() => setShowModelMenu((v) => !v)}
            onToggleFileGenPicker={() => setShowFileGenPicker((v) => !v)}
            onGenerateFile={(fmt) => void handleGenerateFile(fmt)}
            streaming={streaming}
            canSend={(!input.trim() && !attachedImage) ? false : !noCredits && !isLocked}
            canQueue={(!!input.trim() || !!attachedImage || attachedFiles.length > 0) && !noCredits && !isLocked}
            // Was hardcoded undefined, so the send-control tooltip could never
            // explain why queueing was unavailable.
            queueDisabledReason={
              noCredits
                ? "You're out of credits — top up to queue more messages."
                : isLocked
                  ? "This project is in Live mode; switch to Test to make changes."
                  : !input.trim() && !attachedImage && attachedFiles.length === 0
                    ? "Type a message first."
                    : undefined
            }
            onSend={() => void handleSend()}
            onStop={stopGeneration}
          />
        </LovableChatInputCard>
        <LovableComposerSharePreview projectId={project.id} className="mt-2 mb-0 mx-1" />
      </LovableChatComposerShell>
      </LovableComposerMobileSheet>

      <LovableChatModals
        annotateOpen={chatAnnotateOpen}
        attachedImage={attachedImage}
        onCloseAnnotate={() => setChatAnnotateOpen(false)}
        onSendAnnotate={(annotated, note) => {
          setAttachedImage(annotated);
          if (note?.trim()) setInput(note);
          setChatAnnotateOpen(false);
        }}
        designPreviewOpen={designPreviewOpen}
        pendingDesignPrompt={pendingDesignPrompt}
        projectId={project.id}
        fileCount={files.length}
        onDesignSelect={handleDesignPreviewSelect}
        onDesignSkip={handleDesignPreviewSkip}
        onDesignClose={() => {
          setDesignPreviewOpen(false);
          setPendingDesignPrompt(null);
          if (pendingDesignPrompt) setInput(pendingDesignPrompt);
        }}
      />
    </LovableChatPanelShell>
  );
}

// Memoized: ChatPanel is one of the three heaviest editor child components
// and re-renders on every EditorLayout state change (chat text, generation
// state, mobile pane, etc.) that has nothing to do with chat. React.memo
// skips its re-render when its own props are shallow-equal to the previous
// render — most of ChatPanel's callback/object props were stabilized in
// EditorLayout alongside this change so the memo comparison actually pays
// off, but this wrapper is safe (a no-op at worst) even for any prop that
// isn't yet reference-stable.
export const ChatPanel = React.memo(ChatPanelImpl);
