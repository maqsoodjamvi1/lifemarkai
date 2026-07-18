"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2, Sparkles,
  Copy, Check, AlertCircle,
  Wand2, ThumbsUp, ThumbsDown,
  Play, Pause,
  Brain, Download,
  X, Pin, PinOff, Minimize2, Square,
} from "lucide-react";
import { suggestFollowUps } from "@/lib/ai/follow-up-suggestions";
import { detectPastedSecret, redactSecret } from "@/lib/security/detect-secret";
import { CONNECTORS } from "./app-connectors-panel";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import type { ChatInputHandle } from "./chat-tiptap-input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { normalizeArrayResponse } from "@/lib/api/array-response";
import { createClient } from "@/lib/supabase/client";
import { createStreamedFilePathTracker } from "@/lib/ai/stream-file-paths";
import type { FileState } from "@/components/editor/diff-viewer";
import type { Project, ProjectFile, Message, Json } from "@/types/database";
import type { EditorMode } from "./editor-layout";
import type { GeneratedFile } from "./file-attachment-card";
import {
  LovableChatPanelShell,
  LovableChatComposerShell,
  LovableChatInputCard,
  LovableChatTimeline,
  LovableChatHeader,
  LovableChatHeaderStatus,
  LovableScrollToBottom,
  LovableStreamingFilesCard,
  LovableChatSearchBar,
  LovableThreadItem,
  LovableContextSummaryBanner,
  type LovableFileDiffEntry,
  type LovableFileGenResult,
  LOVABLE_PROMPT_TEMPLATES,
  type LovableMentionItem,
  mergeAgentStep,
  type AgentTaskStep,
  groupIntoThreads,
  getDisplayMessageContent,
  LovableChatStreamingFooter,
  LovableChatTimelineHeader,
  LovableComposerDock,
  LovableComposerPreInput,
  LovableComposerInputArea,
  LovableChatModals,
  useComposerDockController,
  useChatKeyboardShortcuts,
  useThreadMessageProps,
  extractStreamingReasoning,
  type ClarifySession,
  type LovableQueueItem,
  type LovableSecretBannerState,
} from "./lovable";
import { parseLineRefs, removeLineRefFromInput } from "@/lib/editor/parse-line-refs";
import { formatGuestCommentsForAi } from "@/lib/editor/format-guest-comments";
import { formatErrorsForHealing } from "@/lib/preview/preview-error-bridge";
import type { ChatSearchMode } from "@/lib/editor/search-chat-messages";
import type { LovableFileGenFormat } from "./lovable/composer-file-gen-picker";
import { useGuestCommentCount } from "@/hooks/use-guest-comment-count";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { AGENT_MIN_CREDITS } from "@/lib/ai/credit-cost";
import { findMissingPackages, buildInstallCommand, syncPackageJsonDeps } from "@/lib/ai/npm-auto-install";
import { classifyBuildIntent, type BuildIntent } from "@/lib/ai/build-intent";
import { buildDesignBrief, shouldOfferDesignPreviews, type DesignPreviewDirection } from "@/lib/ai/design-previews";
import type { AgentStep } from "@/lib/ai/agent";
import {
  buildProjectContextBlock,
  enrichFollowUpSuggestions,
  getEmptyProjectPrompts,
  getNoCreditsPrompts,
  getPreviewErrorPrompts,
  getSmartPlaceholder,
  inferProjectStage,
  resolvePromptMode,
  resolveSmartModel,
  looksLikeEditRequest,
  DEFAULT_CODING_MODEL,
} from "@/lib/ai/editor-intelligence";
import { isNoisePreviewError, type PreviewRuntimeError } from "@/lib/preview/preview-error-bridge";
import {
  getAutoFixAttempts,
  recordAutoFixAttempt,
  clearAutoFixLedger,
} from "@/lib/preview/autofix-ledger";
import { appendPreviewDiagnosis } from "@/lib/preview/diagnose-preview";
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
import type { SubagentStep } from "@/lib/ai/subagents";
import {
  initialBuildActivitySteps,
  applyBuildIntentLabel,
  onBuildFileProgress,
  finalizeBuildActivity,
  type BuildActivityStep,
} from "@/lib/ai/build-activity";
import { useAIStreamChat } from "@/hooks/use-ai-stream-chat";

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
  /** Show skeleton shimmer while messages are being fetched from the server */
  isMessagesLoading?: boolean;
  /** When true, older messages exist beyond the SSR batch */
  hasMoreMessages?: boolean;
}

interface ProjectPrivateContext {
  context_summary: string | null;
  context_summary_covers: number | null;
}

interface FileDiffEntry extends LovableFileDiffEntry {}

/** An item sitting in the prompt queue while AI is busy */
interface QueueItem extends LovableQueueItem {}

const MAX_AUTO_FIX_ATTEMPTS = 3;

function waitForPreviewSuccess(timeoutMs = 10_000): Promise<boolean> {
  return new Promise((resolve) => {
    const timer = window.setTimeout(() => {
      window.removeEventListener("message", onMsg);
      resolve(false);
    }, timeoutMs);
    function onMsg(e: MessageEvent) {
      const d = e.data as { source?: string; type?: string };
      if (d?.source === "lifemark-preview" && d?.type === "success") {
        window.clearTimeout(timer);
        window.removeEventListener("message", onMsg);
        resolve(true);
      }
    }
    window.addEventListener("message", onMsg);
  });
}


export function ChatPanel({
  project, messages, files, activeFile, mode, credits, starterPrompt,
  previewError, previewRuntimeErrors = [], pendingFixPrompt, pendingFileRef,
  onMessagesUpdate, onFilesUpdate, onCreditsUpdate,
  onAutoFixComplete, onPendingFixConsumed, onPendingFileRefConsumed,
  onStreamingChange, onModeChange, onApprovePlan,
  pendingBuildFromFile, onPendingBuildFromFileConsumed,
  isLocked = false, onOpenPanel, onFocusPreview, onProjectUpdate,
  onVisualEditToggle, isVisualEditActive = false,
  isMessagesLoading = false,
  hasMoreMessages: hasMoreMessagesInitial = false,
  securityIssueCount = 0,
}: ChatPanelProps) {
  const intelCtx = useMemo(
    () => ({
      fileCount: files.length,
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
    onFilesUpdate(updatedFiles, { replace: true });
    window.dispatchEvent(new CustomEvent("lifemark-refresh-preview", {
      detail: { files: updatedFiles, reason: "chat-files-refreshed" },
    }));
    return updatedFiles;
  }, [files, onFilesUpdate, project.id]);

  const contextualEmptyPrompts = useMemo(() => {
    if (credits <= 0) return getNoCreditsPrompts();
    if (previewError) return getPreviewErrorPrompts(previewError);
    return getEmptyProjectPrompts(inferProjectStage(files), project.framework);
  }, [files, previewError, credits, project.framework]);

  const [input, setInput] = useState("");
  // "Team" toggle: when on, Agent-mode sends run the full multi-agent Editor
  // Intelligence orchestrator (in the Intelligence panel) instead of the
  // single-model /api/ai/agent route. Only affects Agent mode.
  const [multiAgent, setMultiAgent] = useState(false);
  const [streaming, setStreaming] = useState(false);

  const smartPlaceholder = useMemo(
    () => getSmartPlaceholder({ ...intelCtx, streaming, isLocked }),
    [intelCtx, streaming, isLocked],
  );
  /** Tracks when the current build started so we know its duration for desktop notifications */
  const buildStartTimeRef = useRef<number | null>(null);
  /** Wrapper that also notifies the parent layout so PreviewPanel can show shimmer */
  function setStreamingWithCallback(value: boolean, fileCount?: number) {
    setStreaming(value);
    onStreamingChange?.(value, fileCount);
    if (value) {
      buildStartTimeRef.current = Date.now();
    } else if (buildStartTimeRef.current !== null) {
      const elapsed = Date.now() - buildStartTimeRef.current;
      buildStartTimeRef.current = null;
      // Fire a desktop notification if the build took >10s and permission is granted
      if (elapsed > 10_000 && typeof window !== "undefined" && "Notification" in window) {
        if (Notification.permission === "granted") {
          new Notification("Build complete ✓", {
            body: `Finished in ${Math.round(elapsed / 1000)}s — your app is ready to preview.`,
            icon: "/favicon.ico",
            tag: "lifemark-build",
          });
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
  const [attachedImage, setAttachedImage] = useState<string | null>(null);
  const [attachedImageName, setAttachedImageName] = useState<string | null>(null);
  const [chatAnnotateOpen, setChatAnnotateOpen] = useState(false);
  const [attachedText, setAttachedText] = useState<{ name: string; content: string } | null>(null);
  const [contextFiles, setContextFiles] = useState<ProjectFile[]>([]);
  const [showFilePicker, setShowFilePicker] = useState(false);
  const [filePickerSearch, setFilePickerSearch] = useState("");
  const MAX_CONTEXT_FILES = 5;
  const [isDragging, setIsDragging] = useState(false);
  // React Native / Expo framework toggle
  const [mobileMode, setMobileMode] = useState(false);
  // URL scraping ("Chat with URL") state
  const [detectedUrl, setDetectedUrl] = useState<string | null>(null);
  const [isScraping, setIsScraping] = useState(false);
  const [scrapedMeta, setScrapedMeta] = useState<{ title: string; description: string; ogImage: string; textContent: string } | null>(null);
  const [designPreviewOpen, setDesignPreviewOpen] = useState(false);
  const [pendingDesignPrompt, setPendingDesignPrompt] = useState<string | null>(null);
  const skipDesignPreviewOnceRef = useRef(false);
  /** True while overlay/manual heal is running — blocks competing auto-fix. */
  const healActiveRef = useRef(false);
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

    void (supabase as any)
      .from("project_private_context")
      .select("context_summary, context_summary_covers")
      .eq("project_id", project.id)
      .maybeSingle()
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
    void (supabase as any)
      .from("collaborators")
      .select("user_id, role, profiles(id, full_name, email)")
      .eq("project_id", project.id)
      .then(({ data }: { data: Array<{ user_id: string; role: string; profiles: { id: string; full_name: string | null; email: string } | null }> | null }) => {
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
  // Emoji reactions: { [messageId]: Set<emoji> }
  const [reactions, setReactions] = useState<Record<string, Set<string>>>({});
  function toggleReaction(messageId: string, emoji: string) {
    setReactions((prev) => {
      const set = new Set(prev[messageId] ?? []);
      if (set.has(emoji)) { set.delete(emoji); } else { set.add(emoji); }
      return { ...prev, [messageId]: set };
    });
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
  const [clarifyFirst, setClarifyFirst] = useState(false);
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [skills, setSkills] = useState<{ custom: Array<{id:string;name:string;description:string|null;prompt:string;icon:string;tags:string[];use_count:number}>; builtin: Array<{id:string;name:string;description:string|null;prompt:string;icon:string;tags:string[];}> }>({ custom: [], builtin: [] });
  const [skillsLoaded, setSkillsLoaded] = useState(false);
  const [skillSearch, setSkillSearch] = useState("");
  // Cross-project @mention
  const [crossProjects, setCrossProjects] = useState<Array<{id:string;name:string;slug:string}>>([]);
  const [crossProjectFiles, setCrossProjectFiles] = useState<Record<string,Array<{path:string}>>>({});
  const [crossProjectsLoaded, setCrossProjectsLoaded] = useState(false);
  const [activeClarifySession, setActiveClarifySession] = useState<ClarifySession | null>(null);
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
  const [queuePaused, setQueuePaused] = useState(false);
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
      void fetch(`/api/projects/${project.id}/preview-verify`, { method: "POST" })
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error("preview verify failed"))))
        .then((result) => setPreviewVerify(result))
        .catch(() => setPreviewVerify(null));
    }, delayMs);
  }, [project.id]);
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
  const [analyzeInstruction, setAnalyzeInstruction] = useState("");
  const [analyzeFile, setAnalyzeFile] = useState<{ name: string; base64: string; mimeType: string } | null>(null);
  const [analyzeRunning, setAnalyzeRunning] = useState(false);
  // "Generate as file" — standalone downloadable documents via /api/ai/generate-file.
  // Results render as download cards above the composer; they never touch project files.
  const [showFileGenPicker, setShowFileGenPicker] = useState(false);
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
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<ChatSearchMode>("keyword");
  const [searchLoading, setSearchLoading] = useState(false);
  const [searchHitIds, setSearchHitIds] = useState<Set<string> | null>(null);
  const [searchMatchCount, setSearchMatchCount] = useState(0);
  const [collapsedThreads, setCollapsedThreads] = useState<Set<number>>(new Set());
  const searchInputRef = useRef<HTMLInputElement>(null);
  const bookmarkKey = `lifemark-bookmarks-${project.id}`;
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try { return new Set(JSON.parse(localStorage.getItem(`lifemark-bookmarks-${project.id}`) ?? "[]")); }
    catch { return new Set(); }
  });
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [pinnedMsgId, setPinnedMsgId] = useState<string | null>(null);
  // Generation timing: track elapsed seconds per assistant message
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
          const supabase = createClient();
          return (supabase as any)
            .from("messages")
            .update({ metadata: { screenshot_url: preview_url } })
            .eq("id", messageId);
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

  function toggleBookmark(messageId: string) {
    setBookmarkedIds((prev) => {
      const next = new Set(prev);
      if (next.has(messageId)) { next.delete(messageId); } else { next.add(messageId); }
      try { localStorage.setItem(bookmarkKey, JSON.stringify([...next])); } catch {}
      return next;
    });
  }

  const [isAtBottom, setIsAtBottom] = useState(true);
  const abortControllerRef = useRef<AbortController | null>(null);
  /**
   * True while sendMessage is executing. `streaming` is React state, so two
   * sends triggered in the same frame (queue-drain effect + a click) can both
   * read the stale `false` and start concurrent streams. A ref flips
   * synchronously and closes that race.
   */
  const sendingRef = useRef(false);
  // Abort any in-flight stream when the panel unmounts so the response
  // reader is cancelled/released and no further work runs against an
  // unmounted component.
  useEffect(() => () => { abortControllerRef.current?.abort(); }, []);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [hasMoreMessages, setHasMoreMessages] = useState(hasMoreMessagesInitial);
  const loadingOlderRef = useRef(false);
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
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
  // Fetch current user id once for snippet ownership checks
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) setCurrentUserId(data.user.id);
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

  function stopGeneration() {
    abortControllerRef.current?.abort();
    setStreamingWithCallback(false);
    setStreamingContent("");
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
    // Supabase generated types have a known drift on the messages table update; suppress safely
    const db = createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (db.from("messages") as any).update({ rating: next ?? null }).eq("id", messageId);
  }

  async function handleRevertFile(messageId: string, diff: FileDiffEntry) {
    // Find the fileId from current files list
    const file = files.find((f) => f.path === diff.path);
    if (!file) return;
    try {
      await fetch(`/api/projects/${project.id}/files`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id, content: diff.oldContent }),
      });
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
      await fetch(`/api/projects/${project.id}/files`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileId: file.id, content: diff.newContent }),
      });
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
      const snapshots = await res.json();
      const snapshot = snapshots?.[0];
      if (!snapshot) throw new Error("No snapshot found");

      // Restore it
      const restoreRes = await fetch("/api/projects/snapshots/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId: snapshot.id, projectId: project.id }),
      });
      if (!restoreRes.ok) throw new Error("Restore failed");
      const { files: restoredFiles } = await restoreRes.json();
      if (restoredFiles) onFilesUpdate(restoredFiles);
      setCanUndo(false);
      toast({ title: "Undone", description: `Restored: ${snapshot.label ?? "previous state"}` });
    } catch {
      toast({ title: "Nothing to undo", variant: "destructive" });
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
      if (!res.ok) throw new Error(`Restore failed (${res.status})`);
      const { message: restoreMsg } = (await res.json()) as { message?: string };

      // Refresh files from DB (same pattern as triggerAutoFix)
      const supabase = createClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: updatedFiles } = await (supabase as any)
        .from("project_files")
        .select("*")
        .eq("project_id", project.id);
      if (updatedFiles) onFilesUpdate(updatedFiles);
      window.dispatchEvent(new CustomEvent("lifemark-refresh-preview", {
        detail: { files: updatedFiles ?? undefined, reason: "project-reverted" },
      }));
      window.dispatchEvent(new CustomEvent("lifemark-exit-version-preview"));
      toast({ title: "Project reverted", description: restoreMsg ?? "Files restored to the selected version." });
    } catch {
      toast({ title: "Failed to revert", variant: "destructive" });
    }
  }

  function handleImageAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast({ title: "Please attach an image file", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setAttachedImage(reader.result as string);
      setAttachedImageName(file.name);
    };
    reader.readAsDataURL(file);
    // Reset input so same file can be re-attached
    e.target.value = "";
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
    const file = e.dataTransfer.files[0];
    if (!file) return;
    const isImage = file.type.startsWith("image/");
    const codeExts = ["ts","tsx","js","jsx","css","html","json","md","txt","py","sql","sh","yaml","yml"];
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const isCode = codeExts.includes(ext);
    if (isImage) {
      const reader = new FileReader();
      reader.onload = () => {
        setAttachedImage(reader.result as string);
        setAttachedImageName(file.name);
        setAttachedText(null);
      };
      reader.readAsDataURL(file);
    } else if (isCode) {
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
        setAttachedText({ name: file.name, content });
        setAttachedImage(null);
      };
      reader.readAsText(file);
    } else {
      toast({ title: "Unsupported file type", description: "Drop an image or code file.", variant: "destructive" });
    }
  }

  function startEditMessage(msg: Message) {
    setEditingMessageId(msg.id);
    setEditInput(getDisplayMessageContent(msg));
  }

  async function submitEditedMessage() {
    if (!editingMessageId || !editInput.trim()) return;
    // Auto-snapshot the current state before truncating so the user can always revert
    void fetch("/api/projects/snapshots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projectId: project.id,
        label: `Before edit — ${new Date().toLocaleTimeString()}`,
      }),
    }).catch(() => {/* non-blocking — ignore errors */});
    // Truncate messages up to (not including) the edited message, then resend
    const idx = messages.findIndex((m) => m.id === editingMessageId);
    const truncated = idx >= 0 ? messages.slice(0, idx) : messages;
    setEditingMessageId(null);
    onMessagesUpdate(truncated);
    toast({
      title: "Branch saved",
      description: "Previous state saved to History → Branches.",
    });
    await sendMessage(editInput, undefined, truncated);
    setEditInput("");
  }

  async function handleRegenerate() {
    if (streaming) return;
    // Find the last assistant message index
    const lastAsstIdx = [...messages].map((m, i) => ({ m, i })).filter(({ m }) => m.role === "assistant").pop()?.i ?? -1;
    if (lastAsstIdx < 0) return;
    // Find the last user message before it
    const lastUserMsg = messages.slice(0, lastAsstIdx).filter((m) => m.role === "user").pop();
    if (!lastUserMsg) return;
    // Truncate to just before the last assistant message
    const truncated = messages.slice(0, lastAsstIdx);
    onMessagesUpdate(truncated);
    await sendMessage(getDisplayMessageContent(lastUserMsg), undefined, truncated);
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

  // Populate input when user clicks "Fix with AI" on the error banner in preview panel
  useEffect(() => {
    if (!pendingFixPrompt || credits <= 0) {
      if (pendingFixPrompt && credits <= 0) onPendingFixConsumed?.();
      return;
    }
    const prompt = pendingFixPrompt;
    onPendingFixConsumed?.();
    // Healing overlay sends structured prompt — one-click send (Lovable self-repair)
    if (prompt.startsWith("Fix the preview/runtime errors")) {
      healActiveRef.current = true;
      void sendMessage(appendPreviewDiagnosis(prompt, files), "build");
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
  useEffect(() => {
    if (
      !previewError ||
      isNoisePreviewError(previewError) ||
      previewError === lastFixedError ||
      autoFixing ||
      streaming ||
      healActiveRef.current ||
      autoFixAttempts >= MAX_AUTO_FIX_ATTEMPTS ||
      credits < 1
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

  // Auto-collapse all threads except the latest 2 whenever messages grow
  useEffect(() => {
    const threads = groupIntoThreads(messages);
    if (threads.length <= 2) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- derive collapsed thread defaults when new threads appear
    setCollapsedThreads((prev) => {
      const next = new Set(prev);
      for (let i = 0; i < threads.length - 2; i++) {
        if (!next.has(i)) next.add(i);
      }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages.length]);

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

  // Load older messages when scrolling near the top (Lovable long-thread parity).
  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const onScroll = () => {
      if (!hasMoreMessages || loadingOlderRef.current || messages.length === 0) return;
      if (el.scrollTop > 120) return;
      const oldest = messages[0];
      if (!oldest?.created_at) return;
      loadingOlderRef.current = true;
      setLoadingOlderMessages(true);
      const prevHeight = el.scrollHeight;
      void (async () => {
        try {
          const res = await fetch(
            `/api/projects/${project.id}/messages?before=${encodeURIComponent(oldest.created_at)}&limit=50`,
          );
          if (!res.ok) return;
          const data = await res.json() as { messages?: Message[]; hasMore?: boolean };
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
      })();
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [hasMoreMessages, messages, onMessagesUpdate, project.id]);

  // Follow new content (messages + streamed chunks), but ONLY while the user
  // is already at the bottom — isAtBottom flips false the moment they scroll
  // up, so streaming never fights their reading position.
  useEffect(() => {
    if (!isAtBottom) return;
    messagesEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages, streamingContent, streamingFiles, agentSteps, isAtBottom]);

  // Broadcast live agent steps for the floating Tasks sidebar (Lovable parity).
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("lifemark-live-tasks", {
        detail: { streaming, steps: agentSteps },
      }),
    );
  }, [streaming, agentSteps]);

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
      content: `🔧 **Auto-fixing error** (attempt ${autoFixAttempts + 1}/${MAX_AUTO_FIX_ATTEMPTS})\n\n\`\`\`\n${fixPayload.slice(0, 400)}\n\`\`\``,
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
        if (res.status === 423) {
          toast({
            title: "Project is Live — auto-fix blocked",
            description: "Switch to Test environment to apply fixes.",
            variant: "destructive",
          });
          onMessagesUpdate(messages);
          return;
        }
        throw new Error(`Fix API ${res.status}`);
      }

      const data = (await res.json()) as {
        files: Array<{ path: string; content: string }>;
        explanation: string;
        tokensUsed: number;
        free?: boolean;
      };

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
      }

      // Refresh files from DB
      const supabase = createClient();
      const { data: updatedFiles } = await (supabase as any)
        .from("project_files")
        .select("*")
        .eq("project_id", project.id);

      if (updatedFiles) onFilesUpdate(updatedFiles, { replace: true });
      // Show success message
      const successMsg: Message = {
        id: `autofix-done-${Date.now()}`,
        project_id: project.id,
        role: "assistant",
        content: `✅ **Auto-fix applied** — ${data.explanation ?? "Fixed the error, check the preview."}`,
        tokens_used: data.tokensUsed ?? null,
        model: DEFAULT_CODING_MODEL,
        mode: "build",
        metadata: null,
        rating: null,
        created_at: new Date().toISOString(),
      };
      onMessagesUpdate([...messagesWithFixing, successMsg]);
      window.dispatchEvent(new CustomEvent("lifemark-refresh-preview", {
        detail: { files: updatedFiles ?? undefined, reason: "auto-fix-applied" },
      }));
      const previewOk = await waitForPreviewSuccess(12_000);
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

  async function sendMessage(userMessage: string, overrideMode?: EditorMode, historyOverride?: Message[]) {
    if ((!userMessage.trim() && !attachedImage) || streaming || sendingRef.current) return;

    // The user is giving a new instruction, so the code is about to change. Past
    // auto-fix failures were about the OLD code — forget them, and let the fixer
    // have a fresh budget against whatever this build produces.
    clearAutoFixLedger(project.id);
    setAutoFixAttempts(0);

    const effectiveMode = resolvePromptMode(userMessage, intelCtx, overrideMode);
    const effectiveModel = modelManuallySelectedRef.current
      ? selectedModel
      : resolveSmartModel(effectiveMode, intelCtx, userMessage);

    // Multi-agent team mode: in Agent mode with the Team toggle on, run the full
    // Editor Intelligence orchestrator (lens debate + waves + durable run) in the
    // Intelligence panel instead of the single-model agent route. Bail before any
    // streaming setup so normal chat/plan/build/patch are untouched.
    if (effectiveMode === "agent" && multiAgent) {
      setInput("");
      onOpenPanel?.("intelligence");
      window.dispatchEvent(new CustomEvent("lifemark-intelligence-run", {
        detail: { goal: userMessage },
      }));
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
      return;
    }
    // Keep the mode chip in sync whenever intelligence upgrades Chat/Build → patch/agent
    // (otherwise the UI still says "Chat" while files are being written — or worse,
    // Chat stayed as Chat and only streamed prose with no file saves).
    if (effectiveMode !== mode) {
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
    sendingRef.current = true;
    setInput("");
    // Request desktop notification permission on first build (non-blocking)
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    setStreamingWithCallback(true, 0);
    genStartRef.current = Date.now();
    setStreamingContent("");
    setStreamingFiles([]);
    setPendingSkills([]);
    setSubagentSteps([]);
    setPreviewVerify(null);
    const imageToSend = attachedImage;
    const imageNameToSend = attachedImageName;
    setAttachedImage(null);
    setAttachedImageName(null);
    const textToSend = attachedText;
    setAttachedText(null);
    const contextFilesToSend = contextFiles;
    setContextFiles([]);
    // Capture + clear URL scrape state
    const scrapedMetaToSend = scrapedMeta;
    const detectedUrlToSend = detectedUrl;
    setDetectedUrl(null);
    setScrapedMeta(null);

    // Agent mode: initialise task step visibility
    if (effectiveMode === "agent") {
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

    // Auto-snapshot before AI modifies files (Build / Agent / Patch modes)
    if ((effectiveMode === "build" || effectiveMode === "agent" || effectiveMode === "patch") && files.length > 0) {
      fetch("/api/projects/snapshots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          label: `Before: ${userMessage.slice(0, 60)}${userMessage.length > 60 ? "…" : ""}`,
        }),
      }).catch(() => {}); // fire-and-forget
    }

    // Optimistically add user message
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
      metadata: null,
      rating: null,
      created_at: new Date().toISOString(),
    };
    const baseMessages = historyOverride ?? messages;
    onMessagesUpdate([...baseMessages, tempUserMsg]);

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
      const mentionedPaths = [...userMessageFinal.matchAll(/@([\w./\-]+)/g)].map((m) => m[1]);
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

      // Extract cross-project references: @ProjectName/path/to/file
      const crossProjectRefs = crossProjects.flatMap((p) => {
        const prefix = p.name + "/";
        return mentionedPaths
          .filter((mp) => mp.startsWith(prefix))
          .map((mp) => ({ projectId: p.id, projectName: p.name, filePath: mp.slice(prefix.length) }));
      });
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
          }),
        });

        if (!res.ok || !res.body) {
          if (res.status === 402) {
            toast({
              title: "Insufficient credits",
              description: "Agent mode needs at least 5 credits.",
              variant: "destructive",
            });
            try {
              const cr = await fetch("/api/billing/credits");
              if (cr.ok) {
                const { credits: newCredits } = (await cr.json()) as { credits?: number };
                if (typeof newCredits === "number") onCreditsUpdate(newCredits);
              }
            } catch {}
            onMessagesUpdate(baseMessages);
            return;
          }
          throw new Error(`Agent API error: ${res.status}`);
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
                setTimeout(() => setAgentSteps([]), 1800);

                const supabase = createClient();
                const { data: updatedFiles } = await (supabase as any)
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
                    window.dispatchEvent(new CustomEvent("lifemark-refresh-preview", {
                      detail: { files: updatedFiles, reason: "agent-files-updated" },
                    }));
                  }
                  if (healActiveRef.current) {
                    void (async () => {
                      const previewOk = await waitForPreviewSuccess(12_000);
                      healActiveRef.current = false;
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
                      if (sync) {
                        try {
                          const supabase = createClient();
                          await (supabase as any).from("project_files").upsert({
                            project_id: project.id,
                            path: "package.json",
                            content: sync.updated,
                            language: "json",
                          }, { onConflict: "project_id,path" });
                          const { data: refreshed } = await (supabase as any)
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

                const { data: syncedMessages } = await (supabase as any)
                  .from("messages")
                  .select("*")
                  .eq("project_id", project.id)
                  .order("created_at", { ascending: true });
                if (syncedMessages) {
                  onMessagesUpdate(syncedMessages);
                }

                runQuickPreviewVerify();

                const captureId = syncedMessages?.at(-1)?.id ?? `assistant-${Date.now()}`;
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent("lifemark-request-screenshot", { detail: { messageId: captureId } }));
                }, 2500);
              }

              if (data.error) {
                // Persist the failure in-chat (a toast alone vanishes in 5s and
                // the thread looks silently ignored — see the chat-flow handler).
                const rawErr = String(data.error);
                const agentErrMsg: Message = {
                  id: `agent-error-${Date.now()}`,
                  project_id: project.id,
                  role: "assistant",
                  content: /402|insufficient credits/i.test(rawErr)
                    ? "⚠️ **The AI provider account is out of credits** — the agent run failed before making changes. Top up at https://openrouter.ai/settings/credits and retry."
                    : `⚠️ **Agent run failed** — no changes were made:\n\n\`\`\`\n${rawErr.slice(0, 400)}\n\`\`\``,
                  tokens_used: null,
                  model: null,
                  mode: effectiveMode,
                  metadata: null,
                  rating: null,
                  created_at: new Date().toISOString(),
                };
                onMessagesUpdate([...baseMessages, agentErrMsg]);
                toast({ title: "Agent Error", description: rawErr.slice(0, 200), variant: "destructive" });
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
          ...(modelManuallySelectedRef.current ? { model: effectiveModel } : {}),
          modelManuallySelected: modelManuallySelectedRef.current,
          framework: mobileMode ? "react-native" : (project.framework ?? "web"),
          clarifyFirst: effectiveMode === "build" && clarifyFirst && files.length === 0,
          ...(effectiveMode === "build" && designTemplateId ? { templateId: designTemplateId } : {}),
          // If @mentions present, only send those files for context (saves tokens + focuses AI)
          files: mentionedFilesForAI
            ? mentionedFilesForAI
            : files.map((f) => ({ path: f.path, content: f.content })),
          ...(imageToSend ? { imageBase64: imageToSend, imageFileName: imageNameToSend } : {}),
          ...(textToSend
            ? {
                attachedFile: {
                  name: textToSend.name,
                  content: textToSend.content.slice(0, 20000),
                },
              }
            : {}),
        }),
      });

      if (!res.ok || !res.body) {
        if (res.status === 402) {
          toast({
            title: "Insufficient credits",
            description: "Add credits or upgrade your plan to continue building.",
            variant: "destructive",
          });
          onCreditsUpdate(0);
          onMessagesUpdate(baseMessages);
        }
        // Live-environment lock (migration 046): the route refuses code writes
        // on Live. Without THIS branch the user only saw a cryptic
        // "API error: 423" toast and kept re-asking ("nothing is changed").
        // Surface it as a persistent in-chat message with the fix.
        if (res.status === 423) {
          const lockedMsg: Message = {
            id: `env-locked-${Date.now()}`,
            project_id: project.id,
            role: "assistant",
            content:
              "🔒 **This project is in Live mode — edits are locked.**\n\n" +
              "Live protects your published app from accidental changes, so Build/Agent requests are rejected (nothing was changed and no credits were spent).\n\n" +
              "**To make changes:** switch the environment to **Test** (the Test / Live toggle in the top bar), build and preview there, then promote back to Live when you're happy.",
            tokens_used: null,
            model: null,
            mode: effectiveMode,
            metadata: null,
            rating: null,
            created_at: new Date().toISOString(),
          };
          onMessagesUpdate([...baseMessages, lockedMsg]);
          toast({
            title: "Project is Live — changes locked",
            description: "Switch to the Test environment (top bar) to edit.",
            variant: "destructive",
          });
          return;
        }
        throw new Error(`API error: ${res.status}`);
      }

      let accumulated = "";
      const streamedPathTracker = createStreamedFilePathTracker();
      let hasPendingStreamedPathUpdate = false;
      const streamingAssistantId = `assistant-${Date.now()}`;
      let clarifyExited = false;
      // Local mirror of pendingSkills — the async stream handlers below close
      // over the pre-send render, so reading `pendingSkills` state on data.done
      // would always be stale (empty, or worse, the PREVIOUS message's skills).
      let attachedSkills: Array<{ id: string; name: string; reason?: string }> = [];

      const processChatStreamEvent = async (data: Record<string, unknown>) => {
        try {
          if (data.chunk) return;

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
                description: `Updated ${data.count} file${(data.count as number) === 1 ? "" : "s"}. Preview is refreshing…`,
              });
              void refreshProjectFiles().catch(() => {
                toast({
                  title: "Refresh needed",
                  description: "The edit saved, but the preview did not refresh automatically. Use the preview refresh button.",
                  variant: "destructive",
                });
              });
            }
          }

          if (data.status === "patches_failed") {
            toast({
              title: "Edit not applied",
              description:
                (data.message as string | undefined) ??
                "The patch could not be applied. Try Quick Edit or rephrase.",
              variant: "destructive",
            });
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

          if (data.clarifying_questions) {
            setActiveClarifySession({
              originalPrompt: (typeof data.originalPrompt === "string" ? data.originalPrompt : userMessage),
              questions: (data.clarifying_questions as Array<{ id: string; question: string; type?: string; options?: string[] }>).map((q) => ({
                id: q.id ?? `q-${Math.random()}`,
                question: q.question,
                type: (q.type as "text" | "choice") ?? "text",
                options: q.options,
                answer: q.options?.[0] ?? "",
              })),
            });
            setStreamingWithCallback(false);
            setStreamingContent("");
            setStreamingFiles([]);
            onMessagesUpdate(baseMessages);
            clarifyExited = true;
            controller.abort();
            return;
          }

          if (data.done) {
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
                applyBuildSteps([]);
                setMessageBuildActivity((prev) => ({ ...prev, [assistantId]: completedBuildActivity! }));
              }
              setBuildStatus(null);
              // Update credits
              if (typeof data.creditsUsed === "number") {
                onCreditsUpdate(credits - data.creditsUsed);
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
              if ((data.files && (data.files as unknown[]).length > 0) || haveStreamedFiles || reportedFileCount > 0 || filesChanged) {
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

                  onFilesUpdate(updatedFiles);
                  window.dispatchEvent(new CustomEvent("lifemark-refresh-preview", {
                    detail: { files: updatedFiles, reason: "agent-files-updated" },
                  }));
                  if (healActiveRef.current) {
                    void (async () => {
                      const previewOk = await waitForPreviewSuccess(12_000);
                      healActiveRef.current = false;
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
                      const sync = syncPackageJsonDeps(updatedFiles as Array<{ path: string; content: string }>, pkgJsonFile.content);
                      if (sync) {
                        try {
                          const supabase = createClient();
                          await (supabase as any).from("project_files").upsert({
                            project_id: project.id,
                            path: "package.json",
                            content: sync.updated,
                            language: "json",
                          }, { onConflict: "project_id,path" });
                          const { data: refreshed } = await (supabase as any)
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
                  return Object.keys(meta).length > 0 ? (meta as unknown as Json) : null;
                })(),
                rating: null,
                created_at: new Date().toISOString(),
              };
              onMessagesUpdate([...baseMessages, tempUserMsg, assistantMsg]);
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
                        {
                          role: "user",
                          content: tempUserMsg.content,
                          mode: effectiveMode === "patch" ? "build" : effectiveMode,
                        },
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
                      onMessagesUpdate([
                        ...baseMessages,
                        tempUserMsg,
                        { ...assistantMsg, id: persisted.assistantMessageId },
                      ]);
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

              // Request preview screenshot for build/agent messages (2.5 s delay for React to re-render)
              if (effectiveMode === "build" || effectiveMode === "patch") {
                const captureId = assistantId;
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent("lifemark-request-screenshot", { detail: { messageId: captureId } }));
                }, 2500);
              }

              // Generate follow-up suggestion chips
              const filePaths = (data.files as Array<{ path: string }> | undefined)?.map((f) => f.path)
                ?? Array.from(serverStreamedPathsRef.current);
              const chips = enrichFollowUpSuggestions(
                generateSuggestions(userMessage, accumulated, filePaths),
                inferProjectStage(files),
                filePaths,
              );
              setSuggestions((prev) => ({ ...prev, [assistantId]: chips }));

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
              } else if ((["build", "patch", "agent"] as string[]).includes(effectiveMode)) {
                runQuickPreviewVerify();
              }

              // Multi-role test chips (Lovable best-practice: recheck multi-role behavior after big edits)
              const roleChips = buildRoleTestChips(filePaths);
              if (roleChips.length > 0) {
                setRoleTestChips((prev) => ({ ...prev, [assistantId]: roleChips }));
              }
            }

            if (data.error) {
              // A 5s toast alone is easy to miss — the thread then looks like
              // the AI silently ignored the request (this hid a drained
              // OpenRouter balance for days: every build 402'd invisibly).
              // Persist a readable in-chat error with the actual cause.
              const raw = String(data.error);
              const friendly = /402|insufficient credits/i.test(raw)
                ? "**The AI provider account is out of credits.** Every model call is failing, so no changes can be generated.\n\nFix: top up the OpenRouter balance at https://openrouter.ai/settings/credits — then resend your request."
                : /429|rate limit/i.test(raw)
                  ? "**The AI provider is rate-limiting requests.** Wait a minute and resend."
                  : `**The AI provider returned an error**, so no changes were made:\n\n\`\`\`\n${raw.slice(0, 400)}\n\`\`\``;
              const errMsg: Message = {
                id: `ai-error-${Date.now()}`,
                project_id: project.id,
                role: "assistant",
                content: `⚠️ ${friendly}`,
                tokens_used: null,
                model: null,
                mode: effectiveMode,
                metadata: null,
                rating: null,
                created_at: new Date().toISOString(),
              };
              onMessagesUpdate([...baseMessages, errMsg]);
              toast({ title: "AI Error", description: raw.slice(0, 200), variant: "destructive" });
            }
          } catch {}
        };

      await consumeAIStream(res, {
        signal: controller.signal,
        applyFileUpdates: (["build", "agent", "patch"] as EditorMode[]).includes(effectiveMode),
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
          onEvent: (data) => { void processChatStreamEvent(data); },
        },
      });

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
      if (streamFlushTimer !== null) {
        clearTimeout(streamFlushTimer);
        streamFlushTimer = null;
      }
      setStreamingWithCallback(false);
      setStreamingContent("");
      setStreamingFiles([]);
      setBuildStatus(null);
      setSubagentSteps([]);
      setPreviewVerify(null);
      // buildActivitySteps cleared in data.done; completed steps live on the assistant message
    }
  }

  async function handleSend() {
    if (isLocked) return;
    let text = input.trim();
    if (!text && !attachedImage) return;

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
    if (attachedText) {
      const attachmentSecret = detectPromptSecret(attachedText.content);
      if (attachmentSecret) {
        toast({
          title: "Attached file contains a secret-looking value",
          description: `Detected ${attachmentSecret.label}. Remove the secret before sending it to AI.`,
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
      // AI is busy — add to queue instead of blocking
      if (attachedImage || attachedText) {
        toast({
          title: "Attachments cannot be queued",
          description: "Wait for the current run to finish, or remove the attachment and queue a text follow-up.",
          variant: "destructive",
        });
        return;
      }
      setPromptQueue((prev) => [...prev, { id: `q-${Date.now()}`, text, repeat: 1, remaining: 1 }]);
      setInput("");
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
    setShowFileGenPicker(false);
    setFileGenBusy(format);
    const isBinary = format === "pdf" || format === "xlsx" || format === "pptx";
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

  function handleDesignPreviewSelect(direction: DesignPreviewDirection) {
    const base = pendingDesignPrompt;
    setDesignPreviewOpen(false);
    setPendingDesignPrompt(null);
    if (!base) return;
    void sendMessage(`${base}\n\n${buildDesignBrief(direction)}`);
  }

  function handleDesignPreviewSkip() {
    const base = pendingDesignPrompt;
    setDesignPreviewOpen(false);
    setPendingDesignPrompt(null);
    skipDesignPreviewOnceRef.current = true;
    if (base) void sendMessage(base);
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
    void sendMessage(next.text);
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
            setAttachedText({ name: attachment.name, content: attachment.content });
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
      toast({
        title: "Secret-looking paste blocked",
        description: `Detected ${secret.label}. Paste as NAME=value so LifemarkAI can save it to Secrets Vault.`,
        variant: "destructive",
      });
      return true;
    }

    if (!shouldAttachLongPaste(text)) return false;

    const attachment = createLongPasteAttachment(text);
    setAttachedText({ name: attachment.name, content: attachment.content });
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
    setInput(val);
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
        if (crossProjectQuery.includes("/") || filesForProject.length > 0) {
          return filesForProject
            .filter((f) => !crossProjectQuery || f.path.toLowerCase().includes(crossProjectQuery.toLowerCase()) || nameMatch)
            .slice(0, 4)
            .map((f): MentionItem => ({ kind: "xproject", projectName: p.name, projectId: p.id, filePath: f.path }));
        }
        // No files loaded yet — show the project itself as a clickable item to load files
        return nameMatch ? [{ kind: "xproject" as const, projectName: p.name, projectId: p.id, filePath: "" }] : [];
      }).slice(0, 6)
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
          ...CONNECTORS
            .filter((c) =>
              mentionQuery.length > 0 &&
              (c.name.toLowerCase().includes(mentionQuery.toLowerCase()) ||
               c.id.toLowerCase().includes(mentionQuery.toLowerCase())),
            )
            .slice(0, 4)
            .map((c): MentionItem => ({ kind: "connector", id: c.id, name: c.name, emoji: c.emoji })),
          // Hint to trigger cross-project mode
          ...(!mentionQuery || "project".startsWith(mentionQuery.toLowerCase()) ? [{ kind: "xproject" as const, projectName: "Other project…", projectId: "", filePath: "" }] : []),
        ]
    : [];

  function insertMention(item: MentionItem | string) {
    // Handle cross-project project node — load files and switch query
    if (typeof item !== "string" && item.kind === "xproject") {
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

  const visibleMessages = useMemo(
    () => messages.map((m) => ({ ...m, content: getDisplayMessageContent(m) })),
    [messages],
  );

  // Debounced message search (keyword + semantic via API).
  useEffect(() => {
    const q = searchQuery.trim();
    if (!q) {
      setSearchHitIds(null);
      setSearchMatchCount(0);
      setSearchLoading(false);
      return;
    }
    setSearchLoading(true);
    const timer = window.setTimeout(async () => {
      try {
        const res = await fetch(
          `/api/projects/${project.id}/messages/search?q=${encodeURIComponent(q)}&mode=${searchMode}`,
        );
        const data = (await res.json()) as { hits?: Array<{ id: string }> };
        const ids = new Set((data.hits ?? []).map((h) => h.id));
        setSearchHitIds(ids);
        setSearchMatchCount(ids.size);
      } catch {
        setSearchHitIds(null);
        setSearchMatchCount(0);
      } finally {
        setSearchLoading(false);
      }
    }, 320);
    return () => window.clearTimeout(timer);
  }, [searchQuery, searchMode, project.id]);

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
    if (!latestSnapshotMessageId) return [];
    let lastPrompt = "";
    const buildIdx = messages.findIndex((m) => m.id === latestSnapshotMessageId);
    for (let i = buildIdx; i >= 0; i--) {
      if (messages[i]?.role === "user") { lastPrompt = messages[i].content; break; }
    }
    return suggestFollowUps(lastPrompt, files.map((f) => f.path), 4);
  }, [latestSnapshotMessageId, messages, files]);

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

  const showPublishBanner = useMemo(
    () =>
      !publishBannerDismissed &&
      !streaming &&
      !previewError &&
      !isLocked &&
      files.length > 0 &&
      !!latestSnapshotMessageId,
    [publishBannerDismissed, streaming, previewError, isLocked, files.length, latestSnapshotMessageId],
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

  async function copyMessage(content: string, id: string) {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleClearChat() {
    if (!window.confirm("Clear this conversation?")) return;
    try {
      await fetch(`/api/projects/${project.id}/messages`, { method: "DELETE" });
    } catch {
      // best-effort
    }
    onMessagesUpdate([]);
    toast({ title: "Conversation cleared" });
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
    const blob = new Blob([lines.join("\n")], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${project.name.replace(/\s+/g, "-").toLowerCase()}-chat.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ description: "Chat exported ✓" });
  }

  // ⌘⇧K — clear chat; ⌘F — search; Alt+P — toggle Plan/Build; Esc — stop generation
  useChatKeyboardShortcuts({
    mode,
    streaming,
    onModeChange,
    onClearChat: () => void handleClearChat(),
    onSearchShortcut: () => {
      setShowSearch((v) => {
        if (!v) setTimeout(() => searchInputRef.current?.focus(), 50);
        return !v;
      });
    },
    onStopGeneration: stopGeneration,
  });

  const noCredits = credits <= 0;

  // Hoisted out of the message map — the previous inline
  // `[...messages].filter().pop()` ran once per assistant row per render
  // (O(n²) over the conversation).
  const lastAssistantMsgId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === "assistant") return messages[i].id;
    }
    return null;
  }, [messages]);

  const chatThreads = useMemo(() => {
    const filtered = showBookmarks
      ? visibleMessages.filter((m) => bookmarkedIds.has(m.id))
      : searchQuery && searchHitIds
        ? visibleMessages.filter((m) => searchHitIds.has(m.id))
        : searchQuery
          ? visibleMessages.filter((m) =>
              m.content.toLowerCase().includes(searchQuery.toLowerCase()),
            )
          : visibleMessages;
    return groupIntoThreads(filtered);
  }, [visibleMessages, showBookmarks, bookmarkedIds, searchQuery, searchHitIds]);

  const getMessageProps = useThreadMessageProps({
    searchQuery,
    streaming,
    showBookmarks,
    lastAssistantMsgId,
    copiedId,
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
    suggestions,
    roleTestChips,
    approvedSteps,
    fileStates,
    afterSnapshotByMessageId,
    latestSnapshotMessageId,
    visibleMessages,
    onCopy: copyMessage,
    onStartEdit: startEditMessage,
    onTogglePin: (msgId) => setPinnedMsgId((prev) => (prev === msgId ? null : msgId)),
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
    onAcceptFile: (msgId, path) =>
      setFileStates((prev) => ({
        ...prev,
        [msgId]: { ...(prev[msgId] ?? {}), [path]: "accepted" },
      })),
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
      const framed = `Generate browser tests (Playwright-style) that validate the recent changes for the ${role} role specifically. Cover: 1) login/auth scenarios for ${role}, 2) which routes ${role} can/cannot reach, 3) UI elements that should be visible/hidden for ${role}, 4) any role-specific actions. After writing the tests, summarize what to run them against.`;
      void sendMessage(framed);
    },
    onOpenTestingPanel: () => onOpenPanel?.("testing"),
    onSaveAnalyzeFile: saveGeneratedFileToProject,
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
  });

  return (
    <LovableChatPanelShell
      // Lift the chat panel above the on-screen keyboard on mobile. inset is 0
      // on desktop, ~250-300px on iOS/Android when the keyboard is up. The
      // padding-bottom approach (vs. translateY) preserves scroll position
      // and keeps the most-recent messages visible.
      style={{ paddingBottom: keyboardInset }}
    >
      <LovableChatHeader
        mode={mode}
        queueCount={promptQueue.length}
        queuePaused={queuePaused}
        creditLabel={`${mode === "build" || mode === "agent" ? "2" : "1"} credit${mode === "patch" ? " · patch" : ""} / msg`}
        hasMessages={visibleMessages.length > 0}
        showSearch={showSearch}
        showBookmarks={showBookmarks}
        bookmarkCount={bookmarkedIds.size}
        allCodeBlocksCollapsed={allCodeBlocksCollapsed}
        copiedAll={copiedAll}
        onExportMarkdown={exportChatAsMarkdown}
        onCopyAll={async () => {
          const text = visibleMessages.map((m) => `${m.role === "user" ? "You" : "AI"}: ${m.content}`).join("\n\n");
          await navigator.clipboard.writeText(text);
          setCopiedAll(true);
          setTimeout(() => setCopiedAll(false), 2000);
        }}
        onClearChat={() => void handleClearChat()}
        onToggleSearch={() => {
          setShowSearch((v) => {
            if (!v) setTimeout(() => searchInputRef.current?.focus(), 50);
            return !v;
          });
        }}
        onToggleBookmarks={() => setShowBookmarks((v) => !v)}
        onToggleCodeBlocks={() => {
          const next = !allCodeBlocksCollapsed;
          setAllCodeBlocksCollapsed(next);
          window.dispatchEvent(new CustomEvent("chat-codeblock-set-all", { detail: { collapsed: next } }));
        }}
      />

      <LovableChatHeaderStatus />

      <AnimatePresence>
        {showSearch && (
          <LovableChatSearchBar
            ref={searchInputRef}
            query={searchQuery}
            mode={searchMode}
            loading={searchLoading}
            matchCount={searchMatchCount}
            onQueryChange={(value) => {
              setSearchQuery(value);
              if (value.trim()) {
                scrollContainerRef.current?.scrollTo({ top: 0 });
              }
            }}
            onModeChange={setSearchMode}
            onClose={() => {
              setShowSearch(false);
              setSearchQuery("");
              setSearchHitIds(null);
              setSearchMatchCount(0);
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
        projectId={project.id}
        scrollRef={scrollContainerRef}
        items={chatThreads}
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
            pinnedMsgId={pinnedMsgId}
            visibleMessages={visibleMessages}
            onUnpin={() => setPinnedMsgId(null)}
            showBookmarks={showBookmarks}
            bookmarkCount={bookmarkedIds.size}
          />
        }
        renderItem={(thread, threadIdx) => (
          <LovableThreadItem
            key={thread[0]?.id ?? `thread-${threadIdx}`}
            thread={thread}
            threadIdx={threadIdx}
            searchQuery={searchQuery}
            collapsed={!searchQuery && collapsedThreads.has(threadIdx)}
            onToggleCollapse={() =>
              setCollapsedThreads((prev) => {
                const n = new Set(prev);
                if (n.has(threadIdx)) n.delete(threadIdx);
                else n.add(threadIdx);
                return n;
              })
            }
            getMessageProps={getMessageProps}
          />
        )}
        footer={
          <LovableChatStreamingFooter
            streaming={streaming}
            thoughtSeconds={thoughtSeconds}
            reasoningText={streamingReasoning}
            streamingContent={streamingContent}
            streamingFiles={streamingFiles}
            pendingSkills={pendingSkills}
            agentSteps={agentSteps}
            subagentSteps={subagentSteps}
            previewVerify={previewVerify}
            buildActivitySteps={buildActivitySteps}
            mode={mode}
            buildStatus={buildStatus}
            postBuildStatus={postBuildStatus}
            messagesEndRef={messagesEndRef}
          />
        }
      />

      <LovableScrollToBottom
        visible={!isAtBottom}
        onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}
      />
      </div>{/* end messages wrapper */}

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

      {/* ── Lovable-style input area ── */}
      <LovableChatComposerShell
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
          attachedText={attachedText}
          onRemoveAttachedText={() => setAttachedText(null)}
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
          fileInputRef={fileInputRef}
          onImageAttach={handleImageAttach}
          contextFiles={contextFiles}
          onRemoveContextFile={(id) => setContextFiles((prev) => prev.filter((cf) => cf.id !== id))}
          lineRefs={composerLineRefs}
          onRemoveLineRef={(raw) => setInput((prev) => removeLineRefFromInput(prev, raw))}
          onOpenLineRefAtLine={handleOpenLineRefAtLine}
          secretBanner={secretBanner}
          onDismissSecretBanner={() => setSecretBanner(null)}
          onOpenSecrets={() => onOpenPanel?.("secrets")}
        />

        <LovableChatInputCard>
          <LovableComposerInputArea
            textareaRef={textareaRef}
            input={input}
            onInputChange={handleInputChange}
            onKeyDown={handleKeyDown}
            onPasteText={handlePromptPaste}
            placeholder={smartPlaceholder}
            noCredits={noCredits}
            isLocked={isLocked}
            securityIssueCount={securityIssueCount}
            onOpenPanel={onOpenPanel}
            onViewSecurityIssues={() => onOpenPanel?.("security")}
            onFixAllSecurityIssues={() => {
              onOpenPanel?.("intelligence");
              window.dispatchEvent(new CustomEvent("lifemark-intelligence-run", {
                detail: {
                  goal: "Fix all security issues in this project. Review every finding, apply the safest fix for each, and verify the app still builds.",
                },
              }));
            }}
            hasAttachments={!!attachedImage || !!attachedText}
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
            onTemplateSelect={insertTemplate}
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
            onAnalyzeData={() => setAnalyzeOpen(true)}
            onAttach={() => fileInputRef.current?.click()}
            isVisualEditActive={isVisualEditActive}
            onVisualEditToggle={onVisualEditToggle}
            onFocusPreview={onFocusPreview}
            onToggleTemplates={() => setShowTemplates((v) => !v)}
            mobileMode={mobileMode}
            onToggleMobileMode={() => setMobileMode((v) => !v)}
            mobileDisabled={noCredits || isLocked || streaming}
            mode={mode}
            clarifyFirst={clarifyFirst}
            showClarifyToggle={(mode === "build" || mode === "agent") && files.length === 0}
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
            showFileGenPicker={showFileGenPicker}
            fileGenBusy={fileGenBusy}
            fileGenDisabled={!input.trim() || !!fileGenBusy || noCredits || isLocked || streaming}
            onToggleFileGenPicker={() => setShowFileGenPicker((v) => !v)}
            onGenerateFile={(fmt) => void handleGenerateFile(fmt)}
            streaming={streaming}
            canSend={(!input.trim() && !attachedImage) ? false : !noCredits && !isLocked}
            canQueue={!!input.trim() && !noCredits && !isLocked && !attachedImage && !attachedText}
            queueDisabledReason={attachedImage || attachedText ? "Remove attachments before queueing a follow-up" : undefined}
            onSend={() => void handleSend()}
            onStop={stopGeneration}
          />
        </LovableChatInputCard>
      </LovableChatComposerShell>

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
