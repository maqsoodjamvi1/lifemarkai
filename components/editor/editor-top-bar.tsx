"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Zap, ChevronLeft, ChevronDown, Bot, MessageSquare, Eye, Code2,
  Columns, Rocket, Github, Settings, Sparkles, Loader2,
  PanelLeft, PanelsTopLeft, Download,
  Share2, Globe, Lock, Check, Copy, ExternalLink, Shield, Brain, Pencil,
  ToggleLeft, ToggleRight, Trash2,
  AlignJustify, Camera, BarChart2, Maximize2, RefreshCw,
  MessageCircle, Users, Link2, MoreHorizontal, History, LayoutDashboard,
  ChevronRight, UserPlus, CheckCircle2, AlertCircle,
  Cloud, FolderOpen, CreditCard, Search, Pin,
} from "lucide-react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Project, Profile } from "@/types/database";
import type { EditorMode, ViewMode, LeftPanel } from "./editor-layout";
import { toast } from "@/hooks/use-toast";
import { createClient } from "@/lib/supabase/client";

interface PresenceUser {
  id: string;
  name: string;
  color: string;
  avatar?: string;
}

const PRESENCE_COLORS = [
  "#7c3aed", "#0e90e8", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#06b6d4", "#84cc16",
];

interface EditorTopBarProps {
  project: Project;
  editorMode: EditorMode;
  viewMode: ViewMode;
  credits: number;
  leftPanel: LeftPanel;
  showFileTree: boolean;
  profile: Profile | null;
  /** Timestamp of the most recent successful file save (for autosave indicator) */
  lastSaved?: Date | null;
  onModeChange: (mode: EditorMode) => void;
  onViewChange: (view: ViewMode) => void;
  onLeftPanelChange: (panel: LeftPanel) => void;
  onToggleFileTree: () => void;
  onOpenShortcuts?: () => void;
  onRename?: (name: string) => void;
  onDuplicate?: () => void;
  onDelete?: () => void;
  devMode?: boolean;
  onDevModeToggle?: () => void;
  /** Called when the user switches between Test and Live environment */
  onEnvironmentChange?: (env: "test" | "live") => void;
  /** Active right-side secondary panel (null = preview/code) */
  rightPanel?: LeftPanel | null;
  /** Open a secondary panel on the right */
  onRightPanelChange?: (panel: LeftPanel | null) => void;
  /** Number of static-scan security findings (used for the publish dropdown's red badge) */
  securityIssueCount?: number;
  /** Toggle Lovable-style history overlay on the chat column */
  onChatOverlayToggle?: () => void;
  chatOverlayActive?: boolean;
}

function openSecondaryPanel(
  panel: LeftPanel,
  onRightPanelChange?: (panel: LeftPanel | null) => void
) {
  onRightPanelChange?.(panel);
}

/** Returns a human-readable relative time string that auto-updates every 5 s */
function useRelativeTime(date: Date | null | undefined): string {
  const [, tick] = useState(0);

  useEffect(() => {
    if (!date) return;
    const id = setInterval(() => tick((n) => n + 1), 5_000);
    return () => clearInterval(id);
  }, [date]);

  if (!date) return "";
  const seconds = Math.round((Date.now() - date.getTime()) / 1000);
  if (seconds < 5)  return "Saved just now";
  if (seconds < 60) return `Saved ${seconds}s ago`;
  const minutes = Math.floor(seconds / 60);
  if (minutes === 1) return "Saved 1 min ago";
  if (minutes < 60) return `Saved ${minutes} min ago`;
  return "Saved";
}

const MODES: { id: EditorMode; label: string; icon: React.ElementType; description: string }[] = [
  { id: "chat", label: "Chat", icon: MessageSquare, description: "Conversational edits" },
  { id: "plan", label: "Plan", icon: Sparkles, description: "Plan before building" },
  { id: "build", label: "Build", icon: Code2, description: "Full app generation" },
  { id: "agent", label: "Agent", icon: Bot, description: "Autonomous AI agent" },
];

export function EditorTopBar({
  project,
  editorMode,
  viewMode,
  credits,
  leftPanel,
  showFileTree,
  profile,
  lastSaved,
  onModeChange,
  onViewChange,
  onLeftPanelChange,
  onToggleFileTree,
  onOpenShortcuts,
  onRename,
  onDuplicate,
  onDelete,
  devMode = true,
  onDevModeToggle,
  onEnvironmentChange,
  rightPanel,
  onRightPanelChange,
  securityIssueCount = 0,
  onChatOverlayToggle,
  chatOverlayActive = false,
}: EditorTopBarProps) {
  const router = useRouter();
  const savedLabel = useRelativeTime(lastSaved);
  const [showUpgradeDialog, setShowUpgradeDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showRenameDialog, setShowRenameDialog] = useState(false);
  const [isDeploying, setIsDeploying] = useState(false);
  const [presenceUsers, setPresenceUsers] = useState<PresenceUser[]>([]);

  // ── Environment (Test / Live) toggle ─────────────────────────────────────
  const [environment, setEnvironment] = useState<"test" | "live">(
    ((project as Record<string, unknown>).environment as "test" | "live") ?? "test"
  );
  const [envSaving, setEnvSaving] = useState(false);
  const supabaseEnv = createClient();

  async function handleEnvironmentToggle() {
    const next: "test" | "live" = environment === "test" ? "live" : "test";
    setEnvSaving(true);
    const updatePayload: Record<string, unknown> = { environment: next };
    if (next === "live") updatePayload.live_locked_at = new Date().toISOString();
    const { error } = await (supabaseEnv as unknown as Record<string, (t: string) => { update: (p: Record<string, unknown>) => { eq: (col: string, val: string) => Promise<{ error: unknown }> } }>)
      .from("projects")
      .update(updatePayload)
      .eq("id", project.id);
    setEnvSaving(false);
    if (!error) {
      setEnvironment(next);
      onEnvironmentChange?.(next);
      toast({
        title: next === "live" ? "Switched to Live — AI edits locked" : "Switched to Test — AI edits unlocked",
        description: next === "live"
          ? "AI changes are disabled in the Live environment to protect your production app."
          : "You can now make AI edits again.",
      });
    }
  }

  // ── Realtime presence: track and display who's viewing this project ──────
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    // Guard against async getUser() resolving after the effect is cleaned up
    // (React StrictMode double-invokes effects; without this the channel gets
    // subscribed on the first run, torn down with null ref, then the second run
    // tries to re-add .on("presence", …) to the still-subscribed channel).
    let cancelled = false;

    async function setupPresence() {
      // Presence is decorative — never let a transient auth error (e.g. the
      // Web Locks "lock stolen" race during mount storms) blow up the editor
      // with a runtime overlay. Fail quietly and skip presence for this mount.
      let user: { id: string } | null = null;
      try {
        const { data } = await supabase.auth.getUser();
        user = data.user;
      } catch {
        return;
      }
      if (cancelled || !user) return;

      const displayName = profile?.full_name ?? profile?.email?.split("@")[0] ?? "Anonymous";
      const avatarUrl = (profile as Record<string, unknown> | null)?.avatar_url as string | undefined;
      const colorIndex = user.id.charCodeAt(0) % PRESENCE_COLORS.length;

      channel = supabase.channel(`topbar:${project.id}:presence`, {
        config: { presence: { key: user.id } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          if (!channel) return;
          const state = channel.presenceState();
          const others: PresenceUser[] = Object.entries(state)
            .filter(([uid]) => uid !== user.id)
            .map(([uid, [data]], i) => ({
              id: uid,
              name: (data as Record<string, unknown>).name as string ?? "Viewer",
              avatar: (data as Record<string, unknown>).avatar as string | undefined,
              color: PRESENCE_COLORS[i % PRESENCE_COLORS.length],
            }));
          setPresenceUsers(others);
        })
        .subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await channel!.track({
              name: displayName,
              avatar: avatarUrl,
              color: PRESENCE_COLORS[colorIndex],
            });
          }
        });
    }

    void setupPresence();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);
  const [deployProvider, setDeployProvider] = useState<"netlify" | "vercel">("netlify");
  type DeployStatus = "idle" | "deploying" | "deployed" | "failed";
  const [deployStatus, setDeployStatus] = useState<DeployStatus>(
    project.deployed_url ? "deployed" : "idle"
  );

  // Sync deploy status from DB on mount (SSR project may be stale)
  useEffect(() => {
    void fetch(`/api/deploy/status?projectId=${project.id}`, { credentials: "include" })
      .then(async (res) => {
        const data = (await res.json().catch(() => ({}))) as { status?: string; url?: string | null };
        if (!res.ok) return;
        const isLive =
          data.status === "live" ||
          data.status === "deployed" ||
          (data.status === "active" && !!data.url);
        if (isLive) {
          setDeployStatus("deployed");
          if (data.url) setLiveUrl(data.url);
        } else if (data.status === "building") {
          setDeployStatus("deploying");
        } else if (data.status === "failed") {
          setDeployStatus("failed");
        }
      })
      .catch(() => {});
  }, [project.id]);

  const [liveUrl, setLiveUrl] = useState<string | null>(project.deployed_url ?? null);
  const [isSharing, setIsSharing] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  // Inline rename
  const [isRenaming, setIsRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState(project.name);
  const renameInputRef = useRef<HTMLInputElement>(null);

  const startRename = useCallback(() => {
    setRenameValue(project.name);
    setIsRenaming(true);
    setTimeout(() => { renameInputRef.current?.select(); }, 30);
  }, [project.name]);

  const commitRename = useCallback(async () => {
    const trimmed = renameValue.trim();
    setIsRenaming(false);
    if (!trimmed || trimmed === project.name) return;
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      onRename?.(trimmed);
    } catch {
      toast({ title: "Failed to rename project", variant: "destructive" });
    }
  }, [renameValue, project.name, project.id, onRename]);

  const handleDeleteProject = useCallback(async () => {
    try {
      await fetch(`/api/projects/${project.id}`, { method: "DELETE" });
      setShowDeleteDialog(false);
      router.push("/dashboard");
    } catch {
      toast({ title: "Failed to delete project", variant: "destructive" });
    }
  }, [project.id, router]);

  const handleRenameProject = useCallback(async () => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed === project.name) { setShowRenameDialog(false); return; }
    try {
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: trimmed }),
      });
      onRename?.(trimmed);
      setShowRenameDialog(false);
    } catch {
      toast({ title: "Failed to rename project", variant: "destructive" });
    }
  }, [renameValue, project.name, project.id, onRename]);

  const appUrl = typeof window !== "undefined" ? window.location.origin : "https://lifemarkai.com";
  const username = profile?.username ?? profile?.email?.split("@")[0] ?? "user";
  const shareUrl = project.slug && project.is_public ? `${appUrl}/p/${username}/${project.slug}` : null;

  async function handleTogglePublic() {
    setIsSharing(true);
    try {
      const newPublic = !project.is_public;
      // Auto-generate slug if going public and no slug exists
      await fetch(`/api/projects/${project.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_public: newPublic, ...(newPublic && !project.slug ? { generate_slug: true } : {}) }),
      });
      toast({ title: newPublic ? "Project is now public" : "Project is now private" });
      router.refresh();
    } catch {
      toast({ title: "Failed to update visibility", variant: "destructive" });
    } finally {
      setIsSharing(false);
    }
  }

  function copyShareUrl() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  }

  // Poll deploy status while deploying
  useEffect(() => {
    if (deployStatus !== "deploying") return;
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/deploy/status?projectId=${project.id}`, { credentials: "include" });
        if (!res.ok) {
          if (res.status === 401) {
            setDeployStatus("failed");
            clearInterval(interval);
            toast({
              title: "Deploy status check failed",
              description: "Session expired — please log in again and retry.",
              variant: "destructive",
            });
          }
          return;
        }
        const data = await res.json() as { status: string; url?: string | null };
        const isLive =
          data.status === "live" ||
          data.status === "deployed" ||
          (data.status === "active" && !!data.url);
        if (isLive) {
          setDeployStatus("deployed");
          if (data.url) setLiveUrl(data.url);
          clearInterval(interval);
          toast({ title: "Deployment live!", description: data.url ?? undefined });
        } else if (data.status === "failed") {
          setDeployStatus("failed");
          clearInterval(interval);
          toast({ title: "Deployment failed", variant: "destructive" });
        }
      } catch { /* ignore */ }
    }, 3000);
    return () => clearInterval(interval);
  }, [deployStatus, project.id]);

  async function handleDeploy(provider = deployProvider) {
    setIsDeploying(true);
    setDeployStatus("deploying");
    try {
      const res = await fetch("/api/deploy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ projectId: project.id, provider }),
      });
      const data = (await res.json()) as { error?: string; url?: string; message?: string; deploymentId?: string };
      if (!res.ok) {
        setDeployStatus("failed");
        const msg =
          res.status === 401
            ? "Session expired — please log in again and retry."
            : (data.error ?? "Deploy failed");
        toast({ title: "Deploy failed", description: msg, variant: "destructive" });
        return;
      }
      if (data.url) setLiveUrl(data.url);
      toast({
        title: `Deploying to ${provider === "vercel" ? "Vercel" : "Netlify"}…`,
        description: data.url ? `Your app will be live at ${data.url}` : (data.message ?? "Deployment started."),
      });
    } catch {
      setDeployStatus("failed");
      toast({ title: "Deploy failed", variant: "destructive" });
    } finally {
      setIsDeploying(false);
    }
  }

  const creditsLow = credits <= 10;
  const creditsMed = credits <= 50;
  // Credits are fractional (NUMERIC, migration 063) — render at most 2 dp,
  // trimming float noise like 49.549999 → 49.55, 50.00 → 50.
  const creditsDisplay = Number.isInteger(credits)
    ? String(credits)
    : String(Math.round(credits * 100) / 100);

  return (
    <TooltipProvider>
      <div className="flex items-center gap-1 px-2 h-11 border-b border-border bg-background z-10 flex-shrink-0 safe-area-top safe-area-x">

        {/* ── Left: logo + back + file-tree + project name dropdown ── */}
        <div className="flex items-center gap-0.5 min-w-0 flex-shrink-0">
          {/* LifemarkAI logo */}
          <Link
            href="/dashboard"
            className="flex items-center justify-center w-7 h-7 rounded-lg bg-gradient-to-br from-violet-600 to-purple-700 mr-0.5 flex-shrink-0 hover:opacity-90 transition-opacity"
            title="LifemarkAI"
          >
            <Sparkles className="w-3.5 h-3.5 text-white" />
          </Link>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={() => router.push("/dashboard")}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Back to dashboard</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground" onClick={onToggleFileTree}>
                <PanelsTopLeft className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Toggle file tree (⌘\)</TooltipContent>
          </Tooltip>

          {/* Project name — inline rename OR dropdown */}
          {isRenaming ? (
            <input
              ref={renameInputRef}
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onBlur={commitRename}
              onKeyDown={(e) => {
                if (e.key === "Enter") commitRename();
                if (e.key === "Escape") setIsRenaming(false);
              }}
              className="text-sm font-semibold bg-muted border border-primary/40 rounded px-2 py-0.5 outline-none max-w-[180px] min-w-0"
              maxLength={60}
            />
          ) : (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 hover:bg-muted/60 px-1.5 py-1 rounded-md transition-colors max-w-[200px] min-w-0">
                  <span className="text-sm font-semibold truncate">{project.name}</span>
                  <ChevronDown className="w-3 h-3 text-muted-foreground/60 shrink-0" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="w-52">
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground truncate">{project.name}</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={startRename} className="text-xs gap-2">
                  <Pencil className="w-3.5 h-3.5" />
                  Rename
                </DropdownMenuItem>
                {onDuplicate && (
                  <DropdownMenuItem onClick={onDuplicate} className="text-xs gap-2">
                    <Copy className="w-3.5 h-3.5" />
                    Duplicate project
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => openSecondaryPanel("settings", onRightPanelChange)} className="text-xs gap-2">
                  <Settings className="w-3.5 h-3.5" />
                  Project settings
                </DropdownMenuItem>
                {onDelete && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem onClick={onDelete} className="text-xs gap-2 text-destructive focus:text-destructive">
                      <Trash2 className="w-3.5 h-3.5" />
                      Delete project
                    </DropdownMenuItem>
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>

        {/* ── Center: exact Lovable icon toolbar ── */}
        <div className="flex items-center gap-0.5 flex-1 justify-center min-w-0">

          {/* History clock */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon"
                className={`h-7 w-7 flex-shrink-0 transition-all ${chatOverlayActive ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => onChatOverlayToggle?.()}>
                <History className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>History</TooltipContent>
          </Tooltip>

          {/* Layout / split toggle */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon"
                className={`h-7 w-7 flex-shrink-0 transition-all ${viewMode === "both" ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => { onRightPanelChange?.(null); onViewChange(viewMode === "both" ? "preview" : "both"); }}>
                <Columns className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Split view (⌘3)</TooltipContent>
          </Tooltip>

          {/* Preview pill — active when viewing preview with no secondary panel */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => { onRightPanelChange?.(null); onViewChange("preview"); }}
                className={`flex items-center gap-1.5 px-3 h-7 rounded-full text-xs font-medium transition-all flex-shrink-0 ${
                  !rightPanel && (viewMode === "preview" || viewMode === "both")
                    ? "bg-[#0066FF] text-white shadow-sm"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/60 border border-border/60"
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${!rightPanel && (viewMode === "preview" || viewMode === "both") ? "bg-white" : "bg-muted-foreground"}`} />
                Preview
              </button>
            </TooltipTrigger>
            <TooltipContent>Preview (⌘1)</TooltipContent>
          </Tooltip>

          {/* Code `</>` */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon"
                className={`h-7 w-7 flex-shrink-0 transition-all ${!rightPanel && viewMode === "code" ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground hover:bg-muted/60"}`}
                onClick={() => {
                  const isPro = profile?.plan && profile.plan !== "free";
                  if (!isPro) { setShowUpgradeDialog(true); return; }
                  onRightPanelChange?.(null);
                  if (!devMode) { onDevModeToggle?.(); onViewChange("code"); }
                  else { onViewChange(viewMode === "code" ? "preview" : "code"); }
                }}>
                <Code2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{profile?.plan === "free" ? "Upgrade to unlock code editor" : "Code (⌘2)"}</TooltipContent>
          </Tooltip>

          {/* Cloud — deploy */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon"
                className={`h-7 w-7 flex-shrink-0 transition-all ${rightPanel === "deploys" ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => onRightPanelChange?.(rightPanel === "deploys" ? null : "deploys")}>
                <Cloud className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Deploy history</TooltipContent>
          </Tooltip>

          {/* Analytics */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon"
                className={`h-7 w-7 flex-shrink-0 transition-all ${rightPanel === "analytics" ? "text-foreground bg-muted" : "text-muted-foreground hover:text-foreground"}`}
                onClick={() => onRightPanelChange?.(rightPanel === "analytics" ? null : "analytics")}>
                <BarChart2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Analytics</TooltipContent>
          </Tooltip>

          {/* … more — pinnable panels (exact Lovable overflow menu) */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground flex-shrink-0">
                <MoreHorizontal className="h-3.5 w-3.5" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="center" className="w-52 p-1">
              {([
                { id: "analytics" as LeftPanel, label: "Analytics",        icon: BarChart2 },
                { id: "company" as LeftPanel,   label: "AI Company",       icon: Brain     },
                { id: "cloud" as LeftPanel,     label: "Cloud",            icon: Cloud     },
                { id: "code" as LeftPanel,      label: "Code",             icon: Code2     },
                { id: "search" as LeftPanel,    label: "Files",            icon: FolderOpen },
                { id: "payments" as LeftPanel,  label: "Payments",         icon: CreditCard },
                { id: "security" as LeftPanel,  label: "Security",         icon: Shield    },
                { id: "appauth" as LeftPanel,       label: "App sign-in",      icon: UserPlus  },
                { id: "designsystem" as LeftPanel,  label: "Design system",    icon: Sparkles  },
                { id: "seo" as LeftPanel,       label: "SEO & AI search",  icon: Search    },
              ] as { id: LeftPanel; label: string; icon: React.ElementType }[]).map(({ id, label, icon: Icon }) => (
                <DropdownMenuItem
                  key={id}
                  onClick={() => {
                    if (id === "code") {
                      onViewChange("code");
                      return;
                    }
                    onRightPanelChange?.(rightPanel === id ? null : id);
                  }}
                  className="text-xs gap-2.5 py-2"
                >
                  <Icon className="w-3.5 h-3.5 text-muted-foreground" />
                  <span className="flex-1">{label}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/50"><path d="M21 10V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h5"/><polyline points="16 3 16 10 22 10 22 3"/></svg>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => { const a = document.createElement("a"); a.href = `/api/projects/${project.id}/export`; a.download = ""; a.click(); }} className="text-xs gap-2">
                <Download className="w-3.5 h-3.5" /> Download ZIP
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onOpenShortcuts} className="text-xs gap-2">
                <Zap className="w-3.5 h-3.5" /> Keyboard shortcuts
              </DropdownMenuItem>
              {onDelete && (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onClick={onDelete} className="text-xs gap-2 text-destructive focus:text-destructive">
                    <Trash2 className="w-3.5 h-3.5" /> Delete project
                  </DropdownMenuItem>
                </>
              )}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* ── Right: Lovable-style compact action bar ── */}
        <div className="flex items-center gap-0.5 flex-shrink-0">

          {/* Autosave indicator */}
          {savedLabel && (
            <span className="hidden xl:flex items-center text-[10px] text-muted-foreground/40 select-none tabular-nums mr-1 flex-shrink-0">
              {savedLabel}
            </span>
          )}

          {/* Test / Live environment switcher */}
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => void handleEnvironmentToggle()}
                disabled={envSaving}
                className={`hidden sm:flex items-center gap-1 mr-1 px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 border transition-all ${
                  environment === "live"
                    ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25"
                    : "bg-muted/50 text-muted-foreground border-border hover:bg-muted hover:text-foreground"
                }`}
              >
                {envSaving
                  ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  : environment === "live"
                    ? <Globe className="w-2.5 h-2.5" />
                    : <Lock className="w-2.5 h-2.5" />}
                {environment === "live" ? "Live" : "Test"}
              </button>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="text-xs max-w-[200px] text-center">
              {environment === "live"
                ? "Live mode — AI edits locked. Click to switch back to Test."
                : "Test mode — AI edits enabled. Click to switch to Live (locks AI edits)."}
            </TooltipContent>
          </Tooltip>

          {/* Deploy status */}
          {deployStatus !== "idle" && (
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => deployStatus === "deployed" && liveUrl
                    ? window.open(liveUrl, "_blank", "noopener,noreferrer")
                    : undefined}
                  className={`hidden sm:flex items-center gap-1 mr-1 px-2 py-0.5 rounded-full text-[10px] font-medium flex-shrink-0 transition-colors ${
                    deployStatus === "deployed"
                      ? "bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 cursor-pointer"
                      : deployStatus === "deploying"
                      ? "bg-amber-500/15 text-amber-400"
                      : "bg-red-500/15 text-red-400"
                  }`}
                >
                  {deployStatus === "deploying"
                    ? <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    : <span className={`w-1.5 h-1.5 rounded-full ${deployStatus === "deployed" ? "bg-emerald-400 animate-pulse" : "bg-red-400"}`} />
                  }
                  {deployStatus === "deploying" ? "Deploying…" : deployStatus === "deployed" ? "Live" : "Failed"}
                </button>
              </TooltipTrigger>
              <TooltipContent>{deployStatus === "deployed" && liveUrl ? liveUrl : deployStatus === "deploying" ? "Deployment in progress…" : "Deployment failed"}</TooltipContent>
            </Tooltip>
          )}

          {/* Presence avatars */}
          {presenceUsers.length > 0 && (
            <div className="flex items-center -space-x-1.5 mr-1 flex-shrink-0">
              {presenceUsers.slice(0, 3).map((u) => (
                <Tooltip key={u.id}>
                  <TooltipTrigger asChild>
                    <div className="w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white ring-2 ring-background cursor-default select-none"
                      style={{ backgroundColor: u.color }}>
                      {u.avatar
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={u.avatar} alt={u.name} className="w-full h-full rounded-full object-cover" />
                        : u.name.slice(0, 2).toUpperCase()}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="text-xs">{u.name} · viewing</TooltipContent>
                </Tooltip>
              ))}
            </div>
          )}

          {/* Credits */}
          <Tooltip>
            <TooltipTrigger asChild>
              <div className={`flex items-center gap-1 px-2 h-7 rounded-full text-xs font-semibold tabular-nums cursor-default select-none flex-shrink-0 ${
                creditsLow ? "bg-red-500/15 text-red-400 ring-1 ring-red-500/30"
                : creditsMed ? "bg-yellow-500/15 text-yellow-400"
                : "text-muted-foreground/60"
              }`}>
                <Zap className="h-3 w-3" />
                {creditsDisplay}
              </div>
            </TooltipTrigger>
            <TooltipContent>{creditsDisplay} credits remaining — includes 5 free daily credits</TooltipContent>
          </Tooltip>

          <div className="h-4 w-px bg-border/60 mx-1 flex-shrink-0" />

          {/* Expand preview in new tab */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground flex-shrink-0"
                onClick={() => {
                  if (liveUrl) window.open(liveUrl, "_blank", "noopener,noreferrer");
                  else window.open(`/preview/${project.id}`, "_blank", "noopener,noreferrer");
                }}>
                <Maximize2 className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Open in new tab</TooltipContent>
          </Tooltip>

          {/* Refresh preview */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground flex-shrink-0"
                onClick={() => window.dispatchEvent(new CustomEvent("lifemark-refresh-preview"))}>
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Refresh preview</TooltipContent>
          </Tooltip>

          <div className="h-4 w-px bg-border/60 mx-1 flex-shrink-0" />

          {/* Comments / chat icon */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground hover:text-foreground flex-shrink-0"
                onClick={() => openSecondaryPanel("comments", onRightPanelChange)}>
                <MessageCircle className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Comments</TooltipContent>
          </Tooltip>

          {/* ── Share panel — Lovable-style ── */}
          <DropdownMenu open={shareOpen} onOpenChange={setShareOpen}>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm"
                className="h-7 gap-1.5 text-xs font-medium flex-shrink-0 border-border/60 text-foreground hover:bg-muted/60">
                <Users className="h-3 w-3" />
                Share
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-80 p-0 overflow-hidden">
              {/* Header */}
              <div className="px-4 pt-4 pb-3 border-b border-border/60">
                <h3 className="text-sm font-semibold">Share project</h3>
              </div>

              {/* Add people */}
              <div className="px-4 py-3 border-b border-border/60">
                <div className="flex items-center gap-2 h-8 px-3 rounded-lg border border-border bg-muted/30">
                  <UserPlus className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <input
                    placeholder="Add people by email…"
                    className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none"
                  />
                </div>
              </div>

              {/* Access list */}
              <div className="px-4 py-2">
                <p className="text-[11px] font-semibold text-muted-foreground mb-2">Project access</p>
                <div className="space-y-2">
                  {/* Collaborators link */}
                  <button onClick={() => { setShareOpen(false); openSecondaryPanel("collab", onRightPanelChange); }}
                    className="w-full flex items-center justify-between text-xs py-1 hover:text-foreground text-muted-foreground transition-colors">
                    <span>People you invited</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                  {/* Current user */}
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-violet-600 flex items-center justify-center text-white text-[11px] font-bold flex-shrink-0">
                      {(profile?.full_name ?? profile?.email ?? "U").slice(0, 1).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{profile?.full_name ?? "You"}</p>
                      <p className="text-[10px] text-muted-foreground truncate">{profile?.email}</p>
                    </div>
                    <span className="text-[11px] text-muted-foreground shrink-0">Owner</span>
                  </div>
                  {/* Invite link */}
                  <div className="flex items-center justify-between py-1">
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Link2 className="w-3.5 h-3.5" />
                      Invite link
                    </div>
                    <button
                      onClick={handleTogglePublic}
                      className={`text-[11px] px-2 py-0.5 rounded border transition-colors ${
                        project.is_public ? "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" : "border-border text-muted-foreground hover:border-border/80"
                      }`}
                    >
                      {project.is_public ? "Enabled" : "Disabled"}
                    </button>
                  </div>
                </div>
              </div>

              {/* Create invite link CTA (matches Lovable) — only visible when link is disabled */}
              {!project.is_public && (
                <div className="px-4 pb-3">
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-8 text-xs border-border/60"
                    onClick={handleTogglePublic}
                    disabled={isSharing}
                  >
                    {isSharing
                      ? <><Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />Creating…</>
                      : <><Link2 className="w-3.5 h-3.5 mr-1.5" />Create invite link</>
                    }
                  </Button>
                </div>
              )}

              {/* Actions */}
              <div className="px-4 pb-4 pt-2 space-y-2 border-t border-border/60">
                <Button
                  size="sm"
                  className="w-full h-8 text-xs bg-foreground text-background hover:bg-foreground/90"
                  onClick={() => { setShareOpen(false); handleDeploy(); }}
                >
                  <Rocket className="w-3.5 h-3.5 mr-1.5" />
                  Publish project
                </Button>
                {shareUrl && (
                  <Button variant="outline" size="sm" className="w-full h-8 text-xs border-border/60"
                    onClick={() => { copyShareUrl(); setShareOpen(false); }}>
                    <Share2 className="w-3.5 h-3.5 mr-1.5" />
                    {shareCopied ? "Link copied!" : "Share preview link"}
                  </Button>
                )}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* ── Publish — main click deploys; chevron opens settings ── */}
          <DropdownMenu>
            <div className="flex items-center flex-shrink-0">
              <Button
                size="sm"
                disabled={isDeploying}
                onClick={() => { void handleDeploy(deployProvider); }}
                className="h-7 gap-1.5 text-xs font-semibold bg-[#0066FF] hover:bg-[#0052cc] text-white border-0 rounded-r-none px-3"
              >
                {isDeploying ? <><Loader2 className="h-3 w-3 animate-spin" />Publishing…</> : <><Rocket className="h-3 w-3" />Publish</>}
              </Button>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  disabled={isDeploying}
                  className="h-7 px-1.5 text-xs bg-[#0066FF] hover:bg-[#0052cc] text-white border-0 rounded-l-none border-l border-white/20"
                  aria-label="Publish options"
                >
                  <ChevronDown className="h-3 w-3 opacity-70" />
                </Button>
              </DropdownMenuTrigger>
            </div>
            <DropdownMenuContent align="end" className="w-80 p-0 overflow-hidden">
              {/* Header */}
              <div className="flex items-center justify-between px-4 pt-4 pb-3 border-b border-border/60">
                <h3 className="text-sm font-semibold">
                  {deployStatus === "deployed" ? "Published" : deployStatus === "deploying" ? "Publishing…" : "Publish"}
                </h3>
                {deployStatus === "deployed" && (
                  <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
                    <Users className="w-3 h-3" />
                    <span>Live</span>
                  </div>
                )}
              </div>

              {/* URL */}
              <div className="px-4 py-3 border-b border-border/60">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-medium text-muted-foreground">Website URL</span>
                  <button className="text-[11px] text-[#0066FF] hover:underline"
                    onClick={() => { openSecondaryPanel("domains", onRightPanelChange); }}>
                    Add custom domain
                  </button>
                </div>
                {liveUrl ? (
                  <div className="flex items-center gap-1.5">
                    <div className="flex-1 text-xs font-mono bg-muted/40 rounded-lg px-2.5 py-1.5 text-foreground/80 truncate border border-border/40">
                      {liveUrl.replace(/^https?:\/\//, "")}
                    </div>
                    <button onClick={() => { navigator.clipboard.writeText(liveUrl); }}
                      className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                    <a href={liveUrl} target="_blank" rel="noopener noreferrer"
                      className="p-1.5 rounded-lg hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors">
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground/60">Not published yet</p>
                )}
              </div>

              {/* Visibility */}
              <div className="px-4 py-3 border-b border-border/60">
                <p className="text-[11px] font-medium text-muted-foreground mb-2">Who can see this website</p>
                <button
                  onClick={handleTogglePublic}
                  disabled={isSharing}
                  className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all ${
                    project.is_public ? "border-[#0066FF]/30 bg-[#0066FF]/5" : "border-border hover:bg-muted/30"
                  }`}
                >
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${project.is_public ? "bg-[#0066FF]/15" : "bg-muted"}`}>
                    <Globe className={`w-4 h-4 ${project.is_public ? "text-[#0066FF]" : "text-muted-foreground"}`} />
                  </div>
                  <div className="text-left flex-1">
                    <p className={`text-xs font-medium ${project.is_public ? "text-[#0066FF]" : "text-foreground"}`}>
                      {project.is_public ? "Public" : "Private"}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      {project.is_public ? "Anyone with the URL" : "Only you can access"}
                    </p>
                  </div>
                  {project.is_public && <CheckCircle2 className="w-4 h-4 text-[#0066FF] shrink-0" />}
                </button>
              </div>

              {/* Actions */}
              <div className="px-4 py-3 flex gap-2">
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs border-border/60 relative"
                  onClick={() => openSecondaryPanel("security", onRightPanelChange)}>
                  Review security
                  {securityIssueCount > 0 && (
                    <span
                      className="ml-1.5 inline-flex items-center justify-center min-w-[16px] h-4 px-1 rounded-full bg-red-500 text-white text-[10px] font-semibold tabular-nums"
                      aria-label={`${securityIssueCount} security issues`}
                    >
                      {securityIssueCount}
                    </span>
                  )}
                </Button>
                <Button variant="outline" size="sm" className="flex-1 h-8 text-xs border-border/60"
                  onClick={() => openSecondaryPanel("settings", onRightPanelChange)}>
                  Edit settings
                </Button>
              </div>

              {/* Publish / Up to date button */}
              <div className="px-4 pb-4">
                <Button
                  size="sm"
                  onClick={() => { void handleDeploy(deployProvider); }}
                  disabled={isDeploying}
                  className="w-full h-9 text-sm font-semibold bg-[#0066FF] hover:bg-[#0052cc] text-white"
                >
                  {isDeploying ? (
                    <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Publishing…</>
                  ) : deployStatus === "deployed" ? (
                    <><CheckCircle2 className="h-4 w-4 mr-2" />Up to date</>
                  ) : (
                    <><Rocket className="h-4 w-4 mr-2" />Publish</>
                  )}
                </Button>
                {/* Provider selector */}
                <div className="flex gap-2 mt-2">
                  {(["netlify", "vercel"] as const).map((p) => (
                    <button
                      key={p}
                      onClick={() => setDeployProvider(p)}
                      className={`flex-1 h-7 rounded-lg text-[11px] font-medium border transition-all ${
                        deployProvider === p
                          ? "bg-[#0066FF]/10 border-[#0066FF]/30 text-[#0066FF]"
                          : "border-border/60 text-muted-foreground hover:bg-muted/40"
                      }`}
                    >
                      {p.charAt(0).toUpperCase() + p.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Dialogs ── */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete project?</DialogTitle>
            <DialogDescription>
              This will permanently delete <strong>{project.name}</strong> and all its files. This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>Cancel</Button>
            <Button variant="destructive" onClick={handleDeleteProject}>Delete</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showRenameDialog} onOpenChange={setShowRenameDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Rename project</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <input
              className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-[#0066FF]/30"
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") void handleRenameProject(); }}
              placeholder="Project name"
              autoFocus
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowRenameDialog(false)}>Cancel</Button>
            <Button onClick={() => void handleRenameProject()}>Rename</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </TooltipProvider>
  );
}
