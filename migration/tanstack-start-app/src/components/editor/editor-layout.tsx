
import { useState,useCallback,useEffect,useRef,useMemo } from "react";
import { useNavigate } from "@tanstack/react-router";
import { countFindings,staticScan } from "@/lib/security/static-scan";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { useFaviconStatus } from "@/hooks/use-favicon-status";
import dynamic from "@/lib/lazy-component";
import { importWithRetry } from "@/lib/import-with-retry";
import { PanelGroup,Panel,PanelResizeHandle,type ImperativePanelHandle } from "react-resizable-panels";
import { EditorTopBar } from "./editor-top-bar";
import { LovableFilesViewPane } from "./lovable/files-view-pane";
import { LovableLiveTasksDock } from "./lovable/live-tasks-dock";
import { EditorPaymentBanner } from "./editor-payment-banner";
import {
LovableToolsOverlay,
LovableOverlayHeader,
isLovableToolPanel,
} from "./lovable-tools-overlay";
import { FileToAppDropZone } from "./file-to-app-drop-zone";
import { useShortcutsModal } from "@/hooks/use-shortcuts-modal";
import type { CommandPaletteActions } from "@/components/command-palette";
import { useRecordProjectVisit } from "@/hooks/use-recent-projects";
import type { Project,ProjectFile,Message,Profile } from "@/types/database";
import type { PreviewErrorReport,PreviewRuntimeError } from "@/lib/preview/preview-error-bridge";
import { saveApprovedPlan } from "@/lib/editor/save-approved-plan";
import { useToast } from "@/hooks/use-toast";
import {
pickActiveFileAfterUpdate,
resolvePromptMode,
shouldFocusPreviewAfterGeneration
} from "@/lib/ai/editor-intelligence";
import { countUserAuthoredFiles } from "@/lib/ai/scaffold-files";

const EMPTY_PREVIEW_ERRORS: PreviewRuntimeError[] = [];

const CommandPalette = dynamic(
  importWithRetry(() => import("@/components/command-palette").then((m) => m.CommandPalette)),
  { ssr: false }
);

const HistoryPanel = dynamic(
  importWithRetry(() => import("./history-panel").then((m) => m.HistoryPanel)),
  { ssr: false }
);

const PreviewAnnotateModal = dynamic(
  importWithRetry(() => import("./preview-annotate-modal").then((m) => m.PreviewAnnotateModal)),
  { ssr: false }
);

const ShortcutsModal = dynamic(
  importWithRetry(() => import("./shortcuts-modal").then((m) => m.ShortcutsModal)),
  { ssr: false }
);

const FileTreePanel = dynamic(
  importWithRetry(() => import("./file-tree-panel").then((m) => m.FileTreePanel)),
  {
    ssr: false,
    loading: () => (
      <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
        Loading files…
      </div>
    ),
  }
);

const ChatPanel = dynamic(
  importWithRetry(() => import("./chat-panel").then((m) => m.ChatPanel)),
  {
    ssr: false,
    loading: () => (
      // Lovable dump loading overlay: centered spinner, flex-col gap-2 text-sm bg-base-pulse
      <div className="flex-1 flex flex-col items-center justify-center gap-2 text-sm bg-[var(--bg-base)] text-[var(--fg-tertiary)]">
        <svg
          className="size-5 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden
        >
          <path d="M21 12a9 9 0 1 1-6.219-8.56" />
        </svg>
      </div>
    ),
  }
);

const CodePanel = dynamic(
  importWithRetry(() => import("./code-panel").then((m) => m.CodePanel)),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center bg-[#1e1e1e]">
        <div className="text-muted-foreground text-sm">Loading editor...</div>
      </div>
    ),
  }
);

const LazyLovablePanel = dynamic(
  importWithRetry(() => import("./lazy-editor-panels").then((m) => m.LovableToolPanelContent)),
  { ssr: false }
);

const LazySecondaryPanel = dynamic(
  importWithRetry(() => import("./lazy-editor-panels").then((m) => m.SecondaryPanelContent)),
  { ssr: false }
);

const PreviewPanel = dynamic(
  importWithRetry(() => import("./preview-panel").then((m) => m.PreviewPanel)),
  {
    ssr: false,
    loading: () => (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading preview...</div>
      </div>
    ),
  }
);

export type EditorMode = "chat" | "plan" | "build" | "agent" | "patch";
export type ViewMode = "preview" | "code" | "both" | "files";
export type LeftPanel = "chat" | "plan" | "agent" | "intelligence" | "healing" | "activity" | "github" | "collab" | "supabase" | "env" | "image" | "figma" | "domains" | "history" | "deploys" | "analytics" | "knowledge" | "security" | "settings" | "search" | "components" | "design" | "comments" | "crossref" | "email" | "testing" | "guidance" | "e2e" | "packages" | "review" | "mcp" | "seo" | "customemail" | "designdir" | "designpanel" | "visualedits" | "publishpanel" | "payments" | "checkout" | "problems" | "apperrors" | "connectors" | "accessibility" | "schema" | "webhooks" | "performance" | "i18n" | "apidocs" | "cloud" | "dbmanager" | "storage" | "appconnectors" | "mcpcontext" | "aeo" | "vulnscan" | "dbseed" | "monetize" | "copygen" | "feedback" | "golive" | "nativeapps" | "icongen" | "compmarket" | "pwa" | "edgefn" | "apiplay" | "bundle" | "formgen" | "flags" | "changelog" | "dbquery" | "routerwiz" | "envhealth" | "promptopt" | "secrets" | "migrations" | "modelcmp" | "persona" | "activityfeed" | "ownership" | "configexport" | "savetemplate" | "diffviewer" | "depgraph" | "timelapse" | "aiintegration" | "appauth" | "designsystem" | "media" | "code";

interface EditorLayoutProps {
  project: Project;
  initialFiles: ProjectFile[];
  initialMessages: Message[];
  /** True when SSR truncated history (more messages exist older than the page). */
  initialHasMoreMessages?: boolean;
  profile: Profile | null;
  starterPrompt?: string;
  starterMode?: EditorMode;
  autoDeploy?: boolean;
  /** Deep-link: open this file path (from TanStack Zod search `?file=`). */
  initialFilePath?: string;
  /** Deep-link: canvas view (`?view=preview|code|both|files`). */
  initialView?: ViewMode;
  /** Deep-link: left tool panel id (`?panel=chat`). */
  initialPanel?: LeftPanel | string;
}

export function EditorLayout({
  project,
  initialFiles,
  initialMessages,
  initialHasMoreMessages = false,
  profile,
  starterPrompt,
  starterMode,
  autoDeploy,
  initialFilePath,
  initialView,
  initialPanel,
}: EditorLayoutProps) {
  const navigate = useNavigate();
  const { toast } = useToast();
  // Record this project visit for the dashboard "Recently visited" rail
  useRecordProjectVisit({ id: project.id, name: project.name, framework: project.framework ?? "react" });

  const [files, setFiles] = useState<ProjectFile[]>(initialFiles);
  const filesRef = useRef(files);
  filesRef.current = files;

  // Pull latest files from the API once on mount so DB-side repairs (and other
  // tabs' edits) aren't stuck behind a stale SSR snapshot.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${project.id}/files`, { cache: "no-store" });
        if (!res.ok || cancelled) return;
        const payload = await res.json();
        const next = (Array.isArray(payload) ? payload : payload.files) as ProjectFile[] | undefined;
        if (!next || next.length === 0 || cancelled) return;
        setFiles(next);
        window.dispatchEvent(
          new CustomEvent("lifemark-refresh-preview", {
            detail: { files: next, reason: "editor-mount-refetch" },
          }),
        );
      } catch {
        // Keep SSR files if refetch fails.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [project.id]);

  // Team / Intelligence file writes → refresh editor tree + preview.
  useEffect(() => {
    let timer: number | null = null;
    const refetch = () => {
      if (timer != null) window.clearTimeout(timer);
      timer = window.setTimeout(() => {
        void (async () => {
          try {
            const res = await fetch(`/api/projects/${project.id}/files`, { cache: "no-store" });
            if (!res.ok) return;
            const payload = await res.json();
            const next = (Array.isArray(payload) ? payload : payload.files) as ProjectFile[] | undefined;
            if (!next || next.length === 0) return;
            setFiles(next);
            window.dispatchEvent(
              new CustomEvent("lifemark-refresh-preview", {
                detail: { files: next, reason: "intelligence-file-change" },
              }),
            );
          } catch { /* keep current tree */ }
        })();
      }, 350);
    };
    const onFilesChanged = (e: Event) => {
      const detail = (e as CustomEvent<{ projectId?: string }>).detail;
      if (detail?.projectId && detail.projectId !== project.id) return;
      refetch();
    };
    const onDone = (e: Event) => {
      const detail = (e as CustomEvent<{ projectId?: string }>).detail;
      if (detail?.projectId && detail.projectId !== project.id) return;
      refetch();
    };
    window.addEventListener("lifemark-files-changed", onFilesChanged);
    window.addEventListener("lifemark-intelligence-done", onDone);
    return () => {
      if (timer != null) window.clearTimeout(timer);
      window.removeEventListener("lifemark-files-changed", onFilesChanged);
      window.removeEventListener("lifemark-intelligence-done", onDone);
    };
  }, [project.id]);

  // Auto-deploy when arriving from dashboard with ?deploy=true
  const autoDeployRan = useRef(false);
  useEffect(() => {
    if (!autoDeploy || autoDeployRan.current) return;
    autoDeployRan.current = true;
    void (async () => {
      try {
        const res = await fetch("/api/deploy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({ projectId: project.id, provider: "netlify" }),
        });
        if (res.ok) {
          window.dispatchEvent(new CustomEvent("lifemark-deploy-started"));
        }
      } catch {
        // Non-fatal — user can publish manually from the top bar.
      }
    })();
  }, [autoDeploy, project.id]);

  const [hasMoreMessages, setHasMoreMessages] = useState(initialHasMoreMessages);

  // When SSR flagged older history, refresh via API so `hasMore` is authoritative.
  useEffect(() => {
    if (!initialHasMoreMessages && initialMessages.length < 500) return;
    setMessagesHydrating(true);
    void (async () => {
      try {
        const res = await fetch(`/api/projects/${project.id}/messages?limit=500`);
        if (!res.ok) return;
        const data = await res.json() as { messages?: Message[]; hasMore?: boolean };
        if (data.messages?.length) setMessages(data.messages);
        if (typeof data.hasMore === "boolean") setHasMoreMessages(data.hasMore);
      } finally {
        setMessagesHydrating(false);
      }
    })();
  }, [project.id, initialHasMoreMessages, initialMessages.length]);

  // Static security-issue count for the publish dropdown's "Review security" badge
  // (matches Lovable's red number badge). Recomputes whenever files change; cheap
  // enough to run inline since staticScan is a single linear regex pass.
  const securityIssueCount = useMemo(() => countFindings(files), [files]);
  // Critical-only count gates publishing (Lovable's "block publish on
  // critical findings"). Same static scan, severity-filtered.
  const criticalSecurityCount = useMemo(
    () => staticScan(files).filter((f) => f.severity === "critical").length,
    [files],
  );
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [messagesHydrating, setMessagesHydrating] = useState(false);
  const [activeFile, setActiveFile] = useState<ProjectFile | null>(
    (initialFilePath
      ? initialFiles.find((f) => f.path === initialFilePath)
      : undefined) ||
      initialFiles.find((f) => f.path === "app/page.tsx" || f.path === "src/App.tsx" || f.path === "index.html") ||
      initialFiles[0] ||
      null
  );
  const [editorMode, setEditorMode] = useState<EditorMode>(() => {
    if (starterMode) return starterMode;
    if (starterPrompt) {
      return resolvePromptMode(starterPrompt, {
        fileCount: countUserAuthoredFiles(initialFiles),
        hasPreviewError: false,
        framework: project.framework,
        currentMode: "build",
        files: initialFiles,
      });
    }
    // Default to Chat (Lovable-style): talk first; explicit builds promote via the router.
    return "chat";
  });
  const [viewMode, setViewMode] = useState<ViewMode>(initialView ?? "preview");
  // Lovable-parity "Preview this version": when set, the preview panel renders
  // this snapshot's files (read-only banner) instead of the live project files.
  const [previewVersion, setPreviewVersion] = useState<{ files: ProjectFile[]; label: string } | null>(null);
  const [leftPanel, setLeftPanel] = useState<LeftPanel>(
    (initialPanel as LeftPanel | undefined) || "chat",
  );
  // Right-side secondary panel (null = show preview/code)
  const [rightPanel, setRightPanel] = useState<LeftPanel | null>(null);
  const [leftChatOverlay, setLeftChatOverlay] = useState<"history" | null>(null);

  const [credits, setCredits] = useState(profile?.credits ?? 0);
  /** Dev-only: simulate 0-credits UX without changing DB balance */
  const [simulateZeroCredits, setSimulateZeroCredits] = useState(() => {
    if (typeof window === "undefined" || process.env.NODE_ENV !== "development") return false;
    const params = new URLSearchParams(window.location.search);
    const q = params.get("debugZeroCredits");
    if (q === "1") {
      sessionStorage.setItem("lifemark-debug-zero-credits", "1");
      sessionStorage.removeItem("lifemark-debug-zero-credits-off");
      return true;
    }
    if (q === "0") {
      sessionStorage.removeItem("lifemark-debug-zero-credits");
      sessionStorage.setItem("lifemark-debug-zero-credits-off", "1");
      return false;
    }
    if (sessionStorage.getItem("lifemark-debug-zero-credits-off") === "1") return false;
    return sessionStorage.getItem("lifemark-debug-zero-credits") === "1";
  });
  const uiCredits = simulateZeroCredits ? 0 : credits;

  const syncCredits = useCallback((simulate: boolean) => {
    fetch("/api/billing/credits", {
      headers: simulate ? { "X-Debug-Zero-Credits": "1" } : {},
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d && typeof d.credits === "number") setCredits(d.credits);
      })
      .catch(() => {});
  }, []);

  const grantDevCredits = useCallback(async () => {
    setSimulateZeroCredits(false);
    sessionStorage.removeItem("lifemark-debug-zero-credits");
    sessionStorage.setItem("lifemark-debug-zero-credits-off", "1");
    try {
      const res = await fetch("/api/billing/dev-grant", { method: "POST" });
      const d = res.ok ? await res.json() : null;
      if (res.ok && d && typeof d.credits === "number") setCredits(d.credits);
      else syncCredits(false);
    } catch {
      syncCredits(false);
    }
  }, [syncCredits]);

  const toggleSimulateZeroCredits = useCallback(() => {
    setSimulateZeroCredits((prev) => {
      const next = !prev;
      if (next) {
        sessionStorage.setItem("lifemark-debug-zero-credits", "1");
        sessionStorage.removeItem("lifemark-debug-zero-credits-off");
      } else {
        sessionStorage.removeItem("lifemark-debug-zero-credits");
        sessionStorage.setItem("lifemark-debug-zero-credits-off", "1");
      }
      syncCredits(next);
      return next;
    });
  }, [syncCredits]);
  const [isVisualEditActive, setIsVisualEditActive] = useState(false);
  const [showFileTree, setShowFileTree] = useState(false);
  const [focusMode, setFocusMode] = useState(false);
  /** Lovable close-sidebar — hides chat column but keeps top nav */
  const [chatSidebarCollapsed, setChatSidebarCollapsed] = useState(false);
  /** Lovable dump: top-nav left cluster width syncs to chat panel % (~22.3). */
  const [chatPanelSizePercent, setChatPanelSizePercent] = useState(22.3);
  const chatPanelRef = useRef<ImperativePanelHandle>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewRuntimeErrors, setPreviewRuntimeErrors] = useState<PreviewRuntimeError[]>(EMPTY_PREVIEW_ERRORS);

  // Stable callback — inline `setPreviewRuntimeErrors(report?.errors ?? [])` created a
  // new [] every effect run and re-rendered forever (Maximum update depth → editor crash).
  const handlePreviewErrorReport = useCallback((report: PreviewErrorReport | null) => {
    setPreviewRuntimeErrors((prev) => {
      const next = report?.errors ?? EMPTY_PREVIEW_ERRORS;
      if (prev === next) return prev;
      if (prev.length === 0 && next.length === 0) return prev;
      if (
        prev.length === next.length &&
        prev.every((err, i) => err.message === next[i]?.message && err.kind === next[i]?.kind)
      ) {
        return prev;
      }
      return next.length === 0 ? EMPTY_PREVIEW_ERRORS : next;
    });
  }, []);
  const [pendingFix, setPendingFix] = useState<string | null>(null);
  const [pendingCrossRefPrompt, setPendingCrossRefPrompt] = useState<string | null>(null);
  const [pendingBuildFromFile, setPendingBuildFromFile] = useState<{ prompt: string; imageBase64?: string } | null>(null);
  const [pendingFileRef, setPendingFileRef] = useState<import("@/types/database").ProjectFile | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingFileCount, setGeneratingFileCount] = useState(0);
  // Lovable parity: browser-tab favicon shows build status (amber → green flash).
  useFaviconStatus(isGenerating);
  const [yjsCollaborators, setYjsCollaborators] = useState<import("@/hooks/use-yjs-editor").Collaborator[]>([]);
  const [lastSaved, setLastSaved] = useState<Date | null>(() => {
    // Seed from file mtimes so the Publish dirty-dot works across reloads
    // (not only after an edit in this session).
    let max = 0;
    for (const f of files) {
      const raw = (f as { updated_at?: string | null }).updated_at;
      if (!raw) continue;
      const t = Date.parse(raw);
      if (Number.isFinite(t) && t > max) max = t;
    }
    return max > 0 ? new Date(max) : null;
  });

  // Dev Mode — Pro+ users can toggle the code editor; free users see an upgrade prompt
  const isPro = profile?.plan && profile.plan !== "free";
  const storageKey = `devmode-${project.id}`;
  const [devMode, setDevMode] = useState<boolean>(() => {
    if (!isPro) return false;
    if (typeof window === "undefined") return true;
    const stored = localStorage.getItem(storageKey);
    return stored === null ? true : stored === "true";
  });

  const handleDevModeToggle = useCallback(() => {
    setDevMode((prev) => {
      const next = !prev;
      localStorage.setItem(storageKey, String(next));
      // When exiting dev mode, snap back to preview-only
      if (!next) {
        setViewMode("preview");
        setLeftPanel("chat");
      }
      return next;
    });
  }, [storageKey]);

  // collabUser derived from profile — passed into CodePanel to activate Yjs
  const collabUser = profile
    ? { id: profile.id, name: profile.full_name ?? profile.email ?? "User", avatar: profile.avatar_url ?? undefined }
    : undefined;
  const [currentProject, setCurrentProject] = useState<Project>(project);
  // Test / Live environment — starts from the value saved on the project
  const [environment, setEnvironment] = useState<"test" | "live">(
    ((project as Record<string, unknown>).environment as "test" | "live") ?? "test"
  );
  const isLiveLocked = environment === "live";
  // Mobile: which pane is visible — "left" | "files" | "preview"
  const [mobilePaneActive, setMobilePaneActive] = useState<"left" | "files" | "preview">("left");
  // useIsMobile() replaces the inline window.innerWidth check that used to live
  // here. Same 768px breakpoint, but the hook also reports pointer:coarse and
  // standalone-PWA state for downstream consumers.
  const { isMobile } = useIsMobile();
  const [annotateOpen, setAnnotateOpen] = useState(false);
  const [annotateImage, setAnnotateImage] = useState<string | null>(null);

  // Desktop: never boot with a collapsed/zero-width chat column.
  useEffect(() => {
    if (isMobile) return;
    try {
      // Must match the PanelGroup autoSaveId below, version suffix included.
      // It did not, for two versions: this guard was reading a key nothing
      // ever wrote, so a saved zero-width chat column was never repaired.
      const key = `react-resizable-panels:lifemark-editor-split-v3-${project.id}`;
      // Superseded layouts are dead weight and would otherwise sit in
      // localStorage forever, one entry per project.
      for (const stale of ["", "-v2"]) {
        localStorage.removeItem(
          `react-resizable-panels:lifemark-editor-split${stale}-${project.id}`,
        );
      }
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as {
          [group: string]: { layout?: number[] };
        };
        let dirty = false;
        for (const group of Object.values(parsed)) {
          const layout = group?.layout;
          if (!Array.isArray(layout) || layout.length < 2) continue;
          // Sidebar is the smaller chat column — if either slot is ~0, reset.
          if (layout.some((n) => typeof n === "number" && n < 8)) {
            dirty = true;
            break;
          }
        }
        if (dirty) localStorage.removeItem(key);
      }
    } catch { /* private mode */ }

    const t = window.setTimeout(() => {
      const panel = chatPanelRef.current;
      if (panel?.isCollapsed?.()) {
        panel.expand();
        setChatSidebarCollapsed(false);
      } else if (typeof panel?.getSize === "function" && panel.getSize() < 12) {
        panel.resize?.(22.3);
        setChatSidebarCollapsed(false);
      }
    }, 80);
    return () => window.clearTimeout(t);
  }, [isMobile, project.id]);

  const handleFixWithAI = useCallback((err: string) => {
    window.dispatchEvent(new CustomEvent("lifemark-preview-heal-start"));
    setMobilePaneActive("left");
    setLeftPanel("chat");
    setPendingFix(err);
  }, []);

  // Mobile detection now lives in the useIsMobile() hook above.

  const handleProjectUpdate = useCallback((updates: Partial<Project>) => {
    setCurrentProject((prev) => ({ ...prev, ...updates }));
  }, []);
  const { open: shortcutsOpen, setOpen: setShortcutsOpen } = useShortcutsModal();

  const handleOpenPanel = useCallback((panel: string) => {
    if (panel === "history") {
      setLeftChatOverlay("history");
      setRightPanel(null);
    } else {
      setRightPanel(panel as LeftPanel);
      setLeftChatOverlay(null);
    }
  }, []);

  const handleFocusPreview = useCallback(() => {
    // Focus only — do NOT fire bare lifemark-refresh-preview here.
    // A bare refresh falls back to a stale `files` prop and remounts the OLD
    // preview right after a good files-bearing refresh (Lovable: edit → live preview).
    setRightPanel(null);
    setLeftChatOverlay(null);
    setViewMode("preview");
    if (isMobile) setMobilePaneActive("preview");
  }, [isMobile]);

  // Mobile: Files tab routes to the dedicated files layout.
  useEffect(() => {
    if (!isMobile) return;
    if (viewMode === "files" || viewMode === "code") setMobilePaneActive("files");
  }, [isMobile, viewMode]);

  const commandPaletteActions: CommandPaletteActions = {
    onOpenFile: (file) => setActiveFile(files.find(f => f.id === file.id) || null),
    onOpenPanel: (panel) => {
      const chatPanels: LeftPanel[] = ["chat", "plan", "agent"];
      if (chatPanels.includes(panel as LeftPanel)) {
        setLeftPanel(panel as LeftPanel);
      } else {
        handleOpenPanel(panel);
      }
    },
    onSetViewMode: (mode) => setViewMode(mode),
    onToggleFileTree: () => setShowFileTree((v) => !v),
  };

  useEffect(() => {
    setCredits(profile?.credits ?? 0);
  }, [profile]);

  useEffect(() => {
    if (uiCredits <= 0) {
      setPreviewError(null);
      setPendingFix(null);
    }
  }, [uiCredits]);

  // Sync live credit balance (dev auto-grants via ensureDevCredits)
  useEffect(() => {
    syncCredits(simulateZeroCredits);
  }, [project.id, simulateZeroCredits, syncCredits]);

  // Auto-switch left panel when mode changes to agent
  // NOTE: plan mode now uses the chat panel (leftPanel stays "chat"), so we don't auto-switch for it
  useEffect(() => {
    if (editorMode === "agent") setLeftPanel("agent");
  }, [editorMode]);

  // Global keyboard shortcuts
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      // View mode: ⌘1 preview, ⌘2 code, ⌘3 both, ⌘4 files
      if (e.key === "1") { e.preventDefault(); setViewMode("preview"); setShowFileTree(false); }
      if (e.key === "2") { e.preventDefault(); setViewMode("code"); setShowFileTree(false); }
      if (e.key === "3") { e.preventDefault(); setViewMode("both"); setShowFileTree(false); }
      if (e.key === "4") { e.preventDefault(); setViewMode("files"); setShowFileTree(false); setRightPanel(null); }

      // Toggle file tree: ⌘\ → Files view (Lovable parity)
      if (e.key === "\\") { e.preventDefault(); setShowFileTree(false); setViewMode("files"); setRightPanel(null); }

      // AI mode switching: ⌘⇧C/P/B/A
      if (e.shiftKey) {
        if (e.key === "C") { e.preventDefault(); setEditorMode("chat"); setLeftPanel("chat"); }
        if (e.key === "P") { e.preventDefault(); setEditorMode("plan"); setLeftPanel("chat"); }
        if (e.key === "B") { e.preventDefault(); setEditorMode("build"); setLeftPanel("chat"); }
        if (e.key === "A") { e.preventDefault(); setEditorMode("agent"); }
        if (e.key === "F") { e.preventDefault(); setLeftPanel((p) => p === "search" ? "chat" : "search"); }
      }

      // Escape exits focus mode
      if (e.key === "Escape") { setFocusMode(false); }
    }
    function focusHandler() { setFocusMode((v) => !v); }
    document.addEventListener("keydown", handler);
    window.addEventListener("toggle-focus-mode", focusHandler);
    return () => {
      document.removeEventListener("keydown", handler);
      window.removeEventListener("toggle-focus-mode", focusHandler);
    };
  }, []);

  // Per-message version preview (Lovable parity). The chat panel dispatches
  // "lifemark-preview-version" with a snapshotId; we reconstruct that snapshot's
  // full file list via GET /api/projects/snapshots?id=… and show it in the
  // preview panel until "lifemark-exit-version-preview" (banner's Back to latest).
  useEffect(() => {
    function handlePreviewVersion(e: Event) {
      const detail = (e as CustomEvent).detail as { snapshotId?: string; label?: string } | undefined;
      if (!detail?.snapshotId) return;
      const { snapshotId, label } = detail;
      void (async () => {
        try {
          const res = await fetch(`/api/projects/snapshots?id=${snapshotId}`);
          if (!res.ok) throw new Error(`Snapshot fetch failed (${res.status})`);
          const { files: snapFiles } = (await res.json()) as {
            files?: Array<{ path: string; content: string; language?: string }>;
          };
          if (!snapFiles || snapFiles.length === 0) throw new Error("Snapshot is empty");
          const now = new Date().toISOString();
          const mapped = snapFiles.map((f, i) => ({
            id: `version-preview-${snapshotId}-${i}`,
            project_id: project.id,
            path: f.path,
            content: f.content,
            language: f.language ?? "plaintext",
            created_at: now,
            updated_at: now,
          })) as ProjectFile[];
          setPreviewVersion({ files: mapped, label: label || "Earlier version" });
          setViewMode("preview");
          if (isMobile) setMobilePaneActive("preview");
        } catch {
          // best-effort — leave the live preview untouched
        }
      })();
    }
    function handleExitVersionPreview() { setPreviewVersion(null); }
    window.addEventListener("lifemark-preview-version", handlePreviewVersion);
    window.addEventListener("lifemark-exit-version-preview", handleExitVersionPreview);
    return () => {
      window.removeEventListener("lifemark-preview-version", handlePreviewVersion);
      window.removeEventListener("lifemark-exit-version-preview", handleExitVersionPreview);
    };
  }, [project.id, isMobile]);

  // Chat line-reference pills (Lovable parity): clicking `@file.tsx:42` in a
  // sent message opens the file in Code view and reveals the line.
  useEffect(() => {
    function handleOpenFileAtLine(e: Event) {
      const { path, line } = (e as CustomEvent<{ path: string; line: number }>).detail ?? {};
      if (!path) return;
      const file = files.find((f) => f.path === path) ?? files.find((f) => f.path.endsWith(path));
      if (!file) return;
      setActiveFile(file);
      setViewMode("files");
      if (isMobile) setMobilePaneActive("files");
      // Let the code panel mount/switch tabs before revealing the line.
      if (line > 0) {
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent("monaco-reveal-line", { detail: { line } }));
        }, 450);
      }
    }
    window.addEventListener("lifemark-open-file-at-line", handleOpenFileAtLine);
    return () => window.removeEventListener("lifemark-open-file-at-line", handleOpenFileAtLine);
  }, [files, isMobile]);

  const handleFileSelect = useCallback((file: ProjectFile) => {
    setActiveFile(file);
    // On mobile, open code pane when a file is selected
    if (isMobile) setMobilePaneActive("files");
  }, [isMobile]);

  const handleFileUpdate = useCallback((updatedFile: ProjectFile) => {
    setFiles((prev) => prev.map((f) => (f.id === updatedFile.id ? updatedFile : f)));
    setActiveFile((prev) => (prev?.id === updatedFile.id ? updatedFile : prev));

    // Persist visual edits / inline updates (Lovable parity — WYSIWYG survives refresh)
    //
    // This was a PATCH carrying only `path`, and PATCH's very first check is
    // `if (!body.fileId) return 400`. So every visual edit, every packages-panel
    // change and every env-file edit 400'd, silently: `res.ok` was never read
    // and `.catch()` does not fire for an HTTP error status. The user watched
    // the change appear in the editor, got charged a credit for it
    // (preview-panel claims one before calling this), and lost it on reload.
    //
    // POST is the path-addressed upsert — the right verb when the caller knows
    // the path but not the row id, which is exactly the visual-edit case.
    if (updatedFile.path && updatedFile.content !== undefined) {
      void (async () => {
        try {
          const res = await fetch(`/api/projects/${project.id}/files`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              path: updatedFile.path,
              content: updatedFile.content,
              language: updatedFile.language,
            }),
          });
          if (!res.ok) {
            // Silence here is what made this invisible for so long. A failed
            // save must be visible: the user is about to keep working on top of
            // an edit the server never accepted.
            toast({
              title: "Change not saved",
              description: `${updatedFile.path} could not be saved (${res.status}). Reload before making more changes.`,
              variant: "destructive",
            });
          }
        } catch {
          toast({
            title: "Change not saved",
            description: `${updatedFile.path} could not be saved — you appear to be offline.`,
            variant: "destructive",
          });
        }
      })();
    }
  }, [project.id, toast]);

  /** Lovable-style file sync: full project listings REPLACE (drop orphans);
   *  single-file panel edits MERGE so we don't wipe the tree.
   *  Never replace with an empty payload when we already have files — that
   *  blanked the editor/preview after a failed refresh. */
  /**
   * The debounced keystroke save waiting to fire, if any.
   *
   * Declared up here — above `handleFilesUpdate` rather than next to the
   * autosave code that owns it — because `handleFilesUpdate` has to be able
   * to cancel it. See the note there.
   */
  const pendingCodeChangeRef = useRef<{
    fileId: string;
    content: string;
    timer: ReturnType<typeof setTimeout>;
  } | null>(null);

  /**
   * Contents this session has already held for a file: what it was when the
   * user started typing, and everything we have sent to the server for it.
   *
   * Used to tell a genuine external rewrite from an echo. A file refetch that
   * races an in-flight PATCH comes back with the PRE-patch text — different
   * from the current local content, so a naive comparison reads it as
   * "somebody rewrote this" and cancels the user's pending keystrokes with a
   * message about the AI that is simply untrue. That text is one we have seen
   * before; a real AI rewrite is not.
   *
   * Bounded per file — only the last few matter, and this lives for the whole
   * editing session.
   */
  const seenContentRef = useRef<Map<string, string[]>>(new Map());
  const rememberContent = useCallback((fileId: string, content: string) => {
    const history = seenContentRef.current.get(fileId) ?? [];
    if (history.includes(content)) return;
    history.push(content);
    if (history.length > 8) history.shift();
    seenContentRef.current.set(fileId, history);
  }, []);

  const handleFilesUpdate = useCallback((
    updatedFiles: ProjectFile[],
    opts?: { replace?: boolean },
  ) => {
    const prev = filesRef.current;
    if (!Array.isArray(updatedFiles)) return;

    // Guard: empty array must not wipe a live project (failed fetch / bad payload).
    if (updatedFiles.length === 0 && prev.length > 0) {
      return;
    }

    // Full DB refresh / agent refetch / multi-file snapshots → replace.
    // Single-file panel updates (design system, email, etc.) → merge.
    const replace =
      opts?.replace === true ||
      (updatedFiles.length > 1 && updatedFiles.length >= Math.max(1, prev.length - 2));

    const changedPaths: string[] = [];
    let next: ProjectFile[];

    if (replace) {
      const prevByPath = new Map(prev.map((f) => [f.path, f]));
      for (const f of updatedFiles) {
        const existing = prevByPath.get(f.path);
        if (!existing || existing.content !== f.content) changedPaths.push(f.path);
      }
      for (const f of prev) {
        if (!updatedFiles.some((u) => u.path === f.path)) changedPaths.push(f.path);
      }
      next = updatedFiles;
      if (changedPaths.length === 0 && next.length === prev.length) {
        let identical = true;
        for (let i = 0; i < prev.length; i++) {
          if (prev[i]?.path !== next[i]?.path || prev[i]?.content !== next[i]?.content) {
            identical = false;
            break;
          }
        }
        if (identical) return;
      }
    } else {
      const map = new Map(prev.map((f) => [f.path, f]));
      updatedFiles.forEach((f) => {
        const existing = map.get(f.path);
        if (!existing || existing.content !== f.content) changedPaths.push(f.path);
        map.set(f.path, f);
      });
      if (changedPaths.length === 0) {
        let identical = true;
        for (const f of prev) {
          if (map.get(f.path) !== f) { identical = false; break; }
        }
        if (identical) return;
      }
      next = Array.from(map.values());
    }

    // CANCEL A PENDING KEYSTROKE SAVE FOR A FILE SOMEONE ELSE JUST REWROTE.
    //
    // Typing schedules a PATCH 500ms out, carrying the editor buffer as it was
    // when the last key landed. If an AI build, an agent write, a snapshot
    // restore or a panel edit rewrites that same file inside the window, the
    // timer still fires and PATCHes the PRE-rewrite buffer over the new
    // content — a full revert of the change the user just asked for, with no
    // error anywhere, seconds after it appeared. (This is the shape of a write
    // that "reverted itself a couple of minutes later".)
    //
    // The incoming content is authoritative and strictly newer, so the stale
    // buffer loses. Say so rather than dropping the keystrokes silently.
    const pendingEdit = pendingCodeChangeRef.current;
    if (pendingEdit) {
      const pendingPath = prev.find((f) => f.id === pendingEdit.fileId)?.path;
      const incoming = pendingPath
        ? updatedFiles.find((f) => f.path === pendingPath)?.content
        : undefined;
      // Only a genuinely NEW body counts. A refetch that races an in-flight
      // PATCH returns the pre-PATCH text, which differs from local content but
      // is something this session has already held — cancelling on that threw
      // away the user's keystrokes and blamed an AI rewrite that never
      // happened. `seenContentRef` is what separates the two.
      const external =
        pendingPath != null &&
        incoming != null &&
        incoming !== pendingEdit.content &&
        !(seenContentRef.current.get(pendingEdit.fileId) ?? []).includes(incoming);
      if (external) {
        clearTimeout(pendingEdit.timer);
        pendingCodeChangeRef.current = null;
        toast({
          title: "Your unsaved edits were replaced",
          description: `${pendingPath} was rewritten while you were typing. Use Undo in the chat to get the previous version back.`,
        });
      }
    }

    filesRef.current = next;
    setFiles(next);

    if (changedPaths.length > 0 || replace) {
      queueMicrotask(() => {
        setPreviewVersion(null);
        setActiveFile((current) => pickActiveFileAfterUpdate(next, changedPaths, current) ?? current);
        window.dispatchEvent(new CustomEvent("lifemark-refresh-preview", {
          detail: { files: next, reason: replace ? "files-replaced" : "files-updated" },
        }));
        if (shouldFocusPreviewAfterGeneration(editorMode, changedPaths.length)) {
          handleFocusPreview();
        }
      });
    }
    // Keep chat visible on mobile after file sync — user can open Preview via bottom nav.
  }, [editorMode, handleFocusPreview, isMobile, toast]);

  const handleFileCreate = useCallback((newFile: ProjectFile) => {
    setFiles((prev) => [...prev, newFile]);
    setActiveFile(newFile);
  }, []);

  const handleFileDelete = useCallback(
    (fileId: string) => {
      setFiles((prev) => {
        const next = prev.filter((f) => f.id !== fileId);
        if (activeFile?.id === fileId) {
          setActiveFile(next[0] || null);
        }
        return next;
      });
    },
    [activeFile]
  );

  const handleEnvFileUpdate = useCallback(
    (path: string, content: string) => {
      const existing = files.find((f) => f.path === path);
      if (existing) {
        handleFileUpdate({ ...existing, content });
      } else {
        const newFile: ProjectFile = {
          id: `env-${Date.now()}`,
          project_id: project.id,
          path,
          content,
          language: "dotenv",
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        handleFileCreate(newFile);
      }
    },
    [files, project.id, handleFileUpdate, handleFileCreate]
  );

  // ── Code editing ──────────────────────────────────────────────────────────
  // Live keystrokes are debounced: one state sync + one PATCH per idle period,
  // instead of a whole-shell re-render + API call on EVERY Monaco keystroke.
  // Explicit saves (⌘S in CodePanel) remain immediate via handleCodeSave.
  /**
   * A failed save has to be loud.
   *
   * This was `if (res.ok) setLastSaved(...)` with no else, and a catch that only
   * reached the console. So a 401 from an expired session, a 404 or a 500 were
   * indistinguishable from success: the user kept typing while the "Saved"
   * timestamp sat frozen at their last real write — which reads as "nothing has
   * changed since then", not "nothing has saved since then" — and the work was
   * gone on reload. Session expiry is the common case, and it is precisely the
   * one where someone types for an hour first.
   *
   * Deduped by failure kind, because this runs on a 500ms keystroke debounce and
   * a toast per keystroke would be its own bug.
   */
  const saveFailureRef = useRef<string | null>(null);
  const persistFileContent = useCallback(
    async (fileId: string, content: string, opts?: { explicit?: boolean }) => {
      /**
       * Report once per failure kind, then THROW.
       *
       * The throw matters as much as the toast. `handleCodeSave` is the
       * `onSave` prop the code panel awaits for ⌘S and Save All; when this
       * function swallowed failures and returned normally, the panel counted
       * the tab as written, cleared its dirty flag and printed "Saved" over a
       * write that never landed. Callers that fire-and-forget (the keystroke
       * debounce, the unmount flush) attach `.catch` — the toast is their
       * report.
       *
       * Two details the first version got wrong:
       *
       * `explicit` — the dedupe exists because this runs on a 500ms keystroke
       * debounce and a toast per keystroke would be its own bug. But it also
       * silenced the ⌘S the user pressed *because* of the first toast. A save
       * the user asked for always reports; only the automatic ones dedupe.
       *
       * `reported` on the error — the code panel has its own catch that
       * toasts "Save failed". With the throw added, one failure produced two
       * toasts, and the bare one was the less useful of the pair. The flag
       * lets the caller stay quiet because it knows the user has already been
       * told something specific.
       */
      const fail: (key: string, title: string, description: string) => never = (
        key,
        title,
        description,
      ) => {
        if (opts?.explicit || saveFailureRef.current !== key) {
          saveFailureRef.current = key;
          toast({ title, description, variant: "destructive" });
        }
        const err = new Error(`${title} (${key})`) as Error & { reported?: boolean };
        err.reported = true;
        throw err;
      };

      // Only the transport is wrapped. Keeping the response handling out of
      // the try is deliberate: `fail` throws, and a catch around it would
      // swallow a 403 and re-report it as "you appear to be offline".
      let res: Response;
      try {
        res = await fetch(`/api/projects/${project.id}/files`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId, content }),
        });
      } catch {
        fail(
          "offline",
          "Changes are NOT saving",
          "You appear to be offline. Edits exist only in this tab until the connection returns.",
        );
      }

      if (res.ok) {
        setLastSaved(new Date());
        saveFailureRef.current = null;
        return;
      }
      if (res.status === 401 || res.status === 403) {
        fail(
          "auth",
          "Your session expired — changes are NOT saving",
          "Sign in again in another tab, then keep working here. Do not reload this tab until a save succeeds.",
        );
      }
      fail(
        `http-${res.status}`,
        "Changes are NOT saving",
        `The server rejected the save (${res.status}). Copy anything important before reloading this tab.`,
      );
    },
    [project.id, toast]
  );

  const commitCodeChange = useCallback(
    (fileId: string, content: string) => {
      // Everything we send is an "echo" we may see again from a later refetch.
      rememberContent(fileId, content);
      setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, content } : f)));
      setActiveFile((prev) => (prev?.id === fileId ? { ...prev, content } : prev));
      // Autosave path: `persistFileContent` has already told the user why it
      // failed, so swallow here rather than raise an unhandled rejection.
      void persistFileContent(fileId, content).catch(() => {});
    },
    [persistFileContent, rememberContent]
  );

  // Flush a pending debounced edit on unmount so typed content isn't lost.
  useEffect(() => {
    return () => {
      const pending = pendingCodeChangeRef.current;
      if (pending) {
        clearTimeout(pending.timer);
        pendingCodeChangeRef.current = null;
        void persistFileContent(pending.fileId, pending.content).catch(() => {});
      }
    };
  }, [persistFileContent]);

  const handleCodeChange = useCallback(
    (content: string) => {
      if (!activeFile) return;
      const fileId = activeFile.id;
      // The body this edit started from — a later refetch may still be
      // carrying it, and that must not read as an external rewrite.
      rememberContent(fileId, activeFile.content ?? "");
      const pending = pendingCodeChangeRef.current;
      if (pending) {
        clearTimeout(pending.timer);
        // Switched files mid-debounce — flush the other file's edit first so
        // it is never dropped or attributed to the wrong file.
        if (pending.fileId !== fileId) commitCodeChange(pending.fileId, pending.content);
      }
      pendingCodeChangeRef.current = {
        fileId,
        content,
        timer: setTimeout(() => {
          pendingCodeChangeRef.current = null;
          commitCodeChange(fileId, content);
        }, 500),
      };
    },
    [activeFile, commitCodeChange, rememberContent]
  );

  // Immediate save — used by CodePanel's explicit ⌘S / Save button.
  const handleCodeSave = useCallback(
    async (content: string) => {
      if (!activeFile) {
        // Returning quietly here resolved the promise the code panel awaits,
        // so it cleared the tab's dirty flag and printed "Saved" for a write
        // with no destination — the same lie the throw above exists to stop.
        throw new Error("No file is open to save.");
      }
      const fileId = activeFile.id;
      const pending = pendingCodeChangeRef.current;
      if (pending?.fileId === fileId) {
        clearTimeout(pending.timer);
        pendingCodeChangeRef.current = null;
      }
      setFiles((prev) => prev.map((f) => (f.id === fileId ? { ...f, content } : f)));
      setActiveFile((prev) => (prev?.id === fileId ? { ...prev, content } : prev));
      await persistFileContent(fileId, content, { explicit: true });
    },
    [activeFile, persistFileContent]
  );

  const pid = currentProject.id;
  const projectSlug = (currentProject as { slug?: string | null }).slug ?? pid;
  const sendPromptToChat = useCallback((p: string) => {
    // Mid-session prompts must land in the composer even when chat already has messages.
    // pendingBuildFromFile is consumed by ChatPanel regardless of message count.
    setPendingBuildFromFile({ prompt: p });
    setRightPanel(null);
    setLeftPanel("chat");
  }, []);

  const handleApprovePlan = useCallback(
    async (markdown: string) => {
      await saveApprovedPlan(currentProject.id, markdown);
      setEditorMode("build");
      sendPromptToChat(`Implement this approved plan:\n\n${markdown}`);
    },
    [currentProject.id, sendPromptToChat],
  );

  // Secondary tools still use the legacy cross-reference setter. Convert
  // those values into the composer payload, which works in existing chats.
  useEffect(() => {
    if (!pendingCrossRefPrompt) return;
    setPendingBuildFromFile({ prompt: pendingCrossRefPrompt });
    setPendingCrossRefPrompt(null);
    setRightPanel(null);
    setLeftPanel("chat");
  }, [pendingCrossRefPrompt]);

  // Sync top-bar Files/Code with mobile panes. Do NOT force Preview on every
  // mount — that hid the chat column (`mobilePaneActive` never stayed "left").
  useEffect(() => {
    if (!isMobile || rightPanel || leftChatOverlay) return;
    if (viewMode === "code" || viewMode === "files") setMobilePaneActive("files");
  }, [isMobile, viewMode, rightPanel, leftChatOverlay]);

  /**
   * Persist an .env file edited in the Env panel.
   *
   * This used to be `setFiles(...)` and nothing else — pure local state, no
   * request. The panel called it, cleared its dirty badge and toasted
   * "Development vars saved", so pasting a Supabase key or an API key looked
   * exactly like a successful save and was gone on reload. There was already a
   * persisting version of this next to `handleFileUpdate`; it was simply never
   * wired up, and the local-only twin won by name.
   *
   * Worse when the file did not exist yet: `prev.map` matched nothing but
   * still produced a new array, so the panel's `useEffect([files])` re-derived
   * from `files`, found no .env.local and reset to defaults — the pasted
   * values visibly disappeared one render after the success toast.
   *
   * Returns a promise so the panel can wait for the write instead of
   * announcing it.
   */
  const handleEnvUpdateFile = useCallback(
    async (path: string, content: string) => {
      setFiles((prev) => {
        const exists = prev.some((f) => f.path === path);
        if (exists) return prev.map((f) => (f.path === path ? { ...f, content } : f));
        return [
          ...prev,
          {
            id: `env-${path}-${Date.now()}`,
            project_id: project.id,
            path,
            content,
            language: "dotenv",
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          } as ProjectFile,
        ];
      });
      setActiveFile((prev) => (prev?.path === path ? { ...prev, content } : prev));

      // POST is the path-addressed upsert: the panel knows the path, and for a
      // brand new .env.local there is no row id to PATCH.
      const res = await fetch(`/api/projects/${project.id}/files`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content, language: "dotenv" }),
      });
      if (!res.ok) throw new Error(`Could not save ${path} (${res.status}).`);
    },
    [project.id],
  );

  const handleMessagesUpdate = useCallback((newMessages: Message[]) => {
    setMessages(newMessages);
  }, []);

  const handleDuplicateProject = useCallback(async () => {
    try {
      const filesRes = await fetch(`/api/projects/${project.id}/files`);
      const payload = filesRes.ok ? await filesRes.json() : [];
      const forkFiles = (Array.isArray(payload) ? payload : payload.files ?? []) as ProjectFile[];
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `Copy of ${project.name}`,
          description: project.description ?? "",
          framework: project.framework,
          forkFiles,
        }),
      });
      if (res.ok) {
        const newProject = await res.json() as { id: string };
        navigate({ to: `/editor/${newProject.id}` });
      }
    } catch {
      // User can duplicate from dashboard if this fails.
    }
    // Dep was `router` under Next (from useRouter); the callback now closes over
    // `navigate` from useNavigate, so that is the correct dependency.
  }, [project, navigate]);

  const handleCreditsUpdate = useCallback((newCredits: number) => {
    setCredits(newCredits);
  }, []);

  const leftPanelTabs: { id: LeftPanel; label: string; emoji: string }[] = [
    { id: "chat",      label: "Chat",     emoji: "💬" },
    { id: "plan",      label: "Plan",     emoji: "🗺️" },
    { id: "agent",     label: "Agent",    emoji: "🤖" },
    { id: "intelligence", label: "Intelligence", emoji: "AI" },
    { id: "healing",   label: "Self-Heal", emoji: "🩹" },
    { id: "knowledge", label: "Knowledge",emoji: "🧠" },
    { id: "activity",  label: "Activity", emoji: "📋" },
    { id: "github",    label: "Git",      emoji: "🐙" },
    { id: "collab",    label: "Live",     emoji: "👥" },
    { id: "image",     label: "Image",    emoji: "🎨" },
    { id: "supabase",  label: "DB",       emoji: "🗄" },
    { id: "env",       label: "Env",      emoji: "🔑" },
    { id: "figma",     label: "Figma",    emoji: "🎭" },
    { id: "domains",   label: "Domains",  emoji: "🌐" },
    { id: "history",   label: "History",  emoji: "⏱️" },
    { id: "deploys",    label: "Deploys",    emoji: "🚀" },
    { id: "analytics",  label: "Analytics",  emoji: "📊" },
    { id: "security",   label: "Security",   emoji: "🔒" },
    { id: "settings",  label: "Settings", emoji: "⚙️" },
    { id: "search",     label: "Search",     emoji: "🔍" },
    { id: "components", label: "Components", emoji: "🧩" },
    { id: "design",     label: "Design",     emoji: "🖌️" },
    { id: "comments",   label: "Comments",   emoji: "💬" },
    { id: "crossref",   label: "Import",     emoji: "🔗" },
    { id: "email",      label: "Email",      emoji: "✉️" },
    { id: "testing",    label: "Testing",    emoji: "🧪" },
    { id: "guidance",   label: "Design AI",  emoji: "✨" },
    { id: "e2e",        label: "E2E Tests",  emoji: "🌐" },
    { id: "packages",   label: "Packages",   emoji: "📦" },
    { id: "review",     label: "Review",     emoji: "🔍" },
    { id: "mcp",        label: "MCP",        emoji: "🔌" },
    { id: "seo",        label: "SEO",        emoji: "📈" },
    { id: "customemail",label: "Emails",     emoji: "📧" },
    { id: "designdir",  label: "Design Dir", emoji: "🎯" },
    { id: "designpanel",  label: "Design",       emoji: "🖌️" },
    { id: "visualedits",   label: "Visual Edits", emoji: "✏️" },
    { id: "publishpanel",  label: "Publish",      emoji: "🚀" },
    { id: "payments",      label: "Billing",      emoji: "💳" },
    { id: "checkout",      label: "Checkout",     emoji: "🛍️" },
    { id: "problems",   label: "Problems",   emoji: "⚠️" },
    // Runtime errors real visitors hit on the PUBLISHED app, as opposed to
    // "Problems", which is Monaco's compile-time markers. The panel shipped
    // with no union member and no menu row, so it was unreachable.
    { id: "apperrors",  label: "App Errors", emoji: "🐞" },
    { id: "connectors", label: "Connectors", emoji: "🔗" },
    { id: "accessibility", label: "A11y", emoji: "♿" },
    { id: "schema",        label: "Schema",  emoji: "🗃️" },
    { id: "webhooks",      label: "Webhooks", emoji: "🪝" },
    { id: "performance",   label: "Perf",     emoji: "🚀" },
    { id: "i18n",          label: "i18n",     emoji: "🌍" },
    { id: "apidocs",       label: "API Docs",  emoji: "📄" },
    { id: "cloud",         label: "Cloud",     emoji: "☁️" },
    { id: "dbmanager",     label: "Data",      emoji: "🗃️" },
    { id: "storage",       label: "Storage",   emoji: "🗄️" },
    { id: "media",         label: "Media",     emoji: "🖼️" },
    { id: "appconnectors", label: "Connectors", emoji: "🔌" },
    { id: "mcpcontext",    label: "Context",    emoji: "🧠" },
    { id: "aeo",           label: "AEO",        emoji: "✨" },
    { id: "vulnscan",      label: "Security",   emoji: "🛡️" },
    { id: "dbseed",        label: "Seed DB",    emoji: "🌱" },
    { id: "monetize",      label: "Monetize",   emoji: "💰" },
    { id: "copygen",       label: "Copy",       emoji: "✍️" },
    { id: "feedback",      label: "Feedback",   emoji: "💬" },
    { id: "golive",        label: "Go Live",    emoji: "🚀" },
    { id: "nativeapps",    label: "Native Apps", emoji: "📲" },
    { id: "icongen",       label: "Icon Gen",   emoji: "🎨" },
    { id: "compmarket",    label: "Components", emoji: "📦" },
    { id: "pwa",           label: "PWA",        emoji: "📱" },
    { id: "edgefn",       label: "Edge Fns",   emoji: "⚡" },
    { id: "apiplay",      label: "API Test",   emoji: "🧪" },
    { id: "bundle",       label: "Bundle",     emoji: "📦" },
    { id: "formgen",      label: "Form Gen",   emoji: "📝" },
    { id: "flags",        label: "Feat Flags", emoji: "🚩" },
    { id: "changelog",    label: "Changelog",  emoji: "📋" },
    { id: "dbquery",      label: "DB Query",   emoji: "🔍" },
    { id: "routerwiz",    label: "Router",     emoji: "🗺️" },
    { id: "envhealth",    label: "Env Health", emoji: "🩺" },
    { id: "promptopt",    label: "Prompt Opt", emoji: "✨" },
    { id: "secrets",      label: "Secrets",    emoji: "🔐" },
    { id: "migrations",   label: "Migrations", emoji: "🔄" },
    { id: "modelcmp",     label: "Model Cmp",  emoji: "⚖️" },
    { id: "activityfeed", label: "Activity",     emoji: "🕐" },
    { id: "ownership",    label: "Ownership",    emoji: "🗺️" },
    { id: "configexport", label: "Config I/O",    emoji: "💾" },
    { id: "savetemplate", label: "Publish Template", emoji: "🌐" },
    { id: "diffviewer",   label: "Diff Viewer",      emoji: "🔀" },
    { id: "depgraph",     label: "Dep Graph",        emoji: "🕸️" },
    { id: "timelapse",       label: "Time-Lapse",   emoji: "🎬" },
    { id: "persona",         label: "AI Persona",   emoji: "🤖" },
    { id: "aiintegration",   label: "AI for App",   emoji: "⚡" },
  ];

  // Primary tabs shown inline in the left panel header; rest go into overflow dropdown
  const primaryTabs: { id: LeftPanel; label: string }[] = [
    { id: "chat",      label: "Chat"      },
    { id: "plan",      label: "Plan"      },
    { id: "agent",     label: "Agent"     },
    { id: "knowledge", label: "Knowledge" },
    { id: "activity",  label: "Activity"  },
  ];
  const overflowTabs = leftPanelTabs.filter((t) => !primaryTabs.find((p) => p.id === t.id));

  return (
    <div className="flex flex-col h-screen bg-background overflow-hidden">
      {/* File-to-app global drop zone */}
      <FileToAppDropZone
        disabled={isGenerating}
        onPromptReady={(prompt, imageBase64) => {
          setLeftPanel("chat");
          setPendingBuildFromFile({ prompt, imageBase64 });
        }}
      />
      {/* Focus mode exit button */}
      {focusMode && (
        <button
          onClick={() => setFocusMode(false)}
          className="fixed top-3 right-3 z-[300] flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-background/80 backdrop-blur border border-border text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-all shadow-lg"
          title="Exit Focus Mode (Escape)"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>
          Exit Focus
        </button>
      )}
      {!focusMode && (
        <EditorTopBar
          project={currentProject}
          editorMode={editorMode}
          viewMode={viewMode}
          credits={uiCredits}
          leftPanel={leftPanel}
          onModeChange={setEditorMode}
          onViewChange={(v) => {
            if (v === "files") {
              setShowFileTree(false);
              setRightPanel(null);
              setViewMode("files");
              return;
            }
            // Lovable parity: Preview / Files / Code always one click — no dev-mode gate.
            setViewMode(v);
          }}
          onLeftPanelChange={setLeftPanel}
          onToggleFileTree={() => {
            setShowFileTree(false);
            setViewMode("files");
            setRightPanel(null);
          }}
          isMobile={isMobile}
          onOpenShortcuts={() => setShortcutsOpen(true)}
          showFileTree={showFileTree}
          profile={profile}
          lastSaved={lastSaved}
          onRename={(name) => handleProjectUpdate({ name })}
          onProjectUpdate={handleProjectUpdate}
          onDuplicate={() => void handleDuplicateProject()}
          devMode={devMode}
          onDevModeToggle={handleDevModeToggle}
          onEnvironmentChange={setEnvironment}
          rightPanel={rightPanel}
          onRightPanelChange={(p) => setRightPanel(p)}
          securityIssueCount={securityIssueCount}
          criticalSecurityCount={criticalSecurityCount}
          chatOverlayActive={leftChatOverlay === "history"}
          onChatOverlayToggle={() => {
            setLeftChatOverlay((h) => (h === "history" ? null : "history"));
            setRightPanel(null);
          }}
          chatCollapsed={chatSidebarCollapsed}
          chatNavWidthPercent={chatSidebarCollapsed ? 0 : chatPanelSizePercent}
          onToggleChatSidebar={() => {
            const panel = chatPanelRef.current;
            if (!panel) {
              setChatSidebarCollapsed((v) => !v);
              return;
            }
            if (panel.isCollapsed()) {
              panel.expand();
              setChatSidebarCollapsed(false);
            } else {
              panel.collapse();
              setChatSidebarCollapsed(true);
            }
          }}
          versionPreviewLabel={previewVersion?.label ?? null}
        />
      )}
      {!focusMode && <EditorPaymentBanner profile={profile} credits={uiCredits} />}
      {process.env.NODE_ENV === "development" && (
        <div className="shrink-0 px-3 py-1.5 flex items-center justify-center gap-3 text-[11px] bg-amber-500/15 border-b border-amber-500/25 text-amber-800 dark:text-amber-300">
          {simulateZeroCredits ? (
            <span>Simulating 0 credits — preview/chat use zero-credit UX</span>
          ) : (
            <span>Dev: test zero-credits UX without spending credits</span>
          )}
          <button
            type="button"
            onClick={grantDevCredits}
            className="rounded px-2.5 py-0.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-800 dark:text-emerald-200 font-medium transition-colors"
          >
            Grant 100 credits
          </button>
          <button
            type="button"
            onClick={toggleSimulateZeroCredits}
            className="rounded px-2.5 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-800 dark:text-amber-200 font-medium transition-colors"
          >
            {simulateZeroCredits ? "Exit simulation" : "Simulate 0 credits"}
          </button>
        </div>
      )}

      {/* ── Mobile layout (Lovable-style: chat-only left, tools via overlays) ─
          Mount ONLY one tree — keeping desktop mounted under `hidden` on mobile
          doubled ChatPanel/PreviewPanel (abort races + duplicate refresh listeners). */}
      {isMobile ? (
        <>
          <div className="flex-1 overflow-hidden relative">
            {/* Chat pane — always chat-only, no emoji tab strip */}
            <div className={`absolute inset-0 flex flex-col ${mobilePaneActive === "left" ? "" : "hidden"}`}>
              <div className="relative flex-1 overflow-hidden">
                <ChatPanel
                  project={currentProject}
                  files={files}
                  messages={messages}
                  activeFile={activeFile}
                  mode={editorMode}
                  credits={uiCredits}
                  starterPrompt={starterPrompt}
                  hasMoreMessages={hasMoreMessages}
                  isMessagesLoading={messagesHydrating}
                  previewError={previewError}
                  previewRuntimeErrors={previewRuntimeErrors}
                  pendingFixPrompt={pendingFix}
                  pendingFileRef={pendingFileRef}
                  onMessagesUpdate={handleMessagesUpdate}
                  onFilesUpdate={handleFilesUpdate}
                  onCreditsUpdate={handleCreditsUpdate}
                  onProjectUpdate={handleProjectUpdate}
                  onAutoFixComplete={() => {
                    setPreviewError(null);
                    setPreviewRuntimeErrors(EMPTY_PREVIEW_ERRORS);
                  }}
                  onPendingFixConsumed={() => setPendingFix(null)}
                  onPendingFileRefConsumed={() => setPendingFileRef(null)}
                  onStreamingChange={(s, fc) => { setIsGenerating(s); if (fc !== undefined) setGeneratingFileCount(fc); }}
                  onModeChange={setEditorMode}
                  pendingBuildFromFile={pendingBuildFromFile}
                  onPendingBuildFromFileConsumed={() => setPendingBuildFromFile(null)}
                  isLocked={isLiveLocked}
                  onApprovePlan={handleApprovePlan}
                  onOpenPanel={handleOpenPanel}
                  onFocusPreview={handleFocusPreview}
                  onVisualEditToggle={() => setIsVisualEditActive((v) => !v)}
                  isVisualEditActive={isVisualEditActive}
                  isMobile={isMobile}
                  securityIssueCount={securityIssueCount}
                />
                {leftChatOverlay === "history" && (
                  <div className="absolute inset-0 z-10 flex flex-col bg-background">
                    <LovableOverlayHeader title="History" onClose={() => setLeftChatOverlay(null)} />
                    <div className="flex-1 overflow-hidden">
                      <HistoryPanel
                        projectId={currentProject.id}
                        onRestore={(snapshotFiles) => {
                          setFiles(snapshotFiles);
                          filesRef.current = snapshotFiles;
                          setActiveFile(snapshotFiles[0] ?? null);
                          setLeftChatOverlay(null);
                          window.dispatchEvent(new CustomEvent("lifemark-preview-reverting"));
                          window.dispatchEvent(new CustomEvent("lifemark-refresh-preview", {
                            detail: { files: snapshotFiles, reason: "history-restore" },
                          }));
                          handleFocusPreview();
                        }}
                        onCompare={(oldId, newId) => {
                          window.dispatchEvent(new CustomEvent("lifemark-open-diff", {
                            detail: { oldSnapshotId: oldId, newSnapshotId: newId, projectId: currentProject.id },
                          }));
                          setLeftChatOverlay(null);
                          handleOpenPanel("diffviewer");
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Code / Files pane */}
            <div className={`absolute inset-0 ${mobilePaneActive === "files" ? "" : "hidden"}`}>
              {viewMode === "files" ? (
                <LovableFilesViewPane
                  files={files}
                  activeFile={activeFile}
                  projectId={project.id}
                  onFileSelect={setActiveFile}
                  onFilesChange={handleFilesUpdate}
                  onSave={handleCodeSave}
                  onChange={handleCodeChange}
                  collabUser={collabUser}
                  onCollaboratorsChange={setYjsCollaborators}
                />
              ) : (
              <CodePanel
                file={activeFile} files={files} projectId={project.id}
                onSave={handleCodeSave} onChange={handleCodeChange}
                onFileChange={setActiveFile}
                collabUser={collabUser}
                onCollaboratorsChange={setYjsCollaborators}
                onReferenceInChat={(f) => { setPendingFileRef(f); setMobilePaneActive("left"); setLeftPanel("chat"); }}
              />
              )}
            </div>

            {/* Preview pane */}
            <div className={`absolute inset-0 ${mobilePaneActive === "preview" ? "" : "hidden"}`}>
              <PreviewPanel
                files={previewVersion?.files ?? files}
                framework={project.framework}
                runtime={project.runtime}
                versionPreviewLabel={previewVersion?.label ?? null}
                hideTopChrome
                activeFile={activeFile}
                isVisualEditActive={isVisualEditActive}
                onVisualEditToggle={() => setIsVisualEditActive((v) => !v)}
                onFileUpdate={handleFileUpdate}
                onError={setPreviewError}
                onErrorReport={handlePreviewErrorReport}
                onFixWithAI={handleFixWithAI}
                onSendPromptToChat={(p) => {
                  setMobilePaneActive("left");
                  sendPromptToChat(p);
                }}
                isGenerating={isGenerating}
                generatingFileCount={generatingFileCount}
                deployedUrl={project.deployed_url ?? undefined}
                badgeHidden={(project as { badge_hidden?: boolean }).badge_hidden ?? false}
                projectId={project.id}
                credits={uiCredits}
                useWebContainers={false}
                isPublic={!!project.is_public}
                onOpenPanel={handleOpenPanel}
                onSendAnnotatedToChat={(prompt, img) => { setMobilePaneActive("left"); setLeftPanel("chat"); setPendingBuildFromFile({ prompt, imageBase64: img }); }}
              />
            </div>

            {/* Tool panel overlay — same as desktop right-side panels */}
            {rightPanel && (
              <div className="absolute inset-0 z-20 flex flex-col bg-background">
                {isLovableToolPanel(rightPanel) ? (
                  <LovableToolsOverlay
                    activeTab={rightPanel}
                    onTabChange={(tab) => setRightPanel(tab)}
                    onClose={() => setRightPanel(null)}
                  >
                    <LazyLovablePanel
                      rightPanel={rightPanel}
                      currentProject={currentProject}
                      profile={profile}
                      files={files}
                      pid={pid}
                      setRightPanel={setRightPanel}
                      handleFilesUpdate={handleFilesUpdate}
                      sendPromptToChat={sendPromptToChat}
                    />
                  </LovableToolsOverlay>
                ) : (
                  <>
                    <div className="flex items-center justify-between px-4 h-9 border-b border-border shrink-0">
                      <span className="text-xs font-semibold text-foreground">
                        {leftPanelTabs.find((t) => t.id === rightPanel)?.label ?? rightPanel}
                      </span>
                      <button
                        onClick={() => setRightPanel(null)}
                        className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                      </button>
                    </div>
                    <div className="flex-1 overflow-hidden">
                      <LazySecondaryPanel
                        rightPanel={rightPanel}
                        project={project}
                        currentProject={currentProject}
                        profile={profile}
                        files={files}
                        activeFile={activeFile}
                        pid={pid}
                        projectSlug={projectSlug}
                        credits={uiCredits}
                        isLiveLocked={isLiveLocked}
                        yjsCollaborators={yjsCollaborators}
                        setRightPanel={setRightPanel}
                        setViewMode={setViewMode}
                        setActiveFile={setActiveFile}
                        setFiles={setFiles}
                        setEditorMode={setEditorMode}
                        setPendingCrossRefPrompt={setPendingCrossRefPrompt}
                        handleProjectUpdate={handleProjectUpdate}
                        handleFilesUpdate={handleFilesUpdate}
                        handleFileUpdate={handleFileUpdate}
                        handleEnvUpdateFile={handleEnvUpdateFile}
                        handleCreditsUpdate={handleCreditsUpdate}
                        sendPromptToChat={sendPromptToChat}
                      />
                    </div>
                  </>
                )}
              </div>
            )}
          </div>

          {/* Mobile bottom nav */}
          <div className="flex items-stretch border-t border-border bg-background/95 backdrop-blur shrink-0 h-14 safe-area-pb">
            {(["left", "files", "preview"] as const).map((pane) => {
              const config = {
                left:    { label: "Chat" },
                files:   { label: "Files" },
                preview: { label: "Preview" },
              }[pane];
              const isActive = mobilePaneActive === pane;
              return (
                <button
                  key={pane}
                  aria-label={config.label}
                  onClick={() => {
                    setRightPanel(null);
                    setLeftChatOverlay(null);
                    setMobilePaneActive(pane);
                    if (pane === "left") setLeftPanel("chat");
                    if (pane === "files") setViewMode("files");
                    if (pane === "preview") setViewMode("preview");
                  }}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition-all relative ${
                    isActive ? "text-primary" : "text-muted-foreground active:text-foreground"
                  }`}
                >
                  {isActive && (
                    <span className="absolute top-0 left-1/4 right-1/4 h-0.5 rounded-full bg-primary" />
                  )}
                  <span className={`leading-none transition-transform ${isActive ? "font-semibold" : ""}`}>
                    {config.label}
                  </span>
                </button>
              );
            })}
          </div>
        </>
      ) : (
      /* ── Desktop layout ──────────────────────────────────────────────────── */
      <div className="flex-1 overflow-hidden">
        <PanelGroup direction="horizontal" autoSaveId={`lifemark-editor-split-v3-${pid}`} className="h-full">
          {/* Left Panel — Chat only (Lovable-style) */}
          <Panel
            ref={chatPanelRef}
            defaultSize={22}
            minSize={14}
            maxSize={50}
            collapsedSize={0}
            id="sidebar-panel"
            style={focusMode ? { display: "none" } : undefined}
            collapsible
            onCollapse={() => setChatSidebarCollapsed(true)}
            onExpand={() => setChatSidebarCollapsed(false)}
            onResize={(size) => setChatPanelSizePercent(size)}
          >
            <div
              data-panel-id="sidebar-panel"
              className="relative flex flex-col h-full border-r border-border bg-background"
            >
              <ChatPanel
                project={currentProject}
                files={files}
                messages={messages}
                activeFile={activeFile}
                mode={editorMode}
                credits={uiCredits}
                starterPrompt={starterPrompt}
                hasMoreMessages={hasMoreMessages}
                isMessagesLoading={messagesHydrating}
                previewError={previewError}
                previewRuntimeErrors={previewRuntimeErrors}
                pendingFixPrompt={pendingFix}
                pendingFileRef={pendingFileRef}
                onMessagesUpdate={handleMessagesUpdate}
                onFilesUpdate={handleFilesUpdate}
                onCreditsUpdate={handleCreditsUpdate}
                onProjectUpdate={handleProjectUpdate}
                onAutoFixComplete={() => {
                  setPreviewError(null);
                  setPreviewRuntimeErrors(EMPTY_PREVIEW_ERRORS);
                }}
                onPendingFixConsumed={() => setPendingFix(null)}
                onPendingFileRefConsumed={() => setPendingFileRef(null)}
                onStreamingChange={(s, fc) => { setIsGenerating(s); if (fc !== undefined) setGeneratingFileCount(fc); }}
                onModeChange={setEditorMode}
                pendingBuildFromFile={pendingBuildFromFile}
                onPendingBuildFromFileConsumed={() => setPendingBuildFromFile(null)}
                isLocked={isLiveLocked}
                onApprovePlan={handleApprovePlan}
                onOpenPanel={handleOpenPanel}
                onFocusPreview={handleFocusPreview}
                onVisualEditToggle={() => setIsVisualEditActive((v) => !v)}
                isVisualEditActive={isVisualEditActive}
                securityIssueCount={securityIssueCount}
              />
              {leftChatOverlay === "history" && (
                <div className="absolute inset-0 z-10 flex flex-col bg-background">
                  <LovableOverlayHeader title="History" onClose={() => setLeftChatOverlay(null)} />
                  <div className="flex-1 overflow-hidden">
                    <HistoryPanel
                      projectId={currentProject.id}
                      onRestore={(snapshotFiles) => {
                        setFiles(snapshotFiles);
                        filesRef.current = snapshotFiles;
                        setActiveFile(snapshotFiles[0] ?? null);
                        setLeftChatOverlay(null);
                        window.dispatchEvent(new CustomEvent("lifemark-preview-reverting"));
                        window.dispatchEvent(new CustomEvent("lifemark-refresh-preview", {
                          detail: { files: snapshotFiles, reason: "history-restore" },
                        }));
                        handleFocusPreview();
                      }}
                      onCompare={(oldId, newId) => {
                        window.dispatchEvent(new CustomEvent("lifemark-open-diff", {
                          detail: { oldSnapshotId: oldId, newSnapshotId: newId, projectId: currentProject.id },
                        }));
                        setLeftChatOverlay(null);
                        handleOpenPanel("diffviewer");
                      }}
                    />
                  </div>
                </div>
              )}
            </div>
          </Panel>

          {/* File tree (collapsible) */}
          {showFileTree && !focusMode && viewMode !== "files" && false && (
            <>
              <PanelResizeHandle className="w-px bg-border hover:bg-primary/50 transition-colors cursor-col-resize" />
              <Panel defaultSize={15} minSize={10} maxSize={30} id="filetreepanel">
                <div className="h-full border-r border-border">
                  <FileTreePanel
                    files={files}
                    activeFile={activeFile}
                    projectId={project.id}
                    onFileSelect={setActiveFile}
                    onFilesChange={handleFilesUpdate}
                  />
                </div>
              </Panel>
            </>
          )}

          <PanelResizeHandle className="w-px bg-border hover:bg-primary/50 transition-colors cursor-col-resize" />

          {/* Right panel — preview/code or secondary panel */}
          <Panel defaultSize={77.7} minSize={30} id="preview-panel">
            <div data-panel-id="preview-panel" className="flex flex-col h-full relative">
              {/* Secondary panel overlay — shown when a tool panel is active */}
              {rightPanel && (
                <div className="absolute inset-0 z-10 flex flex-col bg-background border-l border-border">
                  {isLovableToolPanel(rightPanel) ? (
                    <LovableToolsOverlay
                      activeTab={rightPanel}
                      onTabChange={(tab) => setRightPanel(tab)}
                      onClose={() => setRightPanel(null)}
                    >
                      <LazyLovablePanel
                        rightPanel={rightPanel}
                        currentProject={currentProject}
                        profile={profile}
                        files={files}
                        pid={pid}
                        setRightPanel={setRightPanel}
                        handleFilesUpdate={handleFilesUpdate}
                        sendPromptToChat={sendPromptToChat}
                      />
                    </LovableToolsOverlay>
                  ) : (
                    <>
                  <div className="flex items-center justify-between px-4 h-9 border-b border-border shrink-0">
                    <span className="text-xs font-semibold text-foreground">
                      {leftPanelTabs.find((t) => t.id === rightPanel)?.label ?? rightPanel}
                    </span>
                    <button
                      onClick={() => setRightPanel(null)}
                      className="flex items-center justify-center w-6 h-6 rounded hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                    </button>
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <LazySecondaryPanel
                      rightPanel={rightPanel}
                      project={project}
                      currentProject={currentProject}
                      profile={profile}
                      files={files}
                      activeFile={activeFile}
                      pid={pid}
                      projectSlug={projectSlug}
                      credits={uiCredits}
                      isLiveLocked={isLiveLocked}
                      yjsCollaborators={yjsCollaborators}
                      setRightPanel={setRightPanel}
                      setViewMode={setViewMode}
                      setActiveFile={setActiveFile}
                      setFiles={setFiles}
                      setEditorMode={setEditorMode}
                      setPendingCrossRefPrompt={setPendingCrossRefPrompt}
                      handleProjectUpdate={handleProjectUpdate}
                      handleFilesUpdate={handleFilesUpdate}
                      handleFileUpdate={handleFileUpdate}
                      handleEnvUpdateFile={handleEnvUpdateFile}
                      handleCreditsUpdate={handleCreditsUpdate}
                      sendPromptToChat={sendPromptToChat}
                    />
                  </div>
                    </>
                  )}
                </div>
              )}

              {/* Preview / code / files — panes stay mounted; visibility toggled via CSS */}
              {viewMode === "files" ? (
                <LovableFilesViewPane
                  files={files}
                  activeFile={activeFile}
                  projectId={project.id}
                  onFileSelect={setActiveFile}
                  onFilesChange={handleFilesUpdate}
                  onSave={handleCodeSave}
                  onChange={handleCodeChange}
                  collabUser={collabUser}
                  onCollaboratorsChange={setYjsCollaborators}
                />
              ) : (
              <PanelGroup direction="horizontal" className="min-h-0 flex-1">
                <Panel
                  defaultSize={50}
                  minSize={20}
                  id="preview-frame"
                  style={viewMode === "code" ? { display: "none" } : undefined}
                >
                  <PreviewPanel
                    files={previewVersion?.files ?? files}
                    framework={project.framework}
                    runtime={project.runtime}
                    versionPreviewLabel={previewVersion?.label ?? null}
                    hideTopChrome
                    projectId={pid}
                    activeFile={activeFile}
                    isVisualEditActive={isVisualEditActive}
                    onVisualEditToggle={() => setIsVisualEditActive((v) => !v)}
                    onFileUpdate={handleFileUpdate}
                    isGenerating={isGenerating}
                    generatingFileCount={generatingFileCount}
                    onError={setPreviewError}
                    onErrorReport={handlePreviewErrorReport}
                    onFixWithAI={handleFixWithAI}
                    onSendPromptToChat={sendPromptToChat}
                    deployedUrl={currentProject.deployed_url ?? undefined}
                    badgeHidden={(currentProject as { badge_hidden?: boolean }).badge_hidden ?? false}
                    credits={uiCredits}
                    useWebContainers={false}
                    isPublic={!!currentProject.is_public}
                    onOpenPanel={handleOpenPanel}
                    onSendAnnotatedToChat={(prompt, img) => {
                      setPendingBuildFromFile({ prompt, imageBase64: img });
                      setLeftPanel("chat");
                    }}
                  />
                </Panel>
                <PanelResizeHandle
                  className={`w-px bg-border transition-colors hover:bg-primary/50 ${
                    viewMode === "both" ? "cursor-col-resize" : "hidden"
                  }`}
                />
                <Panel
                  defaultSize={50}
                  minSize={20}
                  id="codepanel"
                  style={viewMode === "preview" ? { display: "none" } : undefined}
                >
                  <div className="flex h-full min-h-0 min-w-0 flex-col">
                    {activeFile && (
                      <div className="flex items-center gap-2 px-3 h-8 border-b border-border shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setShowFileTree(false);
                            setViewMode("files");
                            setRightPanel(null);
                          }}
                          className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                        >
                          Browse files
                        </button>
                        <span className="text-[10px] font-mono text-muted-foreground truncate">{activeFile.path}</span>
                      </div>
                    )}
                    <div className="flex-1 min-h-0">
                      <CodePanel
                        file={activeFile}
                        files={files}
                        projectId={project.id}
                        onSave={handleCodeSave}
                        onChange={handleCodeChange}
                        onFileChange={setActiveFile}
                        collabUser={collabUser}
                        onCollaboratorsChange={setYjsCollaborators}
                      />
                    </div>
                  </div>
                </Panel>
              </PanelGroup>
              )}
            </div>
          </Panel>
        </PanelGroup>
      </div>
      )}

      {/* Shortcuts modal */}
      <ShortcutsModal open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      {/* Annotate modal */}
      {annotateOpen && annotateImage && (
        <PreviewAnnotateModal
          screenshotDataUrl={annotateImage}
          onClose={() => { setAnnotateOpen(false); setAnnotateImage(null); }}
          onSend={(annotated, note) => {
            setAnnotateOpen(false);
            setAnnotateImage(null);
            setPendingBuildFromFile({ prompt: note ?? "Fix the issues shown in the screenshot.", imageBase64: annotated });
            setLeftPanel("chat");
          }}
        />
      )}
      <CommandPalette
        projects={[{ id: currentProject.id, name: currentProject.name, framework: currentProject.framework }]}
        files={files}
        actions={commandPaletteActions}
      />
      <LovableLiveTasksDock />
    </div>
  );
}
