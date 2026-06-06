"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { countFindings } from "@/lib/security/static-scan";
import { useIsMobile } from "@/hooks/use-is-mobile";
import dynamic from "next/dynamic";
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
import { ChatPanel } from "./chat-panel";
import { FileTreePanel } from "./file-tree-panel";
import { PreviewPanel } from "./preview-panel";
import { AgentPanel } from "./agent-panel";
import { GitHubPanel } from "./github-panel";
import { PackagesPanel } from "./packages-panel";
import { CollaborationPanel } from "./collaboration-panel";
import { ImageGenPanel } from "./image-gen-panel";
import { SupabaseWizard } from "./supabase-wizard";
import { EnvPanel } from "./env-panel";
import { PreviewAnnotateModal } from "./preview-annotate-modal";
import { FileToAppDropZone } from "./file-to-app-drop-zone";
import { PlanPanel } from "./plan-panel";
import { FigmaPanel } from "./figma-panel";
import { DomainsPanel } from "./domains-panel";
import { HistoryPanel } from "./history-panel";
import { ShortcutsModal, useShortcutsModal } from "./shortcuts-modal";
import { CommandPalette } from "@/components/command-palette";
import type { CommandPaletteActions } from "@/components/command-palette";
import { ActivityFeed } from "./activity-feed";
import { KnowledgePanel } from "./knowledge-panel";
import { ProjectSettingsPanel } from "./project-settings-panel";
import { SecurityPanel } from "./security-panel";
import { DeployHistoryPanel } from "./deploy-history-panel";
import { ProjectAnalyticsPanel } from "./project-analytics-panel";
import { ProjectSiteAnalyticsPanel } from "./project-site-analytics-panel";
import { AppAuthPanel } from "./app-auth-panel";
import { DesignSystemsPanel } from "./design-systems-panel";
import { SearchPanel } from "./search-panel";
import { ComponentsPanel } from "./components-panel";
import { DesignSystemPanel } from "./design-system-panel";
import { CommentsPanel } from "./comments-panel";
import { CrossReferencePanel } from "./cross-reference-panel";
import { EmailPanel } from "./email-panel";
import { TestingPanel } from "./testing-panel";
import { DesignGuidancePanel } from "./design-guidance-panel";
import { BrowserTestingPanel } from "./browser-testing-panel";
import { CodeReviewPanel } from "./code-review-panel";
import { McpPanel } from "./mcp-panel";
import { SeoPanel } from "./seo-panel";
import { ProblemsPanel } from "./problems-panel";
import { ConnectorWizardPanel } from "./connector-wizard-panel";
import { AccessibilityPanel } from "./accessibility-panel";
import { SchemaPanel } from "./schema-panel";
import { WebhookPanel } from "./webhook-panel";
import { PerformancePanel } from "./performance-panel";
import { I18nPanel } from "./i18n-panel";
import { ApiDocsPanel } from "./api-docs-panel";
import { CloudPanel } from "./cloud-panel";
import { LifemarkCloudPanel } from "./lifemark-cloud-panel";
import { StoragePanel } from "./storage-panel";
import { AppConnectorsPanel } from "./app-connectors-panel";
import { McpContextPanel } from "./mcp-context-panel";
import { AeoPanel } from "./aeo-panel";
import { VulnerabilityPanel } from "./vulnerability-panel";
import { DbSeedingPanel } from "./db-seeding-panel";
import { MonetizationPanel } from "./monetization-panel";
import { CopyGenPanel } from "./copy-gen-panel";
import { FeedbackWidgetPanel } from "./feedback-widget-panel";
import { GoLiveChecklistPanel } from "./golive-checklist-panel";
import { IconGenPanel } from "./icon-gen-panel";
import { ComponentMarketplacePanel } from "./component-marketplace-panel";
import { PwaPanel } from "./pwa-panel";
import { EdgeFunctionsPanel } from "./edge-functions-panel";
import { ApiPlaygroundPanel } from "./api-playground-panel";
import { BundleAnalyzerPanel } from "./bundle-analyzer-panel";
import { FormBuilderPanel } from "./form-builder-panel";
import { FeatureFlagsPanel } from "./feature-flags-panel";
import { ChangelogPanel } from "./changelog-panel";
import { DbQueryPanel } from "./db-query-panel";
import { RouterWizardPanel } from "./router-wizard-panel";
import { EnvHealthPanel } from "./env-health-panel";
import { PromptOptimizerPanel } from "./prompt-optimizer-panel";
import { SecretsVaultPanel } from "./secrets-vault-panel";
import { MigrationsWizardPanel } from "./migrations-wizard-panel";
import { ModelComparePanel } from "./model-compare-panel";
import { AiPersonaPanel } from "./ai-persona-panel";
import { ActivityTimelinePanel } from "./activity-timeline-panel";
import { CodeOwnershipPanel } from "./code-ownership-panel";
import { ConfigExportPanel } from "./config-export-panel";
import { SaveAsTemplatePanel } from "./save-as-template-panel";
import { DiffViewerPanel } from "./diff-viewer-panel";
import { DependencyGraphPanel } from "./dependency-graph-panel";
import { TimeLapsePanel } from "./time-lapse-panel";
import { CustomEmailsPanel } from "./custom-emails-panel";
import { DesignDirectionsPanel } from "./design-directions-panel";
import { AiIntegrationPanel } from "./ai-integration-panel";
import { DesignPanel } from "./design-panel";
import { VisualEditsPanel } from "./visual-edits-panel";
import { PublishPanel } from "./publish-panel";
import { PaymentsPanel } from "./payments-panel";
import { PaymentCheckoutPanel } from "./payment-checkout-panel";
import { useRecordProjectVisit } from "@/hooks/use-recent-projects";
import type { Project, ProjectFile, Message, Profile } from "@/types/database";

const CodePanel = dynamic(() => import("./code-panel").then((m) => m.CodePanel), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-[#1e1e1e]">
      <div className="text-muted-foreground text-sm">Loading editor...</div>
    </div>
  ),
});

export type EditorMode = "chat" | "plan" | "build" | "agent" | "patch";
export type ViewMode = "preview" | "code" | "both";
export type LeftPanel = "chat" | "plan" | "agent" | "activity" | "github" | "collab" | "supabase" | "env" | "image" | "figma" | "domains" | "history" | "deploys" | "analytics" | "knowledge" | "security" | "settings" | "search" | "components" | "design" | "comments" | "crossref" | "email" | "testing" | "guidance" | "e2e" | "packages" | "review" | "mcp" | "seo" | "customemail" | "designdir" | "designpanel" | "visualedits" | "publishpanel" | "payments" | "checkout" | "problems" | "connectors" | "accessibility" | "schema" | "webhooks" | "performance" | "i18n" | "apidocs" | "cloud" | "storage" | "appconnectors" | "mcpcontext" | "aeo" | "vulnscan" | "dbseed" | "monetize" | "copygen" | "feedback" | "golive" | "icongen" | "compmarket" | "pwa" | "edgefn" | "apiplay" | "bundle" | "formgen" | "flags" | "changelog" | "dbquery" | "routerwiz" | "envhealth" | "promptopt" | "secrets" | "migrations" | "modelcmp" | "persona" | "activityfeed" | "ownership" | "configexport" | "savetemplate" | "diffviewer" | "depgraph" | "timelapse" | "aiintegration" | "appauth" | "designsystem" | "code";

interface EditorLayoutProps {
  project: Project;
  initialFiles: ProjectFile[];
  initialMessages: Message[];
  profile: Profile | null;
  starterPrompt?: string;
  autoDeploy?: boolean;
}

export function EditorLayout({ project, initialFiles, initialMessages, profile, starterPrompt, autoDeploy }: EditorLayoutProps) {
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
  // Default to Build — users open the editor to make things ("create a login
  // page"), and chat mode never writes files. Chat is one tab-click away.
  const [editorMode, setEditorMode] = useState<EditorMode>("build");
  const [viewMode, setViewMode] = useState<ViewMode>("preview");
  const [leftPanel, setLeftPanel] = useState<LeftPanel>("chat");
  // Right-side secondary panel (null = show preview/code)
  const [rightPanel, setRightPanel] = useState<LeftPanel | null>(null);
  const [credits, setCredits] = useState(profile?.credits ?? 0);
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
  const commandPaletteActions: CommandPaletteActions = {
    onOpenFile: (file) => setActiveFile(files.find(f => f.id === file.id) || null),
    onOpenPanel: (panel) => {
      const chatPanels: LeftPanel[] = ["chat", "plan", "agent"];
      if (chatPanels.includes(panel as LeftPanel)) {
        setLeftPanel(panel as LeftPanel);
      } else {
        setRightPanel(panel as LeftPanel);
      }
    },
    onSetViewMode: (mode) => setViewMode(mode),
    onToggleFileTree: () => setShowFileTree((v) => !v),
  };

  useEffect(() => {
    setCredits(profile?.credits ?? 0);
  }, [profile]);

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
  }, []);

  const handleFilesUpdate = useCallback((updatedFiles: ProjectFile[]) => {
    setFiles((prev) => {
      const map = new Map(prev.map((f) => [f.path, f]));
      updatedFiles.forEach((f) => map.set(f.path, f));
      return Array.from(map.values());
    });
    // On mobile, jump to preview after AI generates files
    if (isMobile && updatedFiles.length > 0) setMobilePaneActive("preview");
  }, [isMobile]);

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
          credits={credits}
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
        />
      )}

      {/* ── Mobile layout ─────────────────────────────────────────────────── */}
      {isMobile && (
        <>
          <div className="flex-1 overflow-hidden relative">
            {/* Left panel */}
            <div className={`absolute inset-0 flex flex-col ${mobilePaneActive === "left" ? "" : "hidden"}`}>
              <div className="flex-1 overflow-hidden">
                {/* Scrollable tab strip */}
                <div className="flex border-b border-border overflow-x-auto bg-background">
                  {leftPanelTabs.map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setLeftPanel(tab.id)}
                      title={tab.label}
                      className={`flex items-center gap-1 px-3 py-2 text-xs font-medium whitespace-nowrap border-b-2 transition-colors flex-shrink-0 ${
                        leftPanel === tab.id
                          ? "border-primary text-primary"
                          : "border-transparent text-muted-foreground"
                      }`}
                    >
                      <span>{tab.emoji}</span>
                    </button>
                  ))}
                </div>
                <div className="h-full overflow-hidden">
                  {/* AI/chat panel — same as desktop left panel */}
                  {leftPanel === "chat" && (
                    <ChatPanel
                      project={project}
                      files={files}
                      messages={messages}
                      activeFile={activeFile}
                      mode={editorMode}
                      credits={credits}
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
                        setMobilePaneActive("preview");
                      }}
                    />
                  )}
                  {leftPanel === "search" && (
                    <SearchPanel
                      files={files}
                      projectId={project.id}
                      onFileSelect={(file, _line) => {
                        setActiveFile(file);
                        setMobilePaneActive("code");
                      }}
                      onFilesUpdate={(updated) => setFiles(updated)}
                    />
                  )}
                  {leftPanel === "components" && (
                    <ComponentsPanel
                      onInsertPrompt={(prompt) => {
                        setPendingComponentPrompt(prompt);
                        setLeftPanel("chat");
                      }}
                    />
                  )}
                  {leftPanel !== "chat" && leftPanel !== "search" && (
                    <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4 text-center">
                      Switch to desktop view for full panel access
                    </div>
                  )}                </div>
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
                onFixWithAI={(err) => { setMobilePaneActive("left"); setLeftPanel("chat"); setPendingFix(err); }}
                useWebContainers
                isGenerating={isGenerating}
                generatingFileCount={generatingFileCount}
                deployedUrl={project.deployed_url ?? undefined}
                badgeHidden={(project as any).badge_hidden ?? false}
                projectId={project.id}
                onSendAnnotatedToChat={(prompt, img) => { setMobilePaneActive("left"); setLeftPanel("chat"); setPendingBuildFromFile({ prompt, imageBase64: img }); }}
              />
            </div>
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
                    setMobilePaneActive(pane);
                    if (pane === "left") setLeftPanel("chat");
                  }}
                  className={`flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 text-[11px] font-medium transition-all relative ${
                    isActive ? "text-primary" : "text-muted-foreground active:text-foreground"
                  }`}
                >
                  {/* Active indicator bar */}
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
            <div className="flex flex-col h-full border-r border-border bg-background">
              <ChatPanel
                project={project}
                files={files}
                messages={messages}
                activeFile={activeFile}
                mode={editorMode}
                credits={credits}
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
                onOpenPanel={(panel) => setRightPanel(panel as LeftPanel)}
              />
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
                  {/* Secondary panel header */}
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
                  {/* Secondary panel content */}
                  <div className="flex-1 overflow-hidden">
                    {rightPanel === "github" && (
                      <GitHubPanel
                        project={currentProject}
                        githubUsername={profile?.github_username ?? null}
                        githubToken={profile?.github_access_token ?? null}
                        gitlabUsername={profile?.gitlab_username ?? null}
                        gitlabToken={profile?.gitlab_access_token ?? null}
                        onProjectUpdated={handleProjectUpdate}
                        files={files}
                      />
                    )}
                    {rightPanel === "history" && <HistoryPanel
                      projectId={currentProject.id}
                      onRestore={(snapshotFiles) => { setFiles(snapshotFiles); setActiveFile(snapshotFiles[0] ?? null); }}
                      onCompare={(oldId, newId) => {
                        // Surface the diff viewer pre-populated with the snapshot pair.
                        window.dispatchEvent(new CustomEvent("lifemark-open-diff", {
                          detail: { oldSnapshotId: oldId, newSnapshotId: newId, projectId: currentProject.id },
                        }));
                        setRightPanel("diffviewer" as LeftPanel);
                      }}
                    />}
                    {rightPanel === "knowledge" && <KnowledgePanel project={currentProject} profile={profile} onProjectUpdate={handleProjectUpdate} />}
                    {rightPanel === "analytics" && <ProjectSiteAnalyticsPanel project={currentProject} />}
                    {rightPanel === "activity" && <ProjectAnalyticsPanel project={currentProject} />}
                    {rightPanel === "security" && <SecurityPanel project={currentProject} files={files} onFilesUpdate={handleFilesUpdate} />}
                    {rightPanel === "deploys" && <DeployHistoryPanel project={currentProject} onFilesRefresh={async () => { const res = await fetch(`/api/projects/${project.id}/files`); if (res.ok) { const f = await res.json(); setFiles(f); }}} />}
                    {rightPanel === "supabase" && <SupabaseWizard projectId={pid} />}
                    {rightPanel === "env" && <EnvPanel projectId={pid} files={files} onUpdateFile={handleEnvUpdateFile} />}
                    {rightPanel === "image" && <ImageGenPanel projectId={pid} />}
                    {rightPanel === "testing" && <TestingPanel projectId={pid} files={files} onFilesUpdate={handleFilesUpdate} onOpenFile={setActiveFile} />}
                    {rightPanel === "mcp" && <McpPanel />}
                    {rightPanel === "connectors" && <ConnectorWizardPanel onApplyConnector={sendPromptToChat} />}
                    {rightPanel === "settings" && <ProjectSettingsPanel project={currentProject} profile={profile} onProjectUpdate={handleProjectUpdate} />}
                    {rightPanel === "search" && <SearchPanel files={files} projectId={project.id} onFileSelect={(f) => { setActiveFile(f); setRightPanel(null); setViewMode("code"); }} onFilesUpdate={handleFilesUpdate} />}
                    {rightPanel === "domains" && <DomainsPanel project={currentProject} />}
                    {rightPanel === "appauth" && <AppAuthPanel project={currentProject} />}
                    {rightPanel === "designsystem" && <DesignSystemsPanel project={currentProject} onProjectUpdate={handleProjectUpdate} />}
                    {rightPanel === "figma" && <FigmaPanel projectId={pid} onGenerateFromFigma={sendPromptToChat} />}
                    {rightPanel === "collab" && <CollaborationPanel project={currentProject} currentUserId={profile?.id ?? ""} yjsCollaborators={yjsCollaborators} />}
                    {rightPanel === "seo" && <SeoPanel projectId={pid} onSendToChat={sendPromptToChat} />}
                    {rightPanel === "customemail" && <CustomEmailsPanel />}
                    {rightPanel === "cloud" && <LifemarkCloudPanel project={currentProject} onOpenSubPanel={(p) => setRightPanel(p as LeftPanel)} />}
                    {rightPanel === "storage" && <StoragePanel projectId={pid} />}
                    {rightPanel === "designdir" && <DesignDirectionsPanel onSendToChat={sendPromptToChat} />}
                    {rightPanel === "design" && <DesignPanel projectId={pid} onApply={sendPromptToChat} />}
                    {rightPanel === "visualedits" && <VisualEditsPanel projectId={pid} onApply={sendPromptToChat} />}
                    {rightPanel === "publishpanel" && <PublishPanel project={currentProject} />}
                    {rightPanel === "payments" && <PaymentsPanel profile={profile} />}
                    {rightPanel === "checkout" && <PaymentCheckoutPanel projectId={pid} />}
                    {rightPanel === "problems" && <ProblemsPanel projectId={pid} />}
                    {rightPanel === "accessibility" && <AccessibilityPanel files={files} onFixWithAI={sendPromptToChat} />}
                    {rightPanel === "schema" && <SchemaPanel files={files} onGenerateMigration={sendPromptToChat} />}
                    {rightPanel === "webhooks" && <WebhookPanel projectId={pid} />}
                    {rightPanel === "performance" && <PerformancePanel files={files} onFixWithAI={sendPromptToChat} />}
                    {rightPanel === "i18n" && <I18nPanel files={files} onGenerateTranslations={sendPromptToChat} />}
                    {rightPanel === "apidocs" && <ApiDocsPanel files={files} />}
                    {rightPanel === "vulnscan" && <VulnerabilityPanel files={files} onFixWithAI={sendPromptToChat} />}
                    {rightPanel === "dbseed" && <DbSeedingPanel projectId={pid} files={files} />}
                    {rightPanel === "monetize" && <MonetizationPanel projectId={pid} projectSlug={projectSlug} />}
                    {rightPanel === "copygen" && <CopyGenPanel projectId={pid} files={files} onInsertCopy={sendPromptToChat} />}
                    {rightPanel === "feedback" && <FeedbackWidgetPanel projectId={pid} projectSlug={projectSlug} />}
                    {rightPanel === "golive" && <GoLiveChecklistPanel projectId={project.id} files={files} onFixWithAI={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }} />}
                    {rightPanel === "icongen" && <IconGenPanel projectId={project.id} files={files} />}
                    {rightPanel === "compmarket" && <ComponentMarketplacePanel projectId={project.id} onInstall={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }} />}
                    {rightPanel === "pwa" && <PwaPanel projectId={project.id} files={files} onGenerateFiles={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }} />}
                    {rightPanel === "edgefn" && <EdgeFunctionsPanel projectId={project.id} />}
                    {rightPanel === "apiplay" && <ApiPlaygroundPanel projectId={project.id} files={files} />}
                    {rightPanel === "bundle" && <BundleAnalyzerPanel files={files} onFixWithAI={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }} />}
                    {rightPanel === "formgen" && <FormBuilderPanel projectId={project.id} onInsertForm={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }} />}
                    {rightPanel === "flags" && <FeatureFlagsPanel projectId={project.id} onInsertCode={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }} />}
                    {rightPanel === "changelog" && <ChangelogPanel projectId={project.id} onInsertChangelog={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }} />}
                    {rightPanel === "dbquery" && <DbQueryPanel projectId={project.id} />}
                    {rightPanel === "routerwiz" && <RouterWizardPanel projectId={project.id} files={files} onInsertCode={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }} />}
                    {rightPanel === "envhealth" && <EnvHealthPanel projectId={project.id} />}
                    {rightPanel === "promptopt" && <PromptOptimizerPanel onSendToChat={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }} />}
                    {rightPanel === "secrets" && <SecretsVaultPanel projectId={project.id} />}
                    {rightPanel === "migrations" && <MigrationsWizardPanel projectId={project.id} files={files} onInsertCode={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }} />}
                    {rightPanel === "modelcmp" && <ModelComparePanel projectId={project.id} onSendToChat={(p) => { setPendingCrossRefPrompt(p); setRightPanel(null); }} />}
                    {rightPanel === "persona" && <AiPersonaPanel projectId={project.id} />}
                    {rightPanel === "activityfeed" && <ActivityTimelinePanel projectId={project.id} />}
                    {rightPanel === "ownership" && <CodeOwnershipPanel projectId={project.id} files={files} />}
                    {rightPanel === "configexport" && <ConfigExportPanel projectId={project.id} />}
                    {rightPanel === "savetemplate" && <SaveAsTemplatePanel projectId={project.id} projectName={project.name} />}
                    {rightPanel === "diffviewer" && <DiffViewerPanel projectId={project.id} />}
                    {rightPanel === "depgraph" && <DependencyGraphPanel projectId={project.id} files={files} onFileOpen={(path) => { const f = files.find(x => x.path === path); if (f) setActiveFile(f); }} />}
                    {rightPanel === "timelapse" && <div className="flex items-center justify-center h-full text-sm text-muted-foreground">Time-Lapse coming soon</div>}
                    {rightPanel === "aiintegration" && <AiIntegrationPanel project={currentProject} onProjectUpdate={handleProjectUpdate} />}
                    {/* plan/agent/activity/crossref/review/guidance/e2e/packages/designpanel/mcpcontext/aeo/appconnectors/email/comments */}
                    {rightPanel === "plan" && <PlanPanel project={currentProject} files={files} onApprovePlan={(md) => { setEditorMode("build"); setPendingCrossRefPrompt(`Implement this approved plan:

${md}`); setRightPanel(null); }} />}
                    {rightPanel === "agent" && <AgentPanel projectId={pid} files={files} onFilesUpdated={handleFilesUpdate} onCreditsChange={handleCreditsUpdate} credits={credits} isLocked={isLiveLocked} />}
                    {rightPanel === "activityfeed" && <ActivityFeed projectId={pid} />}
                    {rightPanel === "crossref" && <CrossReferencePanel currentProjectId={pid} onFilesUpdate={handleFilesUpdate} onAdaptWithAI={sendPromptToChat} />}
                    {rightPanel === "review" && <CodeReviewPanel activeFile={activeFile} onJumpToLine={() => {}} onFixWithAI={(issue) => sendPromptToChat(`Fix ${issue.category} issue: ${issue.title} — ${issue.description}`)} />}
                    {rightPanel === "guidance" && <DesignGuidancePanel projectId={pid} files={files} onApplyFix={sendPromptToChat} />}
                    {rightPanel === "e2e" && <BrowserTestingPanel project={currentProject} files={files} onFilesUpdate={handleFilesUpdate} onOpenFile={setActiveFile} />}
                    {rightPanel === "packages" && <PackagesPanel projectId={pid} files={files} onFileChange={handleFileUpdate} />}
                    {rightPanel === "email" && <EmailPanel projectId={pid} files={files} onFilesUpdate={handleFilesUpdate} />}
                    {rightPanel === "comments" && <CommentsPanel projectId={pid} currentUserId={profile?.id ?? ""} />}
                    {rightPanel === "mcpcontext" && <McpContextPanel projectId={pid} />}
                    {rightPanel === "aeo" && <AeoPanel files={files} onGenerateSchema={sendPromptToChat} />}
                    {rightPanel === "appconnectors" && <AppConnectorsPanel projectId={pid} />}
                    {rightPanel === "components" && <ComponentsPanel onInsertPrompt={sendPromptToChat} />}
                    {rightPanel === "designpanel" && <DesignSystemPanel projectId={pid} files={files} onFilesUpdate={handleFilesUpdate} />}
                  </div>
                </div>
              )}

              {/* Preview / Code view (always rendered, hidden by secondary panel overlay) */}
              {viewMode === "both" ? (
                <PanelGroup direction="horizontal" className="flex-1">
                  <Panel defaultSize={50} minSize={20} id="previewpanel">
                    <PreviewPanel
                      files={files}
                      projectId={pid}
                      isGenerating={isGenerating}
                      generatingFileCount={generatingFileCount}
                      onError={setPreviewError}
                      deployedUrl={currentProject.deployed_url ?? undefined}
                      badgeHidden={(currentProject as { badge_hidden?: boolean }).badge_hidden ?? false}
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
                  isGenerating={isGenerating}
                  generatingFileCount={generatingFileCount}
                  onError={setPreviewError}
                  deployedUrl={currentProject.deployed_url ?? undefined}
                  badgeHidden={(currentProject as { badge_hidden?: boolean }).badge_hidden ?? false}
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
