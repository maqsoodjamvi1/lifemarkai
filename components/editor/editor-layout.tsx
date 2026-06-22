"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { countFindings } from "@/lib/security/static-scan";
import { useIsMobile } from "@/hooks/use-is-mobile";
import dynamic from "next/dynamic";
import { importWithRetry } from "@/lib/import-with-retry";
import { PanelGroup, Panel, PanelResizeHandle } from "react-resizable-panels";
import {
  ChevronDown, MessageSquare, Sparkles, Bot, FolderOpen, GitBranch,
  Brain, Database, FlaskConical, Rocket, BarChart2,
  Search, Settings, MoreHorizontal, Globe, Image, Plug,
  Shield, Palette, Users, Zap,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { EditorTopBar } from "./editor-top-bar";
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
import type { Project, ProjectFile, Message, Profile } from "@/types/database";
import {
  pickActiveFileAfterUpdate,
  resolvePromptMode,
  shouldFocusPreviewAfterGeneration,
  inferProjectStage,
} from "@/lib/ai/editor-intelligence";

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
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-muted-foreground text-sm">Loading chat...</div>
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
export type ViewMode = "preview" | "code" | "both";
export type LeftPanel = "chat" | "plan" | "agent" | "company" | "activity" | "github" | "collab" | "supabase" | "env" | "image" | "figma" | "domains" | "history" | "deploys" | "analytics" | "knowledge" | "security" | "settings" | "search" | "components" | "design" | "comments" | "crossref" | "email" | "testing" | "guidance" | "e2e" | "packages" | "review" | "mcp" | "seo" | "customemail" | "designdir" | "designpanel" | "visualedits" | "publishpanel" | "payments" | "checkout" | "problems" | "connectors" | "accessibility" | "schema" | "webhooks" | "performance" | "i18n" | "apidocs" | "cloud" | "storage" | "appconnectors" | "mcpcontext" | "aeo" | "vulnscan" | "dbseed" | "monetize" | "copygen" | "feedback" | "golive" | "nativeapps" | "icongen" | "compmarket" | "pwa" | "edgefn" | "apiplay" | "bundle" | "formgen" | "flags" | "changelog" | "dbquery" | "routerwiz" | "envhealth" | "promptopt" | "secrets" | "migrations" | "modelcmp" | "persona" | "activityfeed" | "ownership" | "configexport" | "savetemplate" | "diffviewer" | "depgraph" | "timelapse" | "aiintegration" | "appauth" | "designsystem" | "code";

interface EditorLayoutProps {
  project: Project;
  initialFiles: ProjectFile[];
  initialMessages: Message[];
  profile: Profile | null;
  starterPrompt?: string;
  starterMode?: EditorMode;
  autoDeploy?: boolean;
}

export function EditorLayout({ project, initialFiles, initialMessages, profile, starterPrompt, starterMode, autoDeploy }: EditorLayoutProps) {
  // Record this project visit for the dashboard "Recently visited" rail
  useRecordProjectVisit({ id: project.id, name: project.name, framework: project.framework ?? "react" });

  const [files, setFiles] = useState<ProjectFile[]>(initialFiles);
  // Static security-issue count for the publish dropdown's "Review security" badge
  // (matches Lovable's red number badge). Recomputes whenever files change; cheap
  // enough to run inline since staticScan is a single linear regex pass.
  const securityIssueCount = useMemo(() => countFindings(files), [files]);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [activeFile, setActiveFile] = useState<ProjectFile | null>(
    initialFiles.find((f) => f.path === "app/page.tsx" || f.path === "src/App.tsx" || f.path === "index.html") ||
      initialFiles[0] ||
      null
  );
  const [editorMode, setEditorMode] = useState<EditorMode>(() => {
    if (starterMode) return starterMode;
    if (starterPrompt) {
      return resolvePromptMode(starterPrompt, {
        fileCount: initialFiles.length,
        hasPreviewError: false,
        framework: project.framework,
        currentMode: "build",
        files: initialFiles,
      });
    }
    // Default to Build mode everywhere (incremental edits + restyle live here).
    // Agent stays available as an explicit choice for autonomous multi-step runs.
    return "build";
  });
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [leftPanel, setLeftPanel] = useState<LeftPanel>("chat");
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
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [pendingFix, setPendingFix] = useState<string | null>(null);
  const [pendingComponentPrompt, setPendingComponentPrompt] = useState<string | null>(null);
  const [pendingCrossRefPrompt, setPendingCrossRefPrompt] = useState<string | null>(null);
  const [pendingBuildFromFile, setPendingBuildFromFile] = useState<{ prompt: string; imageBase64?: string } | null>(null);
  const [pendingConnectorPrompt, setPendingConnectorPrompt] = useState<string | null>(null);
  const [pendingFileRef, setPendingFileRef] = useState<import("@/types/database").ProjectFile | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingFileCount, setGeneratingFileCount] = useState(0);
  const [yjsCollaborators, setYjsCollaborators] = useState<import("@/hooks/use-yjs-editor").Collaborator[]>([]);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);

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
  // Mobile: which pane is visible — "left" | "code" | "preview"
  const [mobilePaneActive, setMobilePaneActive] = useState<"left" | "code" | "preview">("left");
  // useIsMobile() replaces the inline window.innerWidth check that used to live
  // here. Same 768px breakpoint, but the hook also reports pointer:coarse and
  // standalone-PWA state for downstream consumers.
  const { isMobile } = useIsMobile();
  const [annotateOpen, setAnnotateOpen] = useState(false);
  const [annotateImage, setAnnotateImage] = useState<string | null>(null);

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
    setRightPanel(null);
    setLeftChatOverlay(null);
    setViewMode("preview");
    if (isMobile) setMobilePaneActive("preview");
    window.dispatchEvent(new CustomEvent("lifemark-refresh-preview"));
  }, [isMobile]);

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

      // View mode: ⌘1 preview, ⌘2 code, ⌘3 both
      if (e.key === "1") { e.preventDefault(); setViewMode("preview"); }
      if (e.key === "2") { e.preventDefault(); setViewMode("code"); }
      if (e.key === "3") { e.preventDefault(); setViewMode("both"); }

      // Toggle file tree: ⌘\
      if (e.key === "\\") { e.preventDefault(); setShowFileTree((v) => !v); }

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

  const handleFileSelect = useCallback((file: ProjectFile) => {
    setActiveFile(file);
    // On mobile, open code pane when a file is selected
    if (isMobile) setMobilePaneActive("code");
  }, [isMobile]);

  const handleFileUpdate = useCallback((updatedFile: ProjectFile) => {
    setFiles((prev) => prev.map((f) => (f.id === updatedFile.id ? updatedFile : f)));
    setActiveFile((prev) => (prev?.id === updatedFile.id ? updatedFile : prev));

    // Persist visual edits / inline updates (Lovable parity — WYSIWYG survives refresh)
    if (updatedFile.path && updatedFile.content !== undefined) {
      void fetch(`/api/projects/${project.id}/files`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          path: updatedFile.path,
          content: updatedFile.content,
          language: updatedFile.language,
        }),
      }).catch(() => {});
    }
  }, [project.id]);

  const handleFilesUpdate = useCallback((updatedFiles: ProjectFile[]) => {
    setFiles((prev) => {
      const map = new Map(prev.map((f) => [f.path, f]));
      const changedPaths: string[] = [];
      updatedFiles.forEach((f) => {
        const existing = map.get(f.path);
        if (!existing || existing.content !== f.content) changedPaths.push(f.path);
        map.set(f.path, f);
      });
      const next = Array.from(map.values());

      if (changedPaths.length > 0) {
        queueMicrotask(() => {
          setActiveFile((current) => pickActiveFileAfterUpdate(next, changedPaths, current) ?? current);
          if (shouldFocusPreviewAfterGeneration(editorMode, changedPaths.length)) {
            handleFocusPreview();
          }
        });
      }

      return next;
    });
    if (isMobile && updatedFiles.length > 0) setMobilePaneActive("preview");
  }, [editorMode, handleFocusPreview, isMobile]);

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

  const handleCodeChange = useCallback(
    async (content: string) => {
      if (!activeFile) return;
      const updated = { ...activeFile, content };
      setActiveFile(updated);
      setFiles((prev) => prev.map((f) => (f.id === activeFile.id ? updated : f)));
      try {
        const res = await fetch(`/api/projects/${project.id}/files`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: activeFile.id, content }),
        });
        if (res.ok) setLastSaved(new Date());
      } catch (e) {
        console.error("Save failed:", e);
      }
    },
    [activeFile, project.id]
  );

  const pid = currentProject.id;
  const projectSlug = (currentProject as { slug?: string | null }).slug ?? pid;
  const sendPromptToChat = useCallback((p: string) => {
    setPendingCrossRefPrompt(p);
    setRightPanel(null);
  }, []);

  // Sync top-bar preview/code toggles with mobile bottom-nav panes
  useEffect(() => {
    if (!isMobile || rightPanel || leftChatOverlay) return;
    if (viewMode === "code") setMobilePaneActive("code");
    else setMobilePaneActive("preview");
  }, [isMobile, viewMode, rightPanel, leftChatOverlay]);

  const handleEnvUpdateFile = useCallback((path: string, content: string) => {
    setFiles((prev) => prev.map((f) => (f.path === path ? { ...f, content } : f)));
    setActiveFile((prev) => (prev?.path === path ? { ...prev, content } : prev));
  }, []);

  const handleMessagesUpdate = useCallback((newMessages: Message[]) => {
    setMessages(newMessages);
  }, []);

  const handleCreditsUpdate = useCallback((newCredits: number) => {
    setCredits(newCredits);
  }, []);

  const leftPanelTabs: { id: LeftPanel; label: string; emoji: string }[] = [
    { id: "chat",      label: "Chat",     emoji: "💬" },
    { id: "plan",      label: "Plan",     emoji: "🗺️" },
    { id: "agent",     label: "Agent",    emoji: "🤖" },
    { id: "company",   label: "Company",  emoji: "AI" },
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
    { id: "connectors", label: "Connectors", emoji: "🔗" },
    { id: "accessibility", label: "A11y", emoji: "♿" },
    { id: "schema",        label: "Schema",  emoji: "🗃️" },
    { id: "webhooks",      label: "Webhooks", emoji: "🪝" },
    { id: "performance",   label: "Perf",     emoji: "🚀" },
    { id: "i18n",          label: "i18n",     emoji: "🌍" },
    { id: "apidocs",       label: "API Docs",  emoji: "📄" },
    { id: "cloud",         label: "Cloud",     emoji: "☁️" },
    { id: "storage",       label: "Storage",   emoji: "🗄️" },
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
          onViewChange={(v) => { if (devMode || v === "preview") setViewMode(v); }}
          onLeftPanelChange={setLeftPanel}
          onToggleFileTree={() => setShowFileTree((v) => !v)}
          onOpenShortcuts={() => setShortcutsOpen(true)}
          showFileTree={showFileTree}
          profile={profile}
          lastSaved={lastSaved}
          onRename={(name) => handleProjectUpdate({ name })}
          devMode={devMode}
          onDevModeToggle={handleDevModeToggle}
          onEnvironmentChange={setEnvironment}
          rightPanel={rightPanel}
          onRightPanelChange={(p) => setRightPanel(p)}
          securityIssueCount={securityIssueCount}
          chatOverlayActive={leftChatOverlay === "history"}
          onChatOverlayToggle={() => {
            setLeftChatOverlay((h) => (h === "history" ? null : "history"));
            setRightPanel(null);
          }}
        />
      )}
      {!focusMode && <EditorPaymentBanner profile={profile} credits={uiCredits} />}
      {process.env.NODE_ENV === "development" && (
        <div className="shrink-0 px-3 py-1.5 flex items-center justify-center gap-3 text-[11px] bg-amber-500/15 border-b border-amber-500/25 text-amber-300">
          {simulateZeroCredits ? (
            <span>Simulating 0 credits — preview/chat use zero-credit UX</span>
          ) : (
            <span>Dev: test zero-credits UX without spending credits</span>
          )}
          <button
            type="button"
            onClick={grantDevCredits}
            className="rounded px-2.5 py-0.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-200 font-medium transition-colors"
          >
            Grant 100 credits
          </button>
          <button
            type="button"
            onClick={toggleSimulateZeroCredits}
            className="rounded px-2.5 py-0.5 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 text-amber-200 font-medium transition-colors"
          >
            {simulateZeroCredits ? "Exit simulation" : "Simulate 0 credits"}
          </button>
        </div>
      )}

      {/* ── Mobile layout (Lovable-style: chat-only left, tools via overlays) ─ */}
      {isMobile && (
        <>
          <div className="flex-1 overflow-hidden relative">
            {/* Chat pane — always chat-only, no emoji tab strip */}
            <div className={`absolute inset-0 flex flex-col ${mobilePaneActive === "left" ? "" : "hidden"}`}>
              <div className="relative flex-1 overflow-hidden">
                <ChatPanel
                  project={project}
                  files={files}
                  messages={messages}
                  activeFile={activeFile}
                  mode={editorMode}
                  credits={uiCredits}
                  starterPrompt={pendingConnectorPrompt ?? pendingComponentPrompt ?? starterPrompt}
                  previewError={previewError}
                  pendingFixPrompt={pendingFix}
                  pendingFileRef={pendingFileRef}
                  onMessagesUpdate={handleMessagesUpdate}
                  onFilesUpdate={handleFilesUpdate}
                  onCreditsUpdate={handleCreditsUpdate}
                  onAutoFixComplete={() => setPreviewError(null)}
                  onPendingFixConsumed={() => setPendingFix(null)}
                  onPendingFileRefConsumed={() => setPendingFileRef(null)}
                  onStreamingChange={(s, fc) => { setIsGenerating(s); if (fc !== undefined) setGeneratingFileCount(fc); }}
                  onModeChange={setEditorMode}
                  pendingBuildFromFile={pendingBuildFromFile}
                  onPendingBuildFromFileConsumed={() => setPendingBuildFromFile(null)}
                  isLocked={isLiveLocked}
                  onApprovePlan={() => {
                    setEditorMode("build");
                    handleFocusPreview();
                  }}
                  onOpenPanel={handleOpenPanel}
                  onFocusPreview={handleFocusPreview}
                />
                {leftChatOverlay === "history" && (
                  <div className="absolute inset-0 z-10 flex flex-col bg-background">
                    <LovableOverlayHeader title="History" onClose={() => setLeftChatOverlay(null)} />
                    <div className="flex-1 overflow-hidden">
                      <HistoryPanel
                        projectId={currentProject.id}
                        onRestore={(snapshotFiles) => {
                          setFiles(snapshotFiles);
                          setActiveFile(snapshotFiles[0] ?? null);
                          setLeftChatOverlay(null);
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

            {/* Code pane */}
            <div className={`absolute inset-0 ${mobilePaneActive === "code" ? "" : "hidden"}`}>
              <CodePanel
                file={activeFile} files={files} projectId={project.id}
                onSave={handleCodeChange} onChange={handleCodeChange}
                collabUser={collabUser}
                onCollaboratorsChange={setYjsCollaborators}
                onReferenceInChat={(f) => { setPendingFileRef(f); setMobilePaneActive("left"); setLeftPanel("chat"); }}
              />
            </div>

            {/* Preview pane */}
            <div className={`absolute inset-0 ${mobilePaneActive === "preview" ? "" : "hidden"}`}>
              <PreviewPanel
                files={files}
                activeFile={activeFile}
                isVisualEditActive={isVisualEditActive}
                onVisualEditToggle={() => setIsVisualEditActive((v) => !v)}
                onFileUpdate={handleFileUpdate}
                onError={setPreviewError}
                onFixWithAI={(err) => {
                  window.dispatchEvent(new CustomEvent("lifemark-preview-heal-start"));
                  setMobilePaneActive("left");
                  setLeftPanel("chat");
                  setPendingFix(err);
                }}
                onSendPromptToChat={(p) => { setMobilePaneActive("left"); setLeftPanel("chat"); setPendingCrossRefPrompt(p); }}
                isGenerating={isGenerating}
                generatingFileCount={generatingFileCount}
                deployedUrl={project.deployed_url ?? undefined}
                badgeHidden={(project as { badge_hidden?: boolean }).badge_hidden ?? false}
                projectId={project.id}
                credits={uiCredits}
                useWebContainers
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
            {(["left", "code", "preview"] as const).map((pane) => {
              const config = {
                left:    { icon: "💬", label: "Chat" },
                code:    { icon: "⌨️",  label: "Code" },
                preview: { icon: "▶",  label: "Preview" },
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
                    if (pane === "code") setViewMode("code");
                    if (pane === "preview") setViewMode("preview");
                  }}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition-all relative ${
                    isActive ? "text-primary" : "text-muted-foreground active:text-foreground"
                  }`}
                >
                  {isActive && (
                    <span className="absolute top-0 left-1/4 right-1/4 h-0.5 rounded-full bg-primary" />
                  )}
                  <span className={`text-lg leading-none transition-transform ${isActive ? "scale-110" : ""}`}>
                    {config.icon}
                  </span>
                  <span>{config.label}</span>
                </button>
              );
            })}
          </div>
        </>
      )}

      {/* ── Desktop layout ──────────────────────────────────────────────────── */}
      <div className={`flex-1 overflow-hidden ${isMobile ? "hidden" : ""}`}>
        <PanelGroup direction="horizontal" className="h-full">
          {/* Left Panel — Chat only (Lovable-style) */}
          <Panel
            defaultSize={35}
            minSize={22}
            maxSize={55}
            id="leftpanel"
            style={focusMode ? { display: "none" } : undefined}
          >
            <div className="relative flex flex-col h-full border-r border-border bg-background">
              <ChatPanel
                project={project}
                files={files}
                messages={messages}
                activeFile={activeFile}
                mode={editorMode}
                credits={uiCredits}
                starterPrompt={pendingConnectorPrompt ?? pendingCrossRefPrompt ?? starterPrompt}
                previewError={previewError}
                pendingFixPrompt={pendingFix}
                pendingFileRef={pendingFileRef}
                onMessagesUpdate={handleMessagesUpdate}
                onFilesUpdate={handleFilesUpdate}
                onCreditsUpdate={handleCreditsUpdate}
                onAutoFixComplete={() => setPreviewError(null)}
                onPendingFixConsumed={() => setPendingFix(null)}
                onPendingFileRefConsumed={() => setPendingFileRef(null)}
                onStreamingChange={(s, fc) => { setIsGenerating(s); if (fc !== undefined) setGeneratingFileCount(fc); }}
                onModeChange={setEditorMode}
                pendingBuildFromFile={pendingBuildFromFile}
                onPendingBuildFromFileConsumed={() => setPendingBuildFromFile(null)}
                isLocked={isLiveLocked}
                onApprovePlan={() => setEditorMode("build")}
                onOpenPanel={handleOpenPanel}
                onFocusPreview={handleFocusPreview}
              />
              {leftChatOverlay === "history" && (
                <div className="absolute inset-0 z-10 flex flex-col bg-background">
                  <LovableOverlayHeader title="History" onClose={() => setLeftChatOverlay(null)} />
                  <div className="flex-1 overflow-hidden">
                    <HistoryPanel
                      projectId={currentProject.id}
                      onRestore={(snapshotFiles) => {
                        setFiles(snapshotFiles);
                        setActiveFile(snapshotFiles[0] ?? null);
                        setLeftChatOverlay(null);
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
          {showFileTree && !focusMode && (
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
          <Panel defaultSize={65} minSize={30} id="rightpanel">
            <div className="flex flex-col h-full relative">
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

              {/* Preview / Code view (always rendered, hidden by secondary panel overlay) */}
              {viewMode === "both" ? (
                <PanelGroup direction="horizontal" className="flex-1">
                  <Panel defaultSize={50} minSize={20} id="previewpanel">
                    <PreviewPanel
                      files={files}
                      projectId={pid}
                      activeFile={activeFile}
                      isVisualEditActive={isVisualEditActive}
                      onVisualEditToggle={() => setIsVisualEditActive((v) => !v)}
                      onFileUpdate={handleFileUpdate}
                      isGenerating={isGenerating}
                      generatingFileCount={generatingFileCount}
                      onError={setPreviewError}
                      onFixWithAI={(err) => {
                        window.dispatchEvent(new CustomEvent("lifemark-preview-heal-start"));
                        setLeftPanel("chat");
                        setPendingFix(err);
                      }}
                      onSendPromptToChat={(p) => { setLeftPanel("chat"); setPendingCrossRefPrompt(p); }}
                      deployedUrl={currentProject.deployed_url ?? undefined}
                      badgeHidden={(currentProject as { badge_hidden?: boolean }).badge_hidden ?? false}
                      credits={uiCredits}
                      useWebContainers
                      onSendAnnotatedToChat={(prompt, img) => {
                        setPendingBuildFromFile({ prompt, imageBase64: img });
                        setLeftPanel("chat");
                      }}
                    />
                  </Panel>
                  <PanelResizeHandle className="w-px bg-border hover:bg-primary/50 transition-colors cursor-col-resize" />
                  <Panel defaultSize={50} minSize={20} id="codepanel">
                    <div className="h-full flex flex-col">
                      <FileTreePanel files={files} activeFile={activeFile} projectId={project.id} onFileSelect={setActiveFile} onFilesChange={handleFilesUpdate} />
                      <div className="flex-1 min-h-0">
                        <CodePanel
                          file={activeFile}
                          files={files}
                          projectId={project.id}
                          onSave={handleCodeChange}
                          onChange={handleCodeChange}
                          collabUser={collabUser}
                          onCollaboratorsChange={setYjsCollaborators}
                        />
                      </div>
                    </div>
                  </Panel>
                </PanelGroup>
              ) : viewMode === "code" ? (
                <div className="flex flex-col h-full">
                  <FileTreePanel files={files} activeFile={activeFile} projectId={project.id} onFileSelect={setActiveFile} onFilesChange={handleFilesUpdate} />
                  <div className="flex-1 min-h-0">
                    <CodePanel
                      file={activeFile}
                      files={files}
                      projectId={project.id}
                      onSave={handleCodeChange}
                      onChange={handleCodeChange}
                      collabUser={collabUser}
                      onCollaboratorsChange={setYjsCollaborators}
                    />
                  </div>
                </div>
              ) : (
                <PreviewPanel
                  files={files}
                  projectId={pid}
                  activeFile={activeFile}
                  isVisualEditActive={isVisualEditActive}
                  onVisualEditToggle={() => setIsVisualEditActive((v) => !v)}
                  onFileUpdate={handleFileUpdate}
                  isGenerating={isGenerating}
                  generatingFileCount={generatingFileCount}
                  onError={setPreviewError}
                  onFixWithAI={(err) => {
                    window.dispatchEvent(new CustomEvent("lifemark-preview-heal-start"));
                    setLeftPanel("chat");
                    setPendingFix(err);
                  }}
                  onSendPromptToChat={(p) => { setLeftPanel("chat"); setPendingCrossRefPrompt(p); }}
                  deployedUrl={currentProject.deployed_url ?? undefined}
                  badgeHidden={(currentProject as { badge_hidden?: boolean }).badge_hidden ?? false}
                  credits={uiCredits}
                  useWebContainers
                  onSendAnnotatedToChat={(prompt, img) => {
                    setPendingBuildFromFile({ prompt, imageBase64: img });
                    setLeftPanel("chat");
                  }}
                />
              )}
            </div>
          </Panel>
        </PanelGroup>
      </div>

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
    </div>
  );
}
