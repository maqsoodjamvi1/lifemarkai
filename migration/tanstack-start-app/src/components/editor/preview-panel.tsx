
import { useState,useMemo,useCallback,useEffect,useRef } from "react";
import {
RefreshCw,Smartphone,Tablet,Monitor,
ExternalLink,MousePointer,Terminal,Loader2,
Check,X,Wand2,AlignLeft,AlignCenter,AlignRight,
AlertTriangle,Wrench,Frame,MessageSquarePlus,Pencil,Pin,Globe,ChevronDown,ChevronUp,ChevronLeft,ChevronRight,Maximize2,Minimize2
} from "lucide-react";
import {
Tooltip,TooltipContent,TooltipProvider,TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AnimatePresence,motion } from "framer-motion";
// NOTE: `claimVisualEditCredit` is imported statically here on purpose. It used
// to be pulled in via `await import("./visual-edit-overlay")` further down, but
// this module is ALREADY statically imported on this very line — so the dynamic
// import could never split it into its own chunk. Vite said so directly:
//   "visual-edit-overlay.tsx is dynamically imported ... but also statically
//    imported by preview-panel.tsx, dynamic import will not move module into
//    another chunk"
// Keeping both forms just paid the cost of an async boundary for no code-split.
import { VebBridgePopover,claimVisualEditCredit } from "./visual-edit-overlay";
import { PreviewAnnotations } from "./preview-annotations";
import { PreviewCommentPins } from "./preview-comment-pins";
import { PreviewAnnotateModal } from "./preview-annotate-modal";
import { LifemarkBadge } from "@/components/shared/lifemark-badge";
import type { ProjectFile } from "@/types/database";
import { EMPTY_PREVIEW_HTML } from "@/lib/preview/build-fallback-html";
import { buildStaticPreview } from "@/lib/preview/build-static-preview";
import { resolveProjectRuntime, type ProjectRuntime } from "@/lib/project/runtime";
import { filesContentSignature } from "@/lib/preview/files-signature";
import { getRefreshEffectiveFiles } from "./preview-panel-utils";
import {
isWebContainerPreviewEnabled,
type PreviewEngine,
} from "@/lib/preview/resolve-preview-engine";
import {
isSamePreviewOrigin,
normalizeSandboxPathname,
sandboxUrlWithPath,
} from "@/lib/preview/sandbox-url";
import { getPreviewBarLabel } from "@/lib/preview/preview-url";
import { useSandboxPreview } from "@/lib/preview/use-sandbox-preview";
import { usePreviewErrorGuard } from "@/hooks/use-preview-error-guard";
import { isNoisePreviewError,type PreviewErrorReport } from "@/lib/preview/preview-error-bridge";
import { derivePreviewPages } from "@/lib/preview/derive-pages";
import { appendPreviewDiagnosis,buildPreviewDiagnosis } from "@/lib/preview/diagnose-preview";
import { applyVisualEdit,buildVisualEditPrompt } from "@/lib/editor/apply-visual-edit";
import { PreviewHealingOverlay } from "./preview-healing-overlay";
import { Link } from "@tanstack/react-router";
import { LovablePreviewInteractionToolbar } from "./lovable/preview-interaction-toolbar";
import { LovablePreviewStatusPill } from "./lovable/preview-status-pill";
import { LovableVersionPreviewBanner } from "./lovable/version-preview-banner";
import { type PreviewPerfSnapshot } from "@/lib/preview/preview-perf-bridge";
import {
describePreviewError,
shouldShowRawPreviewDiagnostics,
} from "@/lib/preview/preview-error-copy";
import { createClient } from "@/lib/supabase/client";

// Visual Edit Bridge — injected into Sandpack iframe via files map
type DeviceSize = "mobile" | "tablet" | "desktop";
type PreviewMachineState = "idle" | "building" | "loading" | "ready" | "error" | "unavailable";

const PREVIEW_RELEVANT_FILE_RE = /(^|\/)(package\.json|index\.html|vite\.config\.[cm]?[jt]s|tailwind\.config\.[cm]?[jt]s|postcss\.config\.[cm]?js)$|(^|\/)(src|app|components|pages|lib|hooks|styles|public|assets)\//i;
const PREVIEW_RELEVANT_EXT_RE = /\.(tsx?|jsx?|css|scss|sass|html|json|svg|png|jpe?g|gif|webp|avif|ico|woff2?|ttf|otf)$/i;

function isPreviewRelevantFile(path: string): boolean {
  const clean = path.replace(/\\/g, "/");
  if (/\.(md|mdx|sql|log|txt|csv|yml|yaml)$/i.test(clean)) return false;
  if (/^(supabase|docs|outputs|scripts|\.github)\//i.test(clean)) return false;
  return PREVIEW_RELEVANT_FILE_RE.test(clean) || PREVIEW_RELEVANT_EXT_RE.test(clean);
}

function previewRelevantFiles(files: ProjectFile[]): ProjectFile[] {
  return files.filter((file) => isPreviewRelevantFile(file.path));
}

interface VebElement {
  tagName: string;
  textContent: string;
  classList: string[];
  xpath: string;
  rect: { top: number; left: number; width: number; height: number };
}

interface PreviewPanelProps {
  files: ProjectFile[];
  framework?: string | null;
  runtime?: ProjectRuntime | null;
  projectId?: string;
  activeFile?: ProjectFile | null;
  isVisualEditActive?: boolean;
  onVisualEditToggle?: () => void;
  onFileUpdate?: (file: ProjectFile) => void;
  onError?: (error: string) => void;
  onErrorReport?: (report: PreviewErrorReport | null) => void;
  onFixWithAI?: (error: string) => void;
  /** When true, use WebContainers for preview instead of static bundler */
  useWebContainers?: boolean;
  /** When true, overlay a generation shimmer with file count */
  isGenerating?: boolean;
  /** Number of files currently being written by the AI */
  generatingFileCount?: number;
  /** Live deployed URL — used by Open in new tab */
  deployedUrl?: string;
  /** When true, the "Built with LifemarkAI" badge is hidden (Pro feature) */
  badgeHidden?: boolean;
  /** Send annotated screenshot + prompt to chat */
  onSendAnnotatedToChat?: (prompt: string, imageBase64: string) => void;
  /** When 0, hide preview errors and show upgrade state instead of fix prompts */
  credits?: number;
  /** Send a plain prompt to the chat panel (visual-edit AI fallback) */
  onSendPromptToChat?: (prompt: string) => void;
  /** When set, an older snapshot's files are being previewed (Lovable-parity
   *  per-message "Preview this version") — shows an amber banner and disables
   *  visual edits, since edits against stale files would be wrong. */
  versionPreviewLabel?: string | null;
  /** When true, hide the internal URL/device toolbar — top bar owns chrome. */
  hideTopChrome?: boolean;
  /** Open an editor side panel (e.g. comments) from the preview toolbar. */
  onOpenPanel?: (panel: string) => void;
  /** When true, inject the guest comments embed into fallback / WebContainer previews. */
  isPublic?: boolean;
}

const DEVICE_WIDTHS: Record<DeviceSize, string> = {
  mobile: "390px",
  tablet: "768px",
  desktop: "100%",
};

const TAILWIND_SIZES = ["text-xs","text-sm","text-base","text-lg","text-xl","text-2xl","text-3xl","text-4xl"];
const TAILWIND_WEIGHTS = ["font-normal","font-medium","font-semibold","font-bold","font-extrabold"];
const TAILWIND_COLORS = [
  "text-white","text-black","text-gray-500","text-red-500",
  "text-blue-500","text-green-500","text-yellow-500","text-purple-500",
];
const BG_COLORS = [
  "bg-transparent","bg-white","bg-black","bg-gray-100",
  "bg-blue-500","bg-green-500","bg-red-500","bg-yellow-500",
];

// ── Device frame components ───────────────────────────────────────────────────

function useScaleToFit(naturalW: number, naturalH: number) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  useEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    const measure = () => {
      const { clientWidth: w, clientHeight: h } = el;
      if (w < 8 || h < 8) return;
      setScale(Math.min(1, w / naturalW, h / naturalH));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [naturalW, naturalH]);
  return { hostRef, scale };
}

function PhoneFrame({ children }: { children: React.ReactNode }) {
  const { hostRef, scale } = useScaleToFit(390, 812);
  return (
    <div ref={hostRef} data-device-container className="relative flex h-full w-full items-center justify-center overflow-hidden py-4">
      {/* Outer bezel — ScaledIframe: scale-to-fit viewport */}
      <div
        data-scaled-iframe
        className="relative flex flex-col rounded-[44px] overflow-hidden shadow-[0_0_0_2px_#3a3a3c,0_0_0_8px_#1c1c1e,0_20px_60px_rgba(0,0,0,0.7)] origin-center"
        style={{
          width: 390,
          height: 812,
          background: "#000",
          flexShrink: 0,
          transform: `scale(${scale})`,
        }}
      >
        {/* Dynamic Island */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-28 h-7 bg-black rounded-full z-20 flex items-center justify-center gap-2">
          <div className="w-2.5 h-2.5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a]" />
          <div className="w-3.5 h-3.5 rounded-full bg-[#1a1a1a] border border-[#2a2a2a]" />
        </div>
        {/* Status bar */}
        <div className="relative z-10 flex items-center justify-between px-8 pt-4 pb-1 text-white bg-transparent pointer-events-none">
          <span className="text-[13px] font-semibold">9:41</span>
          <div className="flex items-center gap-1.5 text-white">
            <svg width="17" height="12" viewBox="0 0 17 12" fill="currentColor" opacity="0.9"><rect x="0" y="3" width="3" height="9" rx="1"/><rect x="4.5" y="2" width="3" height="10" rx="1"/><rect x="9" y="0" width="3" height="12" rx="1"/><rect x="13.5" y="0" width="3" height="12" rx="1" opacity="0.3"/></svg>
            <svg width="16" height="12" viewBox="0 0 16 12" fill="currentColor" opacity="0.9"><path d="M8 2.4C5.1 2.4 2.5 3.7 0.8 5.8L2.2 7.2C3.5 5.5 5.6 4.4 8 4.4s4.5 1.1 5.8 2.8l1.4-1.4C13.5 3.7 10.9 2.4 8 2.4zM8 6.4c-1.6 0-3 .7-4 1.8L5.4 9.6C6.1 8.8 7 8.4 8 8.4s1.9.4 2.6 1.2l1.4-1.4C11 7.1 9.6 6.4 8 6.4zM8 10.4c-.6 0-1.1.2-1.5.5L8 13l1.5-2.1c-.4-.3-.9-.5-1.5-.5z"/></svg>
            <svg width="25" height="12" viewBox="0 0 25 12" fill="currentColor" opacity="0.9"><rect x="0" y="1" width="21" height="10" rx="2.5" stroke="white" strokeWidth="1" fill="none" opacity="0.4"/><rect x="22" y="4" width="3" height="4" rx="1"/><rect x="1.5" y="2.5" width="16" height="7" rx="1.5"/></svg>
          </div>
        </div>
        {/* Screen content */}
        <div className="flex-1 overflow-hidden">{children}</div>
        {/* Home indicator */}
        <div className="flex justify-center pb-2 pt-1 bg-black">
          <div className="w-28 h-1 bg-white/30 rounded-full" />
        </div>
      </div>
    </div>
  );
}

function TabletFrame({ children }: { children: React.ReactNode }) {
  const { hostRef, scale } = useScaleToFit(768, 680);
  return (
    <div ref={hostRef} data-device-container className="relative flex h-full w-full items-center justify-center overflow-hidden py-4">
      <div
        data-scaled-iframe
        className="relative rounded-[24px] overflow-hidden shadow-[0_0_0_2px_#3a3a3c,0_0_0_10px_#1c1c1e,0_20px_60px_rgba(0,0,0,0.7)] origin-center"
        style={{
          width: 768,
          height: 680,
          background: "#000",
          flexShrink: 0,
          transform: `scale(${scale})`,
        }}
      >
        {/* Camera */}
        <div className="absolute top-3 left-1/2 -translate-x-1/2 w-2 h-2 bg-[#2a2a2a] rounded-full z-20 border border-[#3a3a3c]" />
        {/* Status bar */}
        <div className="relative z-10 flex items-center justify-between px-6 pt-2 pb-1 text-white bg-transparent pointer-events-none">
          <span className="text-[12px] font-semibold">9:41</span>
          <div className="flex items-center gap-1.5">
            <svg width="16" height="11" viewBox="0 0 17 12" fill="currentColor" opacity="0.9"><rect x="0" y="3" width="3" height="9" rx="1"/><rect x="4.5" y="2" width="3" height="10" rx="1"/><rect x="9" y="0" width="3" height="12" rx="1"/></svg>
            <svg width="22" height="11" viewBox="0 0 25 12" fill="currentColor" opacity="0.9"><rect x="0" y="1" width="21" height="10" rx="2.5" stroke="white" strokeWidth="1" fill="none" opacity="0.4"/><rect x="22" y="4" width="3" height="4" rx="1"/><rect x="1.5" y="2.5" width="16" height="7" rx="1.5"/></svg>
          </div>
        </div>
        <div className="flex-1 overflow-hidden h-[calc(100%-32px)]">{children}</div>
        {/* Home bar */}
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 w-20 h-1 bg-white/20 rounded-full" />
      </div>
    </div>
  );
}

export function PreviewPanel({
  files,
  framework,
  runtime,
  projectId,
  activeFile,
  isVisualEditActive,
  onVisualEditToggle,
  onFileUpdate,
  onError,
  onErrorReport,
  onFixWithAI,
  useWebContainers,

  isGenerating = false,
  generatingFileCount = 0,
  deployedUrl,
  badgeHidden = false,
  onSendAnnotatedToChat,
  credits,
  onSendPromptToChat,
  versionPreviewLabel = null,
  hideTopChrome = false,
  onOpenPanel,
  isPublic = false,
}: PreviewPanelProps) {
  const outOfCredits = credits !== undefined && credits <= 0;
  const [device, setDevice] = useState<DeviceSize>("desktop");
  const [showFrame, setShowFrame] = useState(true);
  // Compact toolbar toggle (Lovable parity, Jun 23 2026) — persisted
  const [toolbarCollapsed, setToolbarCollapsed] = useState(() => {
    try { return localStorage.getItem("lifemark-preview-toolbar-collapsed") === "1"; } catch { return false; }
  });
  // In-app fullscreen preview (Esc exits)
  const [previewFullscreen, setPreviewFullscreen] = useState(false);
  useEffect(() => {
    if (!previewFullscreen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setPreviewFullscreen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [previewFullscreen]);
  // Route navigation history for the address bar's back/forward buttons
  const [routeNav, setRouteNav] = useState<{ stack: string[]; idx: number }>({ stack: ["/"], idx: 0 });
  const navSuppressRef = useRef(false);
  const [refreshKey, setRefreshKey] = useState(0);
  // Tracks the in-iframe pathname so the URL bar reflects React Router
  // navigations inside the preview. Updated by `lifemark-preview-location`
  // postMessage events from the iframe (see the URL-sync script injected
  // into fallbackHtml below). Defaults to "/" until the first nav fires.
  const [previewPath, setPreviewPath] = useState<string>("/");
  const previewPathRef = useRef("/");
  previewPathRef.current = previewPath;
  // Local-edit copy of the URL while user types; commits to navigation on
  // Enter, falls back to previewPath when the input loses focus without
  // committing.
  const [urlInput, setUrlInput] = useState<string>("/");
  const [urlEditing, setUrlEditing] = useState(false);
  const [visualEdit, setVisualEdit] = useState(isVisualEditActive ?? false);
  // Visual edits are suppressed while previewing an older version — edits
  // against stale files would target code that no longer exists.
  const visualEditEnabled = visualEdit && !versionPreviewLabel;
  const [showConsole, setShowConsole] = useState(false);
  const [previewBottomTab, setPreviewBottomTab] = useState<"console" | "network" | "perf">("console");
  /** WebContainer tunnel URL — published to the live-preview bus for agent/tests. */
  const [wcPreviewUrl, setWcPreviewUrl] = useState<string | null>(null);
  const [annotateScreenshot, setAnnotateScreenshot] = useState<string | null>(null);
  const [commentPinMode, setCommentPinMode] = useState(false);
  const [pendingComment, setPendingComment] = useState<VebElement | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  type ElementCommentPin = {
    id: string;
    content: string;
    element_xpath: string;
    element_tag?: string | null;
    page_path?: string | null;
    element_preview?: string | null;
    is_guest?: boolean;
    guest_name?: string | null;
    resolved?: boolean;
    parent_id?: string | null;
  };
  const [elementCommentPins, setElementCommentPins] = useState<ElementCommentPin[]>([]);
  /** All unresolved top-level comments (guest + team) for the unread tray. */
  const [openCommentCount, setOpenCommentCount] = useState(0);
  const [activePinComment, setActivePinComment] = useState<ElementCommentPin | null>(null);
  const [pinResolving, setPinResolving] = useState(false);
  const { toast } = useToast();
  const [previewEngine, setPreviewEngine] = useState<PreviewEngine>(() => {
    return "unavailable";
  });
  const [consoleLines, setConsoleLines] = useState<{ type: string; text: string }[]>([]);
  const [networkLines, setNetworkLines] = useState<
    {
      method: string;
      url: string;
      status?: number;
      ok?: boolean;
      durationMs?: number;
      contentType?: string;
      error?: string;
    }[]
  >([]);
  const [perfSnapshot, setPerfSnapshot] = useState<PreviewPerfSnapshot | null>(null);
  const clearPreviewLogs = useCallback(() => {
    setConsoleLines([]);
    setNetworkLines([]);
    setPerfSnapshot(null);
  }, []);

  // Seed Console/Network tabs from durable telemetry (migration 094) on mount.
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void fetch(`/api/projects/${projectId}/preview-telemetry`)
      .then((r) => (r.ok ? r.json() : null))
      .then((data: {
        console?: Array<{ type?: string; text?: string }>;
        network?: Array<{
          method?: string;
          url?: string;
          status?: number;
          ok?: boolean;
          durationMs?: number;
          contentType?: string;
          error?: string;
        }>;
      } | null) => {
        if (cancelled || !data) return;
        const cons = (data.console ?? [])
          .filter((l) => typeof l?.text === "string" && l.text.length > 0)
          .slice(-100)
          .map((l) => ({ type: l.type ?? "log", text: l.text! }));
        const net = (data.network ?? [])
          .filter((l) => typeof l?.url === "string" && l.url.length > 0)
          .slice(-100)
          .map((l) => ({
            method: (l.method ?? "GET").toUpperCase(),
            url: l.url!,
            status: l.status,
            ok: l.ok,
            durationMs: l.durationMs,
            contentType: l.contentType,
            error: l.error,
          }));
        if (cons.length > 0) {
          setConsoleLines((prev) => (prev.length > 0 ? prev : cons));
        }
        if (net.length > 0) {
          setNetworkLines((prev) => (prev.length > 0 ? prev : net));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [projectId]);

  const [previewMachineState, setPreviewMachineState] = useState<PreviewMachineState>("idle");
  const previewBuildShaRef = useRef<string>("");
  const previewEngineRef = useRef(previewEngine);
  previewEngineRef.current = previewEngine;
  // Stable forever — never put this in effect deps that also setState, or a
  // new callback identity + always-new routeNav object causes Maximum update depth.
  const transitionPreviewMachine = useCallback((next: PreviewMachineState, reason: string) => {
    setPreviewMachineState((prev) => {
      if (prev === next) return prev;
      const payload = {
        from: prev,
        to: next,
        reason,
        engine: previewEngineRef.current,
        buildSha: previewBuildShaRef.current,
        at: Date.now(),
      };
      // Defer side effects — calling setState inside a setState updater can cascade
      // into Maximum update depth with parent error-report handlers.
      queueMicrotask(() => {
        window.dispatchEvent(new CustomEvent("lifemark-preview-machine-transition", { detail: payload }));
        setConsoleLines((lines) => [
          ...lines.slice(-99),
          { type: "log", text: `[preview] ${payload.from} -> ${payload.to}: ${payload.reason}` },
        ]);
      });
      return next;
    });
  }, []);
  // Real cloud sandbox preview (Modal — Lovable parity).
  const {
    previewUrl: sandboxUrl,
    enabled: sandboxEnabled,
    provider: sandboxProvider,
    stopPreview: stopSandboxPreview,
    syncFiles: syncSandboxFiles,
    requestPreview: requestSandboxPreview,
    reconnectPreview: reconnectSandboxPreview,
    sandboxId,
    loading: sandboxLoading,
    error: sandboxError,
    logs: sandboxLogs,
    phase: sandboxPhase,
    phaseDetail: sandboxPhaseDetail,
    statusResolved: sandboxStatusResolved,
    reloadNonce: sandboxReloadNonce,
  } = useSandboxPreview(projectId ?? "");
  const sandboxIdLiveRef = useRef(sandboxId);
  sandboxIdLiveRef.current = sandboxId;
  const previewErrorCopy = useMemo(
    () => describePreviewError(sandboxError),
    [sandboxError],
  );
  const showRawDiagnostics = shouldShowRawPreviewDiagnostics(
    process.env.NODE_ENV === "development",
  );
  /** Hard iframe path — soft-nav updates previewPath only (VEB postMessage). */
  const [sandboxIframePath, setSandboxIframePath] = useState("/");
  const [sandboxSyncInstalling, setSandboxSyncInstalling] = useState(false);
  // Bridge liveness — used to remount when the iframe escapes to an OAuth host
  // (Supabase/Google) where our injected bridge no longer runs.
  const sandboxBridgeAliveRef = useRef(false);
  const sandboxPingTokenRef = useRef(0);
  const sandboxPongTokenRef = useRef(0);
  const sandboxEscapeRemountAtRef = useRef(0);
  const sandboxUrlLiveRef = useRef(sandboxUrl);
  sandboxUrlLiveRef.current = sandboxUrl;

  // Reset hard path when a new Modal tunnel comes up.
  useEffect(() => {
    if (sandboxUrl) setSandboxIframePath("/");
  }, [sandboxUrl, sandboxId]);

  // Fresh iframe mount → require a new bridge handshake before escape detection.
  useEffect(() => {
    sandboxBridgeAliveRef.current = false;
  }, [sandboxUrl, refreshKey, sandboxReloadNonce]);
  const previewBarLabel = useMemo(
    () =>
      getPreviewBarLabel({
        projectId: projectId ?? undefined,
        previewPath,
        deployedUrl: deployedUrl ?? null,
        sandboxUrl: previewEngine === "sandbox" ? sandboxUrl : null,
      }),
    [projectId, previewPath, deployedUrl, previewEngine, sandboxUrl],
  );
  const [vebSelected, setVebSelected] = useState<VebElement | null>(null);
  const [vebSelectedList, setVebSelectedList] = useState<VebElement[]>([]);
  const [selectionClearSignal, setSelectionClearSignal] = useState(0);
  const clearVebSelection = useCallback(() => {
    setVebSelected(null);
    setVebSelectedList([]);
    setSelectionClearSignal((n) => n + 1);
  }, []);
  const [activeError, setActiveError] = useState<string | null>(null);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [previewCompileFailed, setPreviewCompileFailed] = useState(false);
  const [previewCompileOk, setPreviewCompileOk] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const runtimeContainerRef = useRef<HTMLDivElement>(null);

  // ── In-browser (WebContainer) engine state ────────────────────────────────
  // Boot is once-per-page and install is slow, so this is driven by an effect
  // keyed on the project — NOT on `files`, which changes on every keystroke and
  // would otherwise reinstall dependencies continuously.
  const [wcUrl, setWcUrl] = useState<string | null>(null);
  const [wcError, setWcError] = useState<string | null>(null);
  const [wcPhase, setWcPhase] = useState<string | null>(null);
  const [wcNonce, setWcNonce] = useState(0);
  const sandboxIframeRef = useRef<HTMLIFrameElement>(null);
  const unifiedIframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [annotationsEnabled, setAnnotationsEnabled] = useState(false);
  const [editTextMode, setEditTextMode] = useState(false);
  const editTextModeRef = useRef(false);
  editTextModeRef.current = editTextMode;
  /** Staged inline text edits — preview in iframe until Clear / Send (Lovable pending tray). */
  const [pendingVisualEdits, setPendingVisualEdits] = useState<
    Array<{
      id: string;
      element: VebElement;
      originalText: string;
      nextText: string;
    }>
  >([]);
  const pendingVisualEditsRef = useRef(pendingVisualEdits);
  pendingVisualEditsRef.current = pendingVisualEdits;
  const [commentsBannerDismissed, setCommentsBannerDismissed] = useState(false);
  const [isRevertingPreview, setIsRevertingPreview] = useState(false);

  useEffect(() => {
    const onReverting = () => {
      setIsRevertingPreview(true);
      window.setTimeout(() => setIsRevertingPreview(false), 2800);
    };
    window.addEventListener("lifemark-preview-reverting", onReverting);
    return () => window.removeEventListener("lifemark-preview-reverting", onReverting);
  }, []);
  const prevOpenCommentCountRef = useRef(0);
  useEffect(() => {
    // Re-show tray when new open comments arrive after a dismiss.
    if (openCommentCount > prevOpenCommentCountRef.current) {
      setCommentsBannerDismissed(false);
    }
    prevOpenCommentCountRef.current = openCommentCount;
  }, [openCommentCount]);
  const [annotationMeta, setAnnotationMeta] = useState({
    count: 0,
    canUndo: false,
    canRedo: false,
  });

  useEffect(() => {
    const onMeta = (e: Event) => {
      const detail = (e as CustomEvent<{ count?: number; canUndo?: boolean; canRedo?: boolean }>).detail;
      if (!detail) return;
      setAnnotationMeta({
        count: detail.count ?? 0,
        canUndo: !!detail.canUndo,
        canRedo: !!detail.canRedo,
      });
    };
    window.addEventListener("lifemark-preview-annotations-meta", onMeta);
    return () => window.removeEventListener("lifemark-preview-annotations-meta", onMeta);
  }, []);

  const onFixWithAIRef = useRef(onFixWithAI);
  onFixWithAIRef.current = onFixWithAI;
  const onFileUpdateRef = useRef(onFileUpdate);
  onFileUpdateRef.current = onFileUpdate;
  const onSendPromptToChatRef = useRef(onSendPromptToChat);
  onSendPromptToChatRef.current = onSendPromptToChat;
  const filesRef = useRef(files);
  filesRef.current = files;
  const onHealRequestStable = useCallback((prompt: string, report: PreviewErrorReport) => {
    onFixWithAIRef.current?.(appendPreviewDiagnosis(prompt, filesRef.current, report.errors));
  }, []);

  const errorGuard = usePreviewErrorGuard({
    iframeRef: unifiedIframeRef,
    onHealRequest: onHealRequestStable,
    // `autoHeal` defaults to false, so omitting it left the documented
    // self-healing loop manual-only: buildHealingPrompt / onHealRequest fired
    // solely when the user clicked "Try to fix". The loop is already bounded by
    // MAX_AUTO_FIX_ATTEMPTS (3) in chat-panel, after which the recovery banner
    // takes over, so enabling it cannot spin.
    autoHeal: true,
  });

  const previewDiagnosis = useMemo(
    () => buildPreviewDiagnosis(files, errorGuard.report?.errors ?? []),
    [files, errorGuard.report],
  );

  const onErrorReportRef = useRef(onErrorReport);
  onErrorReportRef.current = onErrorReport;
  useEffect(() => {
    onErrorReportRef.current?.(errorGuard.report);
  }, [errorGuard.report]);

  const handleFixWithAI = useCallback(
    (error: string) => {
      if (errorGuard.report?.errors.length) {
        errorGuard.startHealing();
      } else if (!isNoisePreviewError(error)) {
        onFixWithAIRef.current?.(appendPreviewDiagnosis(
          `Fix this preview error:\n\n${error}`,
          filesRef.current,
          [{ kind: "runtime", message: error, timestamp: Date.now() }],
        ));
      }
    },
    [errorGuard.report, errorGuard.startHealing],
  );

  useEffect(() => {
    function onHealStart() {
      errorGuard.enterHealingPhase();
    }
    function onHealFailed() {
      errorGuard.failHealing();
    }
    window.addEventListener("lifemark-preview-heal-start", onHealStart);
    window.addEventListener("lifemark-preview-heal-failed", onHealFailed);
    return () => {
      window.removeEventListener("lifemark-preview-heal-start", onHealStart);
      window.removeEventListener("lifemark-preview-heal-failed", onHealFailed);
    };
  }, [errorGuard.enterHealingPhase, errorGuard.failHealing]);

  useEffect(() => {
    if (isVisualEditActive !== undefined) setVisualEdit(isVisualEditActive);
  }, [isVisualEditActive]);

  useEffect(() => {
    if (!visualEditEnabled) clearVebSelection();
  }, [visualEditEnabled, clearVebSelection]);

  const getPreviewContentWindow = useCallback((): Window | null => {
    if (previewEngine === "webcontainer") {
      return runtimeContainerRef.current?.querySelector("iframe")?.contentWindow ?? null;
    }
    if (previewEngine === "sandbox") {
      return sandboxIframeRef.current?.contentWindow ?? null;
    }
    return iframeRef.current?.contentWindow ?? null;
  }, [previewEngine]);

  // Keep cross-origin preview iframes' visual-edit picker in sync with the toggle.
  useEffect(() => {
    if (previewEngine !== "webcontainer" && previewEngine !== "sandbox") return;
    const win = getPreviewContentWindow();
    win?.postMessage({ type: "lifemark-veb-mode", enabled: visualEditEnabled }, "*");
    if (!visualEditEnabled) {
      win?.postMessage({ type: "lifemark-veb-clear" }, "*");
    }
  }, [visualEditEnabled, previewEngine, getPreviewContentWindow]);

  // Comment-pin mode on sandbox / WebContainer (VEB bridge handles clicks).
  useEffect(() => {
    if (previewEngine !== "webcontainer" && previewEngine !== "sandbox") return;
    getPreviewContentWindow()?.postMessage(
      { type: "lifemark-comment-pin-mode", enabled: commentPinMode },
      "*",
    );
  }, [commentPinMode, previewEngine, getPreviewContentWindow]);

  // Edit-text mode: single-click leaf edit inside the VEB bridge.
  useEffect(() => {
    getPreviewContentWindow()?.postMessage(
      { type: "lifemark-veb-edit-text-mode", enabled: editTextMode && visualEditEnabled },
      "*",
    );
  }, [editTextMode, visualEditEnabled, previewEngine, getPreviewContentWindow]);

  const refreshElementCommentPins = useCallback(async () => {
    if (!projectId) {
      setElementCommentPins([]);
      setOpenCommentCount(0);
      return;
    }
    try {
      const res = await fetch(`/api/projects/${projectId}/comments`);
      if (!res.ok) return;
      const rows = (await res.json()) as ElementCommentPin[];
      const openTop = rows.filter((c) => !c.parent_id && !c.resolved);
      setOpenCommentCount(openTop.length);
      setElementCommentPins(
        openTop.filter(
          (c) => typeof c.element_xpath === "string" && !!c.element_xpath,
        ),
      );
    } catch {
      /* ignore */
    }
  }, [projectId]);

  useEffect(() => {
    void refreshElementCommentPins();
  }, [refreshElementCommentPins]);

  useEffect(() => {
    if (!projectId) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`preview-comment-pins:${projectId}:${crypto.randomUUID()}`)
      .on(
        "postgres_changes" as never,
        {
          event: "*",
          schema: "public",
          table: "project_comments",
          filter: `project_id=eq.${projectId}`,
        },
        () => {
          void refreshElementCommentPins();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [projectId, refreshElementCommentPins]);

  const pinsForCurrentPage = useMemo(() => {
    return elementCommentPins.filter((c) => {
      const page = c.page_path || "/";
      return page === previewPath || page === "*" || !c.page_path;
    });
  }, [elementCommentPins, previewPath]);

  // Same-origin srcdoc engine renders pins as a DOM overlay (no VEB bridge).
  const srcdocCommentPins = useMemo(
    () =>
      pinsForCurrentPage.map((c, i) => ({
        id: c.id,
        xpath: c.element_xpath ?? "",
        label: c.content?.slice(0, 80) || `Comment ${i + 1}`,
      })),
    [pinsForCurrentPage],
  );

  const pushCommentPinsToPreview = useCallback(() => {
    const pins = pinsForCurrentPage.map((c, i) => ({
      id: c.id,
      xpath: c.element_xpath,
      label: c.content?.slice(0, 80) || `Comment ${i + 1}`,
    }));
    getPreviewContentWindow()?.postMessage({ type: "lifemark-comment-pins", pins }, "*");
  }, [pinsForCurrentPage, getPreviewContentWindow]);
  const pushCommentPinsToPreviewRef = useRef(pushCommentPinsToPreview);
  pushCommentPinsToPreviewRef.current = pushCommentPinsToPreview;
  const elementCommentPinsRef = useRef(elementCommentPins);
  elementCommentPinsRef.current = elementCommentPins;

  useEffect(() => {
    pushCommentPinsToPreview();
  }, [pushCommentPinsToPreview, previewEngine, refreshKey]);

  // Jump from Comments panel → highlight element + open pin popover.
  useEffect(() => {
    function onJump(e: Event) {
      const detail = (e as CustomEvent<{
        commentId?: string;
        xpath?: string;
        pagePath?: string | null;
      }>).detail;
      if (!detail?.xpath) return;
      if (detail.pagePath && detail.pagePath !== previewPath && detail.pagePath !== "*") {
        window.dispatchEvent(
          new CustomEvent("lifemark-preview-navigate", { detail: { pathname: detail.pagePath } }),
        );
      }
      getPreviewContentWindow()?.postMessage(
        {
          type: "lifemark-comment-pin-focus",
          xpath: detail.xpath,
          commentId: detail.commentId,
        },
        "*",
      );
      const match =
        elementCommentPins.find((c) => c.id === detail.commentId) ||
        elementCommentPins.find((c) => c.element_xpath === detail.xpath);
      if (match) setActivePinComment(match);
    }
    window.addEventListener("lifemark-jump-to-comment-element", onJump);
    return () => window.removeEventListener("lifemark-jump-to-comment-element", onJump);
  }, [elementCommentPins, getPreviewContentWindow, previewPath]);

  const applyPreviewText = useCallback(
    (xpath: string, text: string) => {
      getPreviewContentWindow()?.postMessage(
        { type: "lifemark-veb-apply", xpath, text },
        "*",
      );
      // Same-origin srcdoc: also write the DOM directly (no VEB bridge listener).
      const doc = iframeRef.current?.contentDocument;
      if (!doc) return;
      try {
        const node = doc.evaluate(
          xpath.startsWith("//") ? xpath : `//${xpath}`,
          doc,
          null,
          XPathResult.FIRST_ORDERED_NODE_TYPE,
          null,
        ).singleNodeValue as HTMLElement | null;
        if (node) node.textContent = text;
      } catch {
        /* ignore */
      }
    },
    [getPreviewContentWindow],
  );
  const stagePendingTextEdit = useCallback((element: VebElement, nextText: string) => {
    setPendingVisualEdits((prev) => {
      const idx = prev.findIndex((p) => p.element.xpath === element.xpath);
      const originalText = idx >= 0 ? prev[idx].originalText : element.textContent;
      const entry = {
        id: idx >= 0 ? prev[idx].id : `${element.xpath}:${Date.now()}`,
        element: { ...element, textContent: originalText },
        originalText,
        nextText,
      };
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = entry;
        return next;
      }
      return [...prev, entry];
    });
    applyPreviewText(element.xpath, nextText);
  }, [applyPreviewText]);
  const stagePendingTextEditRef = useRef(stagePendingTextEdit);
  stagePendingTextEditRef.current = stagePendingTextEdit;

  const clearPendingVisualEdits = useCallback(() => {
    for (const edit of pendingVisualEditsRef.current) {
      applyPreviewText(edit.element.xpath, edit.originalText);
    }
    setPendingVisualEdits([]);
  }, [applyPreviewText]);

  const sendPendingVisualEdits = useCallback(() => {
    const edits = pendingVisualEditsRef.current;
    if (edits.length === 0) return;
    void (async () => {
      let applied = 0;
      let prompted = 0;
      const remaining = [...edits];
      let working = filesRef.current;
      for (let i = 0; i < edits.length; i++) {
        const edit = edits[i];
        // One claim per staged edit (Lovable free-edit quota parity).
        const claimed = await claimVisualEditCredit(projectId);
        if (!claimed.ok) {
          setPendingVisualEdits(remaining.slice(i));
          toast({
            title: claimed.insufficient ? "Out of credits" : "Couldn't apply edits",
            description: claimed.insufficient
              ? applied > 0
                ? `Saved ${applied} edit${applied === 1 ? "" : "s"}; daily free edits used — add credits for the rest.`
                : "Daily free edits used — add credits to save visual text changes."
              : "Try again in a moment.",
            variant: "destructive",
          });
          return;
        }
        const result = applyVisualEdit(working, edit.element, { text: edit.nextText });
        if (result) {
          const file = working.find((f) => f.path === result.path);
          if (file && onFileUpdateRef.current) {
            const nextFile = { ...file, content: result.content };
            onFileUpdateRef.current(nextFile);
            working = working.map((f) => (f.path === result.path ? nextFile : f));
            filesRef.current = working;
            applied += 1;
          }
        } else {
          onSendPromptToChatRef.current?.(
            buildVisualEditPrompt(edit.element, { text: edit.nextText }),
          );
          prompted += 1;
        }
      }
      setPendingVisualEdits([]);
      if (applied > 0 || prompted > 0) {
        toast({
          title: prompted > 0 && applied === 0 ? "Sent to chat" : "Changes applied",
          description:
            prompted > 0 && applied === 0
              ? "Couldn't match source uniquely — AI will apply the edits."
              : `${applied} edit${applied === 1 ? "" : "s"} saved${prompted > 0 ? `, ${prompted} sent to chat` : ""}.`,
        });
      }
    })();
  }, [toast, projectId]);

  // MODAL-ONLY PREVIEW. The Modal cloud sandbox is the single, sole preview
  // engine — the WebContainer / esbuild / srcdoc in-browser engines are fully
  // retired (their code below is unreachable and kept only until physically
  // deleted). When Modal is unavailable we show a neutral "preview unavailable"
  // pane rather than switching engines. Rationale: one real engine = exact
  // parity with the deployed app + no engine-switch state races.
  // Was hardcoded `false` while the product was Modal-only. Now driven by the
  // real flag so NEXT_PUBLIC_PREVIEW_WEBCONTAINER=1 actually takes effect —
  // leaving this pinned would have made the env var look broken.
  const staticRuntime = resolveProjectRuntime(runtime, framework, files) === "static";
  const webContainerAllowed = !staticRuntime && isWebContainerPreviewEnabled();
  const sandboxAvailable = sandboxEnabled;
  useEffect(() => {
    // "sandbox" whenever there are files (Modal renders them); "fallback" only
    // as the no-files empty state, which renders a neutral message — never an
    // in-browser engine.
    setPreviewEngine((prev) => {
      const next = files.length === 0
        ? "unavailable"
        : staticRuntime
          ? "static"
        : useWebContainers || (!sandboxEnabled && webContainerAllowed)
          ? "webcontainer"
          : "sandbox";
      return prev === next ? prev : next;
    });
  }, [files.length, staticRuntime, useWebContainers, sandboxEnabled, webContainerAllowed]);

  // Boot the in-browser runtime when this engine is selected.
  //
  // Deliberately depends on [previewEngine, projectId, wcNonce] and NOT on
  // `files`: mounting + `npm install` takes ~30-60s, and re-running it on every
  // file change would make the preview permanently reinstall. Live file updates
  // are a follow-up (remountProject) — first make it boot at all.
  useEffect(() => {
    if (previewEngine !== "webcontainer") return;
    if (!files.length) return;
    let cancelled = false;

    setWcError(null);
    setWcUrl(null);
    setWcPhase("Booting runtime…");

    void (async () => {
      const { runProjectInWebContainer, webContainerBlocker } = await import(
        "@/lib/preview/webcontainer-engine"
      );
      const blocked = webContainerBlocker();
      if (blocked) {
        if (!cancelled) setWcError(blocked);
        return;
      }
      const res = await runProjectInWebContainer({
        files: files.map((f) => ({ path: f.path, content: f.content })),
        onProgress: (phase, detail) => {
          if (!cancelled) setWcPhase(detail ? `${phase}: ${detail}` : phase);
        },
        onOutput: (chunk) => {
          // Cheap console passthrough — the panel's log UI can consume this
          // later; without it an npm-install failure is invisible.
          if (chunk.trim()) console.debug("[webcontainer]", chunk.trimEnd());
        },
      });
      if (cancelled) return;
      if (res.ok && res.url) {
        setWcUrl(res.url);
        setWcPhase(null);
      } else {
        setWcError(res.error ?? "Failed to start the in-browser preview.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [previewEngine, projectId, wcNonce, files.length]);

  const getActivePreviewIframe = useCallback((): HTMLIFrameElement | null => {
    if (previewEngine === "webcontainer") {
      return runtimeContainerRef.current?.querySelector("iframe") ?? null;
    }
    if (previewEngine === "sandbox") {
      return sandboxIframeRef.current;
    }
    return iframeRef.current;
  }, [previewEngine]);

  // The engines report different location shapes (srcdoc: virtual hash path;
  // WebContainer: real URL path). Reset the shared address-bar state on engine
  // switch so a stale path from the previous engine doesn't linger.
  // IMPORTANT: only depend on previewEngine (not transitionPreviewMachine). An
  // always-new routeNav object + unstable callback deps = Maximum update depth.
  useEffect(() => {
    setPreviewPath((prev) => (prev === "/" ? prev : "/"));
    setUrlInput((prev) => (prev === "/" ? prev : "/"));
    setUrlEditing((prev) => (prev ? false : prev));
    setRouteNav((prev) =>
      prev.stack.length === 1 && prev.stack[0] === "/" && prev.idx === 0
        ? prev
        : { stack: ["/"], idx: 0 },
    );
    transitionPreviewMachine("loading", `engine switched to ${previewEngine}`);
    // transitionPreviewMachine is stable (empty deps) — omit from deps on purpose.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewEngine]);

  // Lovable parity: sandbox boot handled by useSandboxPreview (reconnect → POST).
  // Do not duplicate cold-start here.

  // Top-bar URL bar → in-preview soft-nav (Modal VEB + SPA routers).
  useEffect(() => {
    function onExternalNavigate(e: Event) {
      const pathname = (e as CustomEvent<{ pathname?: string }>).detail?.pathname;
      if (!pathname || typeof pathname !== "string") return;
      const target = pathname.startsWith("/") ? pathname : `/${pathname}`;
      // Always soft-nav via postMessage — Modal SPAs must not full-reload the tunnel.
      getPreviewContentWindow()?.postMessage(
        { type: "lifemark-preview-navigate", pathname: target },
        "*",
      );
      setPreviewPath(target);
      setUrlInput(target);
      setUrlEditing(false);
      setRouteNav((prev) =>
        prev.stack[prev.idx] === target
          ? prev
          : { stack: [...prev.stack.slice(0, prev.idx + 1), target], idx: prev.idx + 1 },
      );
    }
    window.addEventListener("lifemark-preview-navigate", onExternalNavigate);
    return () => window.removeEventListener("lifemark-preview-navigate", onExternalNavigate);
  }, [getPreviewContentWindow]);
  useEffect(() => {
    // Lovable parity: keep Modal sandboxes warm across editor navigation — do not
    // kill on panel unmount (they reconnect by name on next open).
    return undefined;
  }, []);

  useEffect(() => {
    // The srcdoc iframe's origin is opaque ("null"), so e.origin can't be
    // trusted for filtering — strictly validate the SHAPE of every message
    // instead. A malformed/hostile payload (e.g. text as an object) used to
    // flow straight into React state and crash the editor when rendered.
    function isRect(r: unknown): r is VebElement["rect"] {
      if (!r || typeof r !== "object") return false;
      const o = r as Record<string, unknown>;
      return (
        typeof o.top === "number" && typeof o.left === "number" &&
        typeof o.width === "number" && typeof o.height === "number"
      );
    }
    function asVebElement(d: Record<string, unknown>): VebElement | null {
      if (typeof d.tagName !== "string" || typeof d.xpath !== "string" || !isRect(d.rect)) return null;
      return {
        tagName: d.tagName,
        textContent: typeof d.textContent === "string" ? d.textContent : "",
        classList: Array.isArray(d.classList)
          ? d.classList.filter((c): c is string => typeof c === "string")
          : [],
        xpath: d.xpath,
        rect: d.rect,
      };
    }
    function asVebInlineElement(d: Record<string, unknown>): VebElement | null {
      if (typeof d.tagName !== "string" || typeof d.xpath !== "string") return null;
      return {
        tagName: d.tagName,
        textContent: typeof d.textContent === "string" ? d.textContent : "",
        classList: Array.isArray(d.classList)
          ? d.classList.filter((c): c is string => typeof c === "string")
          : [],
        xpath: d.xpath,
        rect: { top: 0, left: 0, width: 0, height: 0 },
      };
    }
    function handler(e: MessageEvent) {
      // Only the preview iframe may drive this panel.
      //
      // The comment above used to justify skipping sender checks because the
      // srcdoc iframe had an opaque ("null") origin. That engine is retired -
      // every preview is now a remote `src=` iframe (Modal sandbox, WebContainer,
      // or the deployed URL), so the sender CAN be identified. Until this check
      // existed, any window holding a handle to the editor could post here, and
      // the previewed app is USER-GENERATED CODE: it could fabricate console
      // lines (which get POSTed to /preview-telemetry) or forge element
      // selections that drive a visual edit at a selector of its choosing.
      //
      // Comparing `e.source` to the live contentWindow rather than parsing
      // origin strings: it needs no URL bookkeeping, survives redirects and
      // origin changes, and cannot be spoofed - a window reference is identity,
      // not a claim. Shape validation below stays, because a compromised preview
      // is still an untrusted sender.
      const expected = getPreviewContentWindow();
      if (expected && e.source !== expected) return;
      const d = e.data as Record<string, unknown> | null;
      if (!d || typeof d !== "object") return;
      if (d.source === "lifemark-veb" && visualEditEnabled) {
        const data = asVebElement(d);
        if (!data) return;
        const iframe = getActivePreviewIframe();
        const iframeRect = iframe?.getBoundingClientRect();
        const next = {
          ...data,
          rect: {
            top: data.rect.top + (iframeRect?.top ?? 0),
            left: data.rect.left + (iframeRect?.left ?? 0),
            width: data.rect.width,
            height: data.rect.height,
          },
        };
        const additive = d.additive === true;
        setVebSelected(next);
        setVebSelectedList((prev) => {
          if (!additive) return [next];
          if (prev.some((p) => p.xpath === next.xpath)) {
            return prev.filter((p) => p.xpath !== next.xpath);
          }
          return [...prev, next];
        });
      }
      if (d.source === "lifemark-veb-inline" && visualEditEnabled) {
        const data = asVebInlineElement(d);
        const text = typeof d.text === "string" ? d.text : null;
        if (!data || !text) return;
        stagePendingTextEditRef.current(data, text);
      }
      if (d.type === "lifemark-veb-ready") {
        getPreviewContentWindow()?.postMessage(
          { type: "lifemark-veb-mode", enabled: visualEditEnabled },
          "*",
        );
        getPreviewContentWindow()?.postMessage(
          { type: "lifemark-comment-pin-mode", enabled: commentPinMode },
          "*",
        );
        getPreviewContentWindow()?.postMessage(
          {
            type: "lifemark-veb-edit-text-mode",
            enabled: editTextModeRef.current && visualEditEnabled,
          },
          "*",
        );
        // Re-push canvas pins after iframe reload / HMR.
        pushCommentPinsToPreviewRef.current();
      }
      if (d.source === "lifemark-comment-pin-click" && typeof d.commentId === "string") {
        const match = elementCommentPinsRef.current.find((c) => c.id === d.commentId);
        if (match) setActivePinComment(match);
      }
      if (d.source === "lifemark-comment-pin" && commentPinMode) {
        const data = asVebElement(d);
        if (data) {
          setPendingComment(data);
          setCommentDraft("");
        }
      }
      if (d.source === "lifemark-preview" && typeof d.type === "string") {
        const type = d.type;
        const text = typeof d.text === "string" ? d.text : String(d.text ?? "");
        setConsoleLines((prev) => [...prev.slice(-99), { type, text }]);
        if (projectId && (type === "log" || type === "warn" || type === "error" || type === "console-error" || type === "info")) {
          void fetch(`/api/projects/${projectId}/preview-telemetry`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ console: [{ type: type === "console-error" ? "error" : type, text }] }),
          }).catch(() => {});
        }
        if (type === "success") {
          // completeHealing already clears errors — don't call both.
          errorGuard.completeHealing();
          window.dispatchEvent(new CustomEvent("lifemark-preview-heal-done"));
          setActiveError(null);
          setPreviewCompileFailed(false);
          setPreviewCompileOk(true);
          setErrorDismissed(false);
          transitionPreviewMachine("ready", "preview runtime reported success");
        } else if (type === "error") {
          if (isNoisePreviewError(text)) return;
          if (outOfCredits) {
            setPreviewCompileFailed(true);
            setPreviewCompileOk(false);
            transitionPreviewMachine("error", "preview compile failed with no credits");
            return;
          }
          if (onError) onError(text);
          setActiveError(text);
          setErrorDismissed(false);
          transitionPreviewMachine("error", "preview runtime error");
        }
      }
      if (d.source === "lifemark-preview-network") {
        const method = typeof d.method === "string" ? d.method : "GET";
        const url = typeof d.url === "string" ? d.url : String(d.url ?? "");
        const status = typeof d.status === "number" ? d.status : undefined;
        const ok = typeof d.ok === "boolean" ? d.ok : undefined;
        const durationMs = typeof d.durationMs === "number" ? d.durationMs : undefined;
        const contentType = typeof d.contentType === "string" ? d.contentType : undefined;
        const error = typeof d.error === "string" ? d.error : undefined;
        setNetworkLines((prev) => [
          ...prev.slice(-99),
          { method, url, status, ok, durationMs, contentType, error },
        ]);
        // Buffer for agent tools (fire-and-forget).
        if (projectId) {
          void fetch(`/api/projects/${projectId}/preview-telemetry`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              network: [{ method, url, status, ok, durationMs, contentType, error }],
            }),
          }).catch(() => {});
        }
      }
      if (d.source === "lifemark-preview-perf") {
        setPerfSnapshot({
          ttfb: typeof d.ttfb === "number" ? d.ttfb : null,
          domContentLoaded: typeof d.domContentLoaded === "number" ? d.domContentLoaded : null,
          load: typeof d.load === "number" ? d.load : null,
          fcp: typeof d.fcp === "number" ? d.fcp : null,
          lcp: typeof d.lcp === "number" ? d.lcp : null,
          cls: typeof d.cls === "number" ? d.cls : null,
          capturedAt: Date.now(),
        });
      }
      if (d.type === "lifemark-screenshot") {
        const messageId = typeof d.messageId === "string" ? d.messageId : "";
        const dataUrl = typeof d.dataUrl === "string" ? d.dataUrl : null;
        if (messageId && dataUrl) {
          window.dispatchEvent(new CustomEvent("lifemark-screenshot-ready", { detail: { messageId, dataUrl } }));
        }
      }
      // URL sync — the iframe boot script reports its current path on initial
      // mount and on every history change so the address bar stays in sync
      // with react-router navigations inside the running app.
      if (d.type === "lifemark-preview-pong") {
        const token = d.token;
        if (typeof token === "number") {
          sandboxPongTokenRef.current = token;
          sandboxBridgeAliveRef.current = true;
        }
      }
      if (d.type === "lifemark-preview-location") {
        const pathname = d.pathname;
        const origin = typeof d.origin === "string" ? d.origin : null;
        const href = typeof d.href === "string" ? d.href : null;
        const expectedBase = sandboxUrlLiveRef.current;
        // Bridge still running but document origin left the sandbox tunnel
        // (rare — usually the bridge is gone and ping/pong catches it).
        if (
          expectedBase &&
          ((origin && !isSamePreviewOrigin(expectedBase, origin)) ||
            (href && !isSamePreviewOrigin(expectedBase, href)))
        ) {
          const now = Date.now();
          if (now - sandboxEscapeRemountAtRef.current > 2500) {
            sandboxEscapeRemountAtRef.current = now;
            sandboxBridgeAliveRef.current = false;
            setSandboxIframePath("/");
            setRefreshKey((k) => k + 1);
          }
          return;
        }
        if (typeof pathname === "string" && pathname.length > 0) {
          const normalized = normalizeSandboxPathname(pathname);
          sandboxBridgeAliveRef.current = true;
          setPreviewPath(normalized);
          // Don't clobber whatever the user is typing into the address bar.
          if (!urlEditing) setUrlInput(normalized);
          // Record in the back/forward history — unless this location change
          // was caused by a back/forward click itself.
          if (navSuppressRef.current) {
            navSuppressRef.current = false;
          } else {
            setRouteNav((prev) =>
              prev.stack[prev.idx] === normalized
                ? prev
                : { stack: [...prev.stack.slice(0, prev.idx + 1), normalized], idx: prev.idx + 1 },
            );
          }
        }
      }
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
    // urlEditing MUST be a dep: without it the listener kept a stale
    // urlEditing=false and location reports overwrote the user's typing.
    // Depend on stable errorGuard methods — never the whole API object.
  }, [onError, visualEditEnabled, commentPinMode, outOfCredits, errorGuard.completeHealing, urlEditing, transitionPreviewMachine, getActivePreviewIframe, getPreviewContentWindow, projectId]);

  useEffect(() => {
    if (outOfCredits) {
      setActiveError(null);
      setErrorDismissed(true);
      setPreviewCompileOk(false);
    } else {
      setPreviewCompileFailed(false);
      setPreviewCompileOk(false);
    }
  }, [outOfCredits]);

  // Relay screenshot capture requests from ChatPanel → preview iframe
  useEffect(() => {
    function handleCaptureRequest(e: Event) {
      const { messageId } = (e as CustomEvent<{ messageId: string }>).detail;
      getPreviewContentWindow()?.postMessage({ type: "lifemark-capture", messageId }, "*");
    }
    window.addEventListener("lifemark-request-screenshot", handleCaptureRequest);
    return () => window.removeEventListener("lifemark-request-screenshot", handleCaptureRequest);
  }, [getPreviewContentWindow]);

  // Declared before refreshPreview so the callback can write the signature safely.
  // IMPORTANT: only ONE previewFiles useState in this file — a duplicate declaration
  // breaks the PreviewPanel dynamic import and blanks the whole editor.
  const [previewFiles, setPreviewFiles] = useState<ProjectFile[]>(() => previewRelevantFiles(files));
  const previewFilesSigRef = useRef<string>(filesContentSignature(previewRelevantFiles(files)));
  const filesDebounceTimerRef = useRef<number | null>(null);
  /** Always the latest `files` prop — bare toolbar refreshes must not use a stale closure. */
  const filesPropRef = useRef(files);
  filesPropRef.current = files;

  /** Coalesce duplicate remounts (chat + layout both dispatch refresh). */
  const lastRefreshAtRef = useRef(0);
  const lastRefreshSigRef = useRef("");

  const refreshPreview = useCallback((nextFiles?: ProjectFile[]) => {
    if (filesDebounceTimerRef.current != null) {
      window.clearTimeout(filesDebounceTimerRef.current);
      filesDebounceTimerRef.current = null;
    }

    const effectiveFiles = getRefreshEffectiveFiles(versionPreviewLabel, filesPropRef.current, nextFiles);
    const hasExplicit = Array.isArray(effectiveFiles) && effectiveFiles.length > 0;
    const now = Date.now();

    if (!hasExplicit) {
      // Bare refresh (toolbar): remount current preview, or adopt latest prop if ahead.
      // Never use a stale React closure — that wiped live AI edits from the iframe.
      const propRelevant = previewRelevantFiles(filesPropRef.current);
      const propSig = filesContentSignature(propRelevant);
      // Drop duplicate bare remounts within 120ms (double-dispatch from chat + layout).
      if (now - lastRefreshAtRef.current < 120 && lastRefreshSigRef.current === `bare:${propSig}`) {
        return;
      }
      lastRefreshAtRef.current = now;
      lastRefreshSigRef.current = `bare:${propSig}`;
      if (propRelevant.length > 0 && propSig !== previewFilesSigRef.current) {
        previewFilesSigRef.current = propSig;
        setPreviewFiles(propRelevant);
      } else if (propRelevant.length > 0 && previewFilesSigRef.current === "") {
        // First content after empty — always adopt
        previewFilesSigRef.current = propSig;
        setPreviewFiles(propRelevant);
      }
      // Bare remount: keep Modal iframe on the route the user was viewing.
      if (previewEngineRef.current === "sandbox") {
        setSandboxIframePath(previewPathRef.current || "/");
      }
      setRefreshKey((k) => k + 1);
      clearPreviewLogs();
      clearVebSelection();
      errorGuard.clearErrors();
      previewBuildShaRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      transitionPreviewMachine("loading", "refresh remount");
      return;
    }

    const relevantFiles = previewRelevantFiles(effectiveFiles!);
    // Never blank a good preview with an empty payload (failed refresh / race).
    if (relevantFiles.length === 0) {
      const propRelevant = previewRelevantFiles(filesPropRef.current);
      if (propRelevant.length > 0) {
        const propSig = filesContentSignature(propRelevant);
        previewFilesSigRef.current = propSig;
        setPreviewFiles(propRelevant);
      }
      setRefreshKey((k) => k + 1);
      transitionPreviewMachine("loading", "refresh keep previous");
      return;
    }
    const sig = filesContentSignature(relevantFiles);
    // Prefer files-bearing refresh over a bare remount that just fired.
    if (now - lastRefreshAtRef.current < 120 && lastRefreshSigRef.current === sig) {
      return;
    }
    lastRefreshAtRef.current = now;
    lastRefreshSigRef.current = sig;
    previewFilesSigRef.current = sig;
    setPreviewFiles(relevantFiles);

    // Lovable parity: warm Modal sync in place — never cold-boot npm on every AI edit.
    // The debounced sync effect clears loading → ready after PATCH returns.
    const engine = previewEngineRef.current;
    if (engine === "sandbox" && sandboxIdLiveRef.current) {
      clearPreviewLogs();
      clearVebSelection();
      errorGuard.clearErrors();
      transitionPreviewMachine("loading", "sandbox file sync");
      return;
    }
    if (engine === "webcontainer") {
      clearPreviewLogs();
      clearVebSelection();
      errorGuard.clearErrors();
      transitionPreviewMachine("loading", "webcontainer file sync");
      return;
    }

    setRefreshKey((k) => k + 1);
    clearPreviewLogs();
    clearVebSelection();
    errorGuard.clearErrors();
    previewBuildShaRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    transitionPreviewMachine("loading", "refresh requested");
  }, [clearVebSelection, errorGuard.clearErrors, transitionPreviewMachine]);

  useEffect(() => {
    function handleRefresh(event: Event) {
      const detail = (event as CustomEvent<{ files?: ProjectFile[] }>).detail;
      refreshPreview(detail?.files);
    }
    window.addEventListener("lifemark-refresh-preview", handleRefresh);
    return () => window.removeEventListener("lifemark-refresh-preview", handleRefresh);
  }, [refreshPreview]);

  // Top-bar UrlBarPill device toggle → this panel (single source of truth for iframe).
  useEffect(() => {
    function handleDevice(event: Event) {
      const next = (event as CustomEvent<string>).detail;
      if (next === "desktop" || next === "mobile" || next === "tablet") {
        setDevice(next);
      }
    }
    window.addEventListener("lifemark-preview-device", handleDevice);
    return () => window.removeEventListener("lifemark-preview-device", handleDevice);
  }, []);

  // Broadcast the app's navigable pages (Lovable "switch pages" dropdown).
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("lifemark-preview-pages", { detail: derivePreviewPages(files) }),
    );
  }, [files]);

  // Broadcast route so top-bar UrlBarPill stays in sync with in-iframe navigation.
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("lifemark-preview-path", {
        detail: {
          path: previewPath,
          device,
          canGoBack: routeNav.idx > 0,
          canGoForward: routeNav.idx < routeNav.stack.length - 1,
        },
      }),
    );
  }, [previewPath, device, routeNav.idx, routeNav.stack.length]);

  // Top-bar back/forward → in-preview history navigation.
  useEffect(() => {
    function onHistoryNav(e: Event) {
      const dir = (e as CustomEvent<{ dir?: string }>).detail?.dir;
      if (dir !== "back" && dir !== "forward") return;
      setRouteNav((prev) => {
        const idx = dir === "back" ? prev.idx - 1 : prev.idx + 1;
        const target = prev.stack[idx];
        if (target === undefined) return prev;
        navSuppressRef.current = true;
        setTimeout(() => { navSuppressRef.current = false; }, 1000);
        getPreviewContentWindow()?.postMessage(
          { type: "lifemark-preview-navigate", pathname: target },
          "*",
        );
        setPreviewPath(target);
        setUrlInput(target);
        setUrlEditing(false);
        return { ...prev, idx };
      });
    }
    window.addEventListener("lifemark-preview-history", onHistoryNav);
    return () => window.removeEventListener("lifemark-preview-history", onHistoryNav);
  }, [getPreviewContentWindow]);

  // Modal live sync — push debounced file changes, then clear Loading (HMR in-place).
  useEffect(() => {
    if (previewEngine !== "sandbox" || !sandboxId || previewFiles.length === 0) return;
    const payload = previewFiles.map((f) => ({ path: f.path, content: f.content ?? "" }));
    // Clearing the 800ms debounce is not enough. Once a sync is in flight this
    // effect can be torn down and re-run (every edit changes previewFiles), and
    // the old run keeps going: it can fire the destructive "Preview out of
    // date" toast for a sync the newer run has already succeeded at, and its
    // trailing timers can flip the machine to "ready" while that newer sync is
    // still loading. Supersede the whole run, timers included.
    let superseded = false;
    const trailing: number[] = [];
    const timer = window.setTimeout(() => {
      void (async () => {
        transitionPreviewMachine("loading", "sandbox file sync");
        const result = await syncSandboxFiles(payload);
        if (superseded) return;
        if (!result.ok) {
          setConsoleLines((prev) => [
            ...prev.slice(-99),
            { type: "warn", text: `[preview] sync failed: ${result.error ?? "unknown"}` },
          ]);
          // Even after the hook's dead-sandbox recovery the sync failed — tell
          // the user instead of silently rendering stale code (trust killer).
          toast({
            title: "Preview out of date",
            description:
              "Your latest changes were saved but the live preview could not be updated. Use the refresh button to restart it.",
            variant: "destructive",
          });
          transitionPreviewMachine("ready", "sandbox sync failed — keep previous preview");
          window.dispatchEvent(new CustomEvent("lifemark-preview-settled", { detail: { ok: false } }));
          return;
        }
        if (result.recovered) {
          setConsoleLines((prev) => [
            ...prev.slice(-99),
            { type: "log", text: "[preview] stale sandbox detected — reconnected and re-synced" },
          ]);
        }
        setSandboxSyncInstalling(!!result.installing);
        if (result.installing) {
          // Dep install runs in background; show status briefly then ready for HMR.
          trailing.push(
            window.setTimeout(() => {
              if (!superseded) setSandboxSyncInstalling(false);
            }, 12_000),
          );
        }
        // Brief grace for Vite HMR, then mark ready so UrlBarPill stops spinning.
        trailing.push(
          window.setTimeout(() => {
            if (superseded) return;
            transitionPreviewMachine("ready", "sandbox sync applied");
            window.dispatchEvent(
              new CustomEvent("lifemark-preview-settled", {
                detail: { ok: true, installing: !!result.installing },
              }),
            );
          }, result.installing ? 2500 : 600),
        );
      })();
    }, 800);
    return () => {
      superseded = true;
      window.clearTimeout(timer);
      for (const t of trailing) window.clearTimeout(t);
    };
  }, [previewEngine, sandboxId, previewFiles, syncSandboxFiles, transitionPreviewMachine]);

  // Pull Modal Vite/Next logs into the Console tab + agent telemetry (Lovable parity).
  const lastModalTelemetryKeyRef = useRef("");
  useEffect(() => {
    if (previewEngine !== "sandbox" || !sandboxId || !projectId || !sandboxUrl) return;
    let cancelled = false;
    const pull = () => {
      void fetch(
        `/api/projects/${projectId}/sandbox-preview/logs?sandboxId=${encodeURIComponent(sandboxId)}&lines=40`,
      )
        .then((r) => (r.ok ? r.json() : null))
        .then((data: { ok?: boolean; logs?: string } | null) => {
          if (cancelled || !data?.ok || !data.logs) return;
          const lines = data.logs
            .split("\n")
            .map((t) => t.trim())
            .filter(Boolean)
            .slice(-30)
            .map((text) => ({
              type: /error|ERR!|failed/i.test(text) ? "error" : /warn/i.test(text) ? "warn" : "log",
              text: `[preview] ${text}`,
            }));
          if (lines.length === 0) return;
          setConsoleLines((prev) => {
            const withoutModal = prev.filter((l) => !l.text.startsWith("[preview] "));
            return [...withoutModal, ...lines].slice(-100);
          });
          // Buffer for agent read_preview_console (dedupe identical batches).
          const key = lines.map((l) => l.text).join("\n");
          if (key !== lastModalTelemetryKeyRef.current) {
            lastModalTelemetryKeyRef.current = key;
            void fetch(`/api/projects/${projectId}/preview-telemetry`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                console: lines.map((l) => ({ type: l.type, text: l.text })),
              }),
            }).catch(() => {});
          }
        })
        .catch(() => {});
    };
    pull();
    const timer = window.setInterval(pull, 8000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [previewEngine, sandboxId, projectId, sandboxUrl]);

  // Live preview URL for Agent browse_preview / browser-test / preview-verify.
  useEffect(() => {
    if (previewEngine !== "webcontainer") setWcPreviewUrl(null);
  }, [previewEngine]);
  useEffect(() => {
    const url =
      previewEngine === "sandbox" && sandboxUrl
        ? sandboxUrl
        : previewEngine === "webcontainer" && wcPreviewUrl
          ? wcPreviewUrl
          : null;
    try {
      if (url) sessionStorage.setItem("lifemark-live-preview-url", url);
      else sessionStorage.removeItem("lifemark-live-preview-url");
    } catch { /* private mode */ }
    window.dispatchEvent(
      new CustomEvent("lifemark-live-preview-url", { detail: { url } }),
    );
  }, [previewEngine, sandboxUrl, wcPreviewUrl]);

  const captureForAnnotation = useCallback(() => {
    const msgId = `ann-${Date.now()}`;
    let settled = false;
    const finish = (dataUrl: string | null) => {
      if (settled) return;
      settled = true;
      window.removeEventListener("lifemark-screenshot-ready", handleReady);
      if (dataUrl) {
        setAnnotateScreenshot(dataUrl);
        return;
      }
      toast({
        title: "Couldn't capture preview",
        description: "Wait for the preview to finish loading, then try Capture & annotate again.",
        variant: "destructive",
      });
    };
    function handleReady(e: Event) {
      const detail = (e as CustomEvent).detail as { messageId: string; dataUrl: string | null };
      if (detail.messageId !== msgId) return;
      finish(detail.dataUrl);
    }
    window.addEventListener("lifemark-screenshot-ready", handleReady);
    window.dispatchEvent(new CustomEvent("lifemark-request-screenshot", { detail: { messageId: msgId } }));
    window.setTimeout(() => finish(null), 5000);
  }, [toast]);

  // ── Debounced files for preview builds ──────────────────────────────────────
  // Every keystroke / AI stream chunk produces a new `files` array, and each one
  // used to rebuild the srcdoc HTML AND remount the iframe (key includes the
  // files signature), forcing a full in-iframe Babel recompile of every file —
  // the single biggest preview perf cost. Debounce content changes lightly;
  // explicit lifemark-refresh-preview cancels the timer and applies immediately.
  useEffect(() => {
    const relevantFiles = previewRelevantFiles(files);
    const sig = filesContentSignature(relevantFiles);
    if (sig === previewFilesSigRef.current) return; // identity churn, same content
    // Never clear a populated preview with an empty file list.
    if (relevantFiles.length === 0) return;
    previewBuildShaRef.current = sig.slice(0, 12) || `${Date.now()}`;
    transitionPreviewMachine("building", "project files changed");
    if (previewFilesSigRef.current === "") {
      // Leading edge: empty → first real content renders without delay.
      previewFilesSigRef.current = sig;
      setPreviewFiles(relevantFiles);
      const engine = previewEngineRef.current;
      if (engine === "static" || engine === "detecting") {
        setRefreshKey((k) => k + 1);
      }
      return;
    }
    if (filesDebounceTimerRef.current != null) {
      window.clearTimeout(filesDebounceTimerRef.current);
    }
    // Lovable-feel: short debounce so AI edits show nearly live (was 900ms while generating).
    filesDebounceTimerRef.current = window.setTimeout(() => {
      filesDebounceTimerRef.current = null;
      previewFilesSigRef.current = sig;
      setPreviewFiles(relevantFiles);
      const engine = previewEngineRef.current;
      // Warm sandbox/WC: sync in place — never remount iframe on every AI edit.
      if (engine === "static" || engine === "detecting") {
        setRefreshKey((k) => k + 1);
      }
    }, isGenerating ? 180 : 120);
    return () => {
      if (filesDebounceTimerRef.current != null) {
        window.clearTimeout(filesDebounceTimerRef.current);
        filesDebounceTimerRef.current = null;
      }
    };
  }, [files, isGenerating, transitionPreviewMachine]);

  // Recovery: if previewFiles went empty while the editor still has files, adopt them.
  useEffect(() => {
    if (previewFiles.length > 0) return;
    const relevant = previewRelevantFiles(files);
    if (relevant.length === 0) return;
    const sig = filesContentSignature(relevant);
    previewFilesSigRef.current = sig;
    setPreviewFiles(relevant);
    setRefreshKey((k) => k + 1);
    transitionPreviewMachine("loading", "recover empty previewFiles");
  }, [files, previewFiles.length, transitionPreviewMachine]);

  // Static projects deliberately bypass package installation and render their
  // browser-native files directly. Framework projects continue to use the one
  // high-fidelity sandbox/WebContainer path.
  const staticHtml = useMemo(
    () => staticRuntime ? buildStaticPreview(previewFiles, previewPath) : "",
    [previewFiles, previewPath, staticRuntime],
  );
  const renderedStaticHtml = staticHtml || EMPTY_PREVIEW_HTML;
  const filesSignature = useMemo(() => filesContentSignature(previewFiles), [previewFiles]);

  // Foreground reliability guard: WebContainer can occasionally stall while its
  // hidden StackBlitz runtime boots. Keep it available as a high-fidelity retry,
  // but switch the user back to the standard preview quickly so the panel never
  // looks blank after code generation.
  useEffect(() => {
    if (previewEngine !== "webcontainer") return;
    // Lovable parity: wait on "Loading preview…" — never flash srcdoc mid-install.
    if (hideTopChrome) return;
    const timer = window.setTimeout(() => {
      const frames = Array.from(runtimeContainerRef.current?.querySelectorAll("iframe") ?? []);
      const hasLivePreviewFrame = frames.some((frame) => {
        const src = frame.getAttribute("src") ?? "";
        const rect = frame.getBoundingClientRect();
        return (
          frame.getAttribute("title") === "Preview" &&
          src.length > 0 &&
          !src.includes("stackblitz.com/headless") &&
          rect.width > 0 &&
          rect.height > 0
        );
      });

      if (hasLivePreviewFrame) return;

      // Slow startup is not an engine failure. Keep the selected framework
      // runtime active and let the user restart it explicitly if needed.
      setConsoleLines((prev) => [
        ...prev.slice(-99),
        {
          type: "warn",
          text: "Framework runtime is still warming up. It will remain on this engine; restart it manually if startup does not complete.",
        },
      ]);
      transitionPreviewMachine("loading", "framework runtime still warming");
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [previewEngine, refreshKey, filesSignature, toast, transitionPreviewMachine, hideTopChrome]);

  useEffect(() => {
    unifiedIframeRef.current =
      previewEngine === "webcontainer"
        ? runtimeContainerRef.current?.querySelector("iframe") ?? null
        : iframeRef.current;
  }, [previewEngine, refreshKey, filesSignature]);

  useEffect(() => {
    setPreviewCompileFailed(false);
    setPreviewCompileOk(false);
  }, [previewFiles, staticHtml]);

  // At 0 credits: probe local preview first; fall back to deployment only if compile fails
  const showDeployedPreview =
    outOfCredits && !!deployedUrl && previewCompileFailed && !previewCompileOk;
  const iframeVisible = !outOfCredits || previewCompileOk;
  const showPausedOverlay = outOfCredits && !previewCompileOk && !showDeployedPreview;
  // Never surface backend/vendor internals (provider names, gRPC paths, raw
  // errors, sandbox ids) in preview UI — users must not see what tech runs
  // the preview. Raw details stay in the Console tab only.
  const displayPhaseDetail = (() => {
    const d = sandboxPhaseDetail?.trim();
    if (!d) return null;
    if (/modal|FAILED_PRECONDITION|grpc|sb-[A-Za-z0-9]{8,}|traceback|error:|\.host|\.run\b/i.test(d)) {
      return /already finished|already completed|timeout|expired/i.test(d)
        ? "Preview session expired — restarting…"
        : null; // fall through to the friendly phase map below
    }
    return d;
  })();
  const modalPhaseLabel =
    sandboxSyncInstalling
      ? "Installing dependencies…"
      : displayPhaseDetail
        || (sandboxPhase === "writing"
          ? "Writing project files…"
          : sandboxPhase === "installing"
            ? "Installing dependencies…"
            : sandboxPhase === "starting"
              ? "Starting Vite…"
              : sandboxPhase === "creating"
                ? "Provisioning sandbox…"
                : sandboxLoading
                  ? "Connecting to warm sandbox…"
                  : null);

  const previewStatusText =
    hideTopChrome
      ? sandboxError
        ? "Preview failed"
        : previewEngine === "sandbox" && !sandboxUrl
          ? (modalPhaseLabel || "Starting live preview…")
          : sandboxSyncInstalling
            ? "Installing dependencies…"
            : previewMachineState === "building" || previewMachineState === "loading" || sandboxLoading
              ? (modalPhaseLabel || (previewMachineState === "loading" ? "Updating preview…" : "Loading preview…"))
              : null
      : previewMachineState === "building"
        ? "Preparing preview"
        : previewMachineState === "loading"
          ? (modalPhaseLabel || "Updating preview…")
          : previewMachineState === "unavailable"
            ? "Preview unavailable"
            : previewMachineState === "error"
              ? "Preview needs repair"
              : null;

  // Broadcast preview boot status to top-bar UrlBarPill (Lovable parity).
  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent("lifemark-preview-status", { detail: { text: previewStatusText } }),
    );
  }, [previewStatusText]);

  const showRecoveryOverlay =
    !showDeployedPreview &&
    !errorGuard.freezePreview &&
    (previewMachineState === "error" ||
      errorGuard.phase === "frozen" ||
      (!!activeError && !errorDismissed && !outOfCredits));

  async function submitElementComment() {
    if (!projectId || !pendingComment || !commentDraft.trim()) return;
    setCommentSaving(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: commentDraft.trim(),
          element_xpath: pendingComment.xpath,
          element_tag: pendingComment.tagName,
          page_path: previewPath,
          element_preview: pendingComment.textContent,
        }),
      });
      if (!res.ok) throw new Error("Failed to save");
      toast({ title: "Comment pinned to element" });
      setPendingComment(null);
      setCommentDraft("");
      setCommentPinMode(false);
      void refreshElementCommentPins();
    } catch {
      toast({ title: "Could not save comment", variant: "destructive" });
    } finally {
      setCommentSaving(false);
    }
  }

  function sendElementCommentToChat() {
    if (!pendingComment || !commentDraft.trim()) return;
    const prompt =
      `Fix this pinned preview comment on \`${previewPath}\`:\n\n` +
      `Element: <${pendingComment.tagName}>${pendingComment.textContent ? ` — "${pendingComment.textContent.slice(0, 120)}"` : ""}\n` +
      `XPath: ${pendingComment.xpath}\n\n` +
      `Comment: ${commentDraft.trim()}`;
    onSendPromptToChatRef.current?.(prompt);
    setPendingComment(null);
    setCommentDraft("");
    setCommentPinMode(false);
    toast({ title: "Comment sent to chat" });
  }

  function sendActivePinCommentToChat() {
    if (!activePinComment) return;
    const path = activePinComment.page_path || previewPath;
    const prompt =
      `Fix this pinned preview comment on \`${path}\`:\n\n` +
      `Element: <${activePinComment.element_tag ?? "element"}>` +
      `${activePinComment.element_preview ? ` — "${activePinComment.element_preview.slice(0, 120)}"` : ""}\n` +
      `XPath: ${activePinComment.element_xpath}\n\n` +
      `Comment: ${activePinComment.content.trim()}`;
    onSendPromptToChatRef.current?.(prompt);
    setActivePinComment(null);
    toast({ title: "Comment sent to chat" });
  }

  function refreshPreviewPerf() {
    getPreviewContentWindow()?.postMessage({ type: "lifemark-preview-perf-request" }, "*");
  }

  // Inject element-pick script when comment pin mode is active (srcDoc iframe)
  useEffect(() => {
    if (!commentPinMode || !staticHtml) return;
    const timer = window.setTimeout(() => {
      const iframe = iframeRef.current;
      const doc = iframe?.contentDocument;
      if (!doc?.body) return;
      const script = doc.createElement("script");
      script.textContent = `(function(){
        if(window.__lmCommentPin) return;
        window.__lmCommentPin = true;
        document.addEventListener('click', function(e) {
          e.preventDefault(); e.stopPropagation();
          var el = e.target;
          function xp(n){var p=[],c=n;while(c&&c!==document.body){var t=c.tagName.toLowerCase();var s=c.parentElement?Array.from(c.parentElement.children).filter(function(x){return x.tagName===c.tagName}):[c];p.unshift(s.length>1?t+'['+(s.indexOf(c)+1)+']':t);c=c.parentElement;}return '//'+p.join('/');}
          var r = el.getBoundingClientRect();
          window.parent.postMessage({source:'lifemark-comment-pin',tagName:el.tagName.toLowerCase(),textContent:(el.textContent||'').trim().slice(0,80),classList:Array.from(el.classList),xpath:xp(el),rect:{top:r.top,left:r.left,width:r.width,height:r.height}},'*');
        }, true);
      })();`;
      doc.body.appendChild(script);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [commentPinMode, staticHtml, refreshKey]);

  // New iframe srcDoc — drop stale errors until the fresh preview reports status.
  // Keyed on the RENDERED html string, not fallbackHtml.length: two different
  // builds of identical length (or an esbuild swap) kept a stale error banner up.
  useEffect(() => {
    setActiveError(null);
    setErrorDismissed(false);
  }, [renderedStaticHtml, refreshKey]);

  const hasFiles = files.length > 0;
  const useStaticPreview = previewEngine === "static";
  // Draft/legacy WebContainer path — hidden unless NEXT_PUBLIC_PREVIEW_WEBCONTAINER=1.
  function refresh() {
    if (previewEngine === "sandbox" && sandboxIframeRef.current?.contentWindow) {
      try {
        sandboxIframeRef.current.contentWindow.location.reload();
        clearPreviewLogs();
        return;
      } catch {
        /* fall through */
      }
    }
    if (previewEngine === "webcontainer") {
      const iframe = runtimeContainerRef.current?.querySelector("iframe");
      if (iframe?.contentWindow) {
        try {
          iframe.contentWindow.location.reload();
          clearPreviewLogs();
          clearVebSelection();
          return;
        } catch {
          /* cross-origin — fall through to remount */
        }
      }
    }
    refreshPreview(files);
  }

  function openInNewTab() {
    // Lovable parity: open the live Modal tunnel (never srcdoc blob / /preview Babel).
    const modalLive =
      previewEngine === "sandbox" && sandboxUrl
        ? sandboxUrlWithPath(sandboxUrl, sandboxIframePath || previewPath || "/")
        : null;
    const draftWc =
      previewEngine === "webcontainer" && wcPreviewUrl ? wcPreviewUrl : null;
    const target = modalLive || draftWc || deployedUrl || null;
    if (!target) {
      toast({
        title: "Preview not ready",
        description: sandboxEnabled
          ? "The live preview is still starting — try again in a moment."
          : process.env.NODE_ENV === "development"
            ? "Set MODAL_TOKEN_ID and MODAL_TOKEN_SECRET in .env.local"
            : "The live preview service is not available right now.",
        variant: "destructive",
      });
      return;
    }
    window.open(target, "_blank", "noopener,noreferrer");
  }

  // ⌘⇧O keyboard shortcut
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "o") {
        e.preventDefault();
        openInNewTab();
      }
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deployedUrl, projectId, previewEngine, sandboxUrl, sandboxIframePath, previewPath, wcPreviewUrl, sandboxEnabled]);

  function handleVebFileChange(path: string, content: string) {
    const file = files.find((f) => f.path === path);
    if (file && onFileUpdate) {
      onFileUpdate({ ...file, content });
    }
  }

  // When device frame is on, delegate sizing to PhoneFrame/TabletFrame
  const deviceStyle: React.CSSProperties =
    device === "desktop" || showFrame
      ? { width: "100%", height: "100%" }
      : {
          width: DEVICE_WIDTHS[device],
          height: device === "mobile" ? "812px" : "1024px",
          maxHeight: "calc(100% - 16px)",
        };

  const deviceWrapper =
    device === "desktop" ? "w-full h-full"
    : showFrame ? "w-full h-full"
    : "mx-auto rounded-xl overflow-hidden shadow-2xl bg-white";

  /**
   * Wrap `children` in the appropriate device frame (or nothing for desktop).
   */
  function withDeviceFrame(children: React.ReactNode): React.ReactNode {
    // PhoneFrame / TabletFrame already expose data-device-container + data-scaled-iframe.
    if (device === "mobile" && showFrame) return <PhoneFrame>{children}</PhoneFrame>;
    if (device === "tablet" && showFrame) return <TabletFrame>{children}</TabletFrame>;
    // Desktop: flex-1 min-h-0 so the iframe always fills the panel (h-full alone can collapse).
    if (device === "desktop") {
      return (
        <div data-device-container className="flex flex-1 min-h-0 w-full overflow-hidden bg-white">
          <div data-scaled-iframe className="flex-1 min-h-0 w-full h-full">
            {children}
          </div>
        </div>
      );
    }
    return (
      <div data-device-container className="flex flex-1 min-h-0 items-start justify-center w-full bg-muted/20 overflow-auto p-4">
        <div data-scaled-iframe className="mx-auto rounded-xl overflow-hidden shadow-2xl bg-white" style={deviceStyle}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className={`flex flex-col bg-background ${previewFullscreen ? "fixed inset-0 z-[100] h-screen" : "relative h-full rounded-[var(--radius-4)] shadow-surface-xl overflow-hidden m-1"}`}>
        {/* Version-preview banner (Lovable parity) — shown while an older
            snapshot's files are loaded via "Preview this version" */}
        {versionPreviewLabel && (
          <LovableVersionPreviewBanner
            label={versionPreviewLabel}
            onExit={() => window.dispatchEvent(new CustomEvent("lifemark-exit-version-preview"))}
          />
        )}
        {/* Collapsed-toolbar pill (Lovable parity: compact "Show toolbar") */}
        {toolbarCollapsed && !hideTopChrome && (
          <button
            onClick={() => {
              setToolbarCollapsed(false);
              try { localStorage.setItem("lifemark-preview-toolbar-collapsed", "0"); } catch { /* private mode */ }
            }}
            className="absolute top-2 right-2 z-30 flex items-center gap-1 px-2 py-1 rounded-full bg-background/90 border border-border shadow-md text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            title="Show toolbar"
          >
            <ChevronDown className="w-3 h-3" />
            Show toolbar
          </button>
        )}
        {/* Toolbar — Lovable style (hidden when top bar owns chrome) */}
        <div className={`items-center gap-1.5 px-2.5 h-9 border-b border-border bg-background shrink-0 ${toolbarCollapsed || hideTopChrome ? "hidden" : "flex"}`}>
          {/* Device switcher */}
          <div className="flex items-center gap-0.5 p-0.5 rounded-md bg-muted/50 shrink-0">
            {([
              { d: "mobile" as DeviceSize, icon: Smartphone, label: "Mobile (390px)" },
              { d: "tablet" as DeviceSize, icon: Tablet, label: "Tablet (768px)" },
              { d: "desktop" as DeviceSize, icon: Monitor, label: "Desktop" },
            ] as const).map(({ d, icon: Icon, label }) => (
              <Tooltip key={d}>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => {
                      setDevice(d);
                      window.dispatchEvent(new CustomEvent("lifemark-preview-device", { detail: d }));
                    }}
                    className={`p-1.5 rounded transition-all ${
                      device === d ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <Icon className="w-3 h-3" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>{label}</TooltipContent>
              </Tooltip>
            ))}
          </div>

          {/* Back / forward through visited routes */}
          {!deployedUrl && (
            <div className="flex items-center gap-0 shrink-0">
              <button
                disabled={routeNav.idx <= 0}
                onClick={() => {
                  const idx = routeNav.idx - 1;
                  const target = routeNav.stack[idx];
                  if (target === undefined) return;
                  setRouteNav((prev) => ({ ...prev, idx }));
                  navSuppressRef.current = true;
                  setTimeout(() => { navSuppressRef.current = false; }, 1000);
                  const targetWin = previewEngine === "webcontainer"
                    ? runtimeContainerRef.current?.querySelector("iframe")?.contentWindow
                    : iframeRef.current?.contentWindow;
                  targetWin?.postMessage({ type: "lifemark-preview-navigate", pathname: target }, "*");
                  setPreviewPath(target);
                  setUrlInput(target);
                }}
                className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Back"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
              </button>
              <button
                disabled={routeNav.idx >= routeNav.stack.length - 1}
                onClick={() => {
                  const idx = routeNav.idx + 1;
                  const target = routeNav.stack[idx];
                  if (target === undefined) return;
                  setRouteNav((prev) => ({ ...prev, idx }));
                  navSuppressRef.current = true;
                  setTimeout(() => { navSuppressRef.current = false; }, 1000);
                  const targetWin = previewEngine === "webcontainer"
                    ? runtimeContainerRef.current?.querySelector("iframe")?.contentWindow
                    : iframeRef.current?.contentWindow;
                  targetWin?.postMessage({ type: "lifemark-preview-navigate", pathname: target }, "*");
                  setPreviewPath(target);
                  setUrlInput(target);
                }}
                className="p-1 rounded text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:pointer-events-none transition-colors"
                title="Forward"
              >
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          )}

          {/* URL bar — Lovable style center address bar. Editable when the
              preview is the local Babel iframe so users can type a route and
              hit Enter to navigate. Read-only when showing a deployed URL. */}
          <div className="flex-1 flex items-center justify-center min-w-0 px-1">
            <div className="flex items-center gap-1.5 h-6 w-full max-w-xs bg-muted/40 hover:bg-muted/70 border border-border/50 rounded-md px-2.5 transition-colors cursor-text group">
              {/* Lock / protocol icon */}
              <svg className="w-2.5 h-2.5 text-muted-foreground/50 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              {deployedUrl ? (
                <span className="flex-1 text-[11px] text-muted-foreground/70 truncate font-mono select-none">
                  {deployedUrl.replace(/^https?:\/\//, "")}
                </span>
              ) : (
                <input
                  value={urlEditing ? urlInput : previewBarLabel}
                  onChange={(e) => { setUrlInput(e.target.value); setUrlEditing(true); }}
                  onFocus={() => { setUrlInput(previewPath); setUrlEditing(true); }}
                  onBlur={() => setUrlEditing(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const target = urlInput.startsWith("/") ? urlInput : `/${urlInput}`;
                      // Tell the ACTIVE engine's iframe to navigate. Both
                      // engines carry a navigate handler (fallbackHtml URL-sync
                      // script / veb-bridge PREVIEW_RUNTIME_SCRIPT). Posting
                      // only to iframeRef silently no-oped on WebContainer.
                      const targetWin =
                        previewEngine === "webcontainer"
                          ? runtimeContainerRef.current?.querySelector("iframe")?.contentWindow
                          : iframeRef.current?.contentWindow;
                      targetWin?.postMessage(
                        { type: "lifemark-preview-navigate", pathname: target },
                        "*",
                      );
                      setPreviewPath(target);
                      setUrlEditing(false);
                      (e.target as HTMLInputElement).blur();
                    } else if (e.key === "Escape") {
                      setUrlInput(previewPath);
                      setUrlEditing(false);
                      (e.target as HTMLInputElement).blur();
                    }
                  }}
                  className="flex-1 text-[11px] text-muted-foreground/80 truncate font-mono bg-transparent outline-none focus:text-foreground"
                  spellCheck={false}
                  aria-label="Preview URL"
                />
              )}
              {deployedUrl && (
                <button
                  onClick={openInNewTab}
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground/60 hover:text-foreground"
                >
                  <ExternalLink className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          </div>

          <div className="flex items-center gap-0.5">
            <span
              title={`Preview state: ${previewMachineState}`}
              className={`text-[10px] px-1.5 py-0.5 rounded border mr-1 ${
                previewMachineState === "ready"
                  ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/25"
                  : previewMachineState === "error"
                    ? "bg-red-500/15 text-red-400 border-red-500/25"
                    : previewMachineState === "unavailable"
                      ? "bg-amber-500/15 text-amber-400 border-amber-500/25"
                      : "bg-blue-500/15 text-blue-400 border-blue-500/25"
              }`}
            >
              {previewMachineState}
            </span>
            {previewEngine === "webcontainer" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 border border-violet-500/30 mr-1">
                Vite
              </span>
            )}
            {previewEngine === "unavailable" && !showDeployedPreview && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-400 border border-amber-500/25 mr-1">
                Preview offline
              </span>
            )}
            {previewEngine === "sandbox" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 mr-1">
                Sandbox
              </span>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  disabled={!!versionPreviewLabel}
                  onClick={() => { if (versionPreviewLabel) return; setVisualEdit(!visualEdit); onVisualEditToggle?.(); }}
                  className={`p-1.5 rounded-md transition-all ${
                    versionPreviewLabel
                      ? "opacity-40 cursor-not-allowed text-muted-foreground"
                      : visualEdit
                      ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  <MousePointer className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {versionPreviewLabel ? "Visual edits disabled while previewing an older version" : `Visual Edit ${visualEdit ? "(on)" : "(off)"}`}
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    setCommentPinMode((v) => !v);
                    if (commentPinMode) setPendingComment(null);
                  }}
                  className={`p-1.5 rounded-md transition-all ${
                    commentPinMode
                      ? "bg-blue-500/20 text-blue-400 border border-blue-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  <Pin className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Pin comment to element {commentPinMode ? "(click preview)" : ""}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setAnnotationsEnabled((v) => !v)}
                  className={`p-1.5 rounded-md transition-all ${
                    annotationsEnabled
                      ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  <MessageSquarePlus className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Preview Annotations {annotationsEnabled ? "(on)" : "(off)"}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowConsole((v) => !v)}
                  className={`p-1.5 rounded-md transition-all ${
                    showConsole
                      ? "bg-yellow-500/20 text-yellow-400 border border-yellow-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  <Terminal className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Console &amp; Network</TooltipContent>
            </Tooltip>

            {/* Device-frame toggle: only meaningful for mobile/tablet — hidden
                on desktop, which now renders flat (Lovable-minimal). */}
            {device !== "desktop" && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => setShowFrame((v) => !v)}
                    className={`p-1.5 rounded-md transition-all ${
                      showFrame
                        ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                        : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                    }`}
                  >
                    <Frame className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Toggle device frame</TooltipContent>
              </Tooltip>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={refresh} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Refresh preview</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setPreviewFullscreen((v) => !v)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
                >
                  {previewFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
                </button>
              </TooltipTrigger>
              <TooltipContent>{previewFullscreen ? "Exit fullscreen (Esc)" : "Fullscreen preview"}</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => {
                    setToolbarCollapsed(true);
                    try { localStorage.setItem("lifemark-preview-toolbar-collapsed", "1"); } catch { /* private mode */ }
                  }}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all"
                >
                  <ChevronUp className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Hide toolbar</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={openInNewTab} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all">
                  <ExternalLink className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Open in new tab (⌘⇧O)</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button onClick={captureForAnnotation} className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-all">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Capture &amp; annotate for AI</TooltipContent>
            </Tooltip>
          </div>
        </div>

        {/* Preview content */}
        {!hasFiles ? (
          <div className="flex-1 flex items-center justify-center bg-[var(--bg-base,#0a0a0a)] text-muted-foreground">
            <div className="text-center px-8 py-10 max-w-xs">
              {/* Animated placeholder frames */}
              <div className="relative w-48 h-32 mx-auto mb-6">
                <div className="absolute inset-0 rounded-xl bg-muted/10 border border-border/30" />
                <div className="absolute top-3 left-3 right-3 h-3 rounded bg-muted/20 animate-pulse" />
                <div className="absolute top-8 left-3 right-8 h-2 rounded bg-muted/15 animate-pulse [animation-delay:150ms]" />
                <div className="absolute top-12 left-3 right-5 h-2 rounded bg-muted/15 animate-pulse [animation-delay:300ms]" />
                <div className="absolute top-16 left-3 right-10 h-2 rounded bg-muted/10 animate-pulse [animation-delay:450ms]" />
                <div className="absolute bottom-3 left-3 w-16 h-5 rounded-md bg-muted/20 animate-pulse [animation-delay:200ms]" />
              </div>
              <p className="text-sm font-medium text-foreground/80 mb-1.5">Your app preview will appear here</p>
              <p className="text-xs text-muted-foreground/60 leading-relaxed">
                Describe what you want to build in the chat and LifemarkAI will generate a live preview.
              </p>
            </div>
          </div>
        ) : previewEngine === "detecting" ? (
          <div className="flex-1 flex items-center justify-center bg-[var(--bg-base,#0a0a0a)]">
            <div className="text-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground/40">Loading preview…</p>
            </div>
          </div>
        ) : useStaticPreview && staticRuntime ? (
          <div className="flex flex-col flex-1 min-h-0 overflow-hidden relative">
            {withDeviceFrame(
              <iframe
                id="static-preview-panel"
                key={`static-${filesSignature}-${refreshKey}`}
                ref={iframeRef}
                srcDoc={renderedStaticHtml}
                className="w-full h-full min-h-0 border-0 bg-white"
                title="Static app preview"
                sandbox="allow-scripts allow-forms allow-popups allow-modals allow-downloads"
                allow="clipboard-read; clipboard-write; fullscreen"
                onLoad={() => {
                  transitionPreviewMachine("ready", "static srcdoc loaded");
                  window.dispatchEvent(new CustomEvent("lifemark-preview-settled", { detail: { ok: true } }));
                }}
              />,
            )}
            <PreviewCommentPins
              iframeRef={iframeRef}
              pins={srcdocCommentPins}
              enabled={!commentPinMode}
              onPinClick={(commentId) => {
                const match = elementCommentPins.find((c) => c.id === commentId);
                if (match) setActivePinComment(match);
              }}
            />
          </div>
        ) : previewEngine === "sandbox" &&
          !sandboxUrl &&
          // `previewEngine` flips to "sandbox" the moment the project has ANY
          // files — it is a statement about which engine we would use, NOT
          // about whether that engine is reachable. So when the backend is
          // down or unconfigured (`enabled: false`, and no error because
          // nothing was ever attempted) this branch used to swallow the case
          // and paint "Starting live preview" with a spinner forever: the
          // `!sandboxStatusResolved` and "Live preview unavailable" panes
          // below — the only ones with a Retry button — were unreachable.
          // Fall through once the status check has come back negative, unless
          // there is a real error to show here.
          (sandboxEnabled || !sandboxStatusResolved || Boolean(sandboxError)) ? (
          /* Modal-only: wait / error / retry — never fake with srcdoc/WC/esbuild */
          <div className="flex-1 flex items-center justify-center bg-[var(--bg-base,#0a0a0a)]">
            <div className="text-center max-w-sm px-4">
              {!sandboxError && (
                <Loader2 className="w-6 h-6 animate-spin text-violet-400/70 mx-auto mb-3" />
              )}
              {/* The generic "Something went wrong while starting your app"
                  that used to live here threw away everything the docker
                  provider deliberately collects — the dev-log tail, the
                  process table, OOMKilled — and left nobody, user or us, with
                  any evidence. The first version of this fix over-corrected
                  and painted the raw provider string, which names the
                  container runtime, the missing environment variables and the
                  exhausted host port range. `describePreviewError` is the
                  middle: a sentence the user can act on, including whether
                  retrying is even worth it, with the raw text and boot log
                  kept for developers. */}
              <p className="text-sm font-medium text-foreground/80 mb-1">
                {sandboxError ? previewErrorCopy.title : "Starting live preview"}
              </p>
              <p className="text-xs text-muted-foreground/60 leading-relaxed">
                {sandboxError
                  ? previewErrorCopy.description
                  : modalPhaseLabel || "Spinning up your app…"}
              </p>
              {sandboxError && showRawDiagnostics && (
                <details className="mt-3 text-left">
                  <summary className="text-[11px] text-muted-foreground/70 cursor-pointer hover:text-foreground/80 select-none">
                    Developer detail
                  </summary>
                  <pre className="mt-2 max-h-56 overflow-auto rounded-md bg-black/40 p-2 text-[10px] leading-relaxed text-muted-foreground/80 whitespace-pre-wrap break-all">
                    {sandboxError}
                    {sandboxLogs ? `\n\n${sandboxLogs.slice(-4000)}` : ""}
                  </pre>
                </details>
              )}
              {sandboxError && (
                <div className="mt-4 flex items-center justify-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      void (async () => {
                        const re = await reconnectSandboxPreview();
                        if (!re.previewUrl) await requestSandboxPreview();
                      })();
                    }}
                    className="h-8 px-3 rounded-md text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white"
                  >
                    Retry
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      stopSandboxPreview();
                      void requestSandboxPreview();
                    }}
                    className="h-8 px-3 rounded-md text-xs font-medium border border-border text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  >
                    Restart preview
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : previewEngine === "webcontainer" ? (
          /* In-browser runtime (WebContainer) — zero server cost, runs on the
             user's own machine. `runtimeContainerRef` is the host the rest of
             this file already queries for `querySelector("iframe")` (visual
             edits, address bar, error bridge), so the iframe MUST live inside
             it or those features silently target nothing. */
          <div
            ref={runtimeContainerRef}
            className={`flex flex-col flex-1 min-h-0 overflow-hidden relative${errorGuard.freezePreview ? " pointer-events-none" : ""}`}
          >
            {wcUrl ? (
              withDeviceFrame(
                <iframe
                  id="static-preview-panel"
                  key={`wc-${wcUrl}-${refreshKey}`}
                  src={wcUrl}
                  data-preview-url={wcUrl}
                  className="w-full h-full min-h-0 border-0 bg-[var(--bg-base,#0a0a0a)]"
                  title="In-browser preview"
                  // `allow-popups-to-escape-sandbox` lets a preview open OAuth
                // (Supabase/Google/GitHub) in a NEW TAB that is NOT itself
                // sandboxed, so the sign-in can actually complete. Without it,
                // a same-frame OAuth redirect tries to embed the provider in
                // this iframe and the provider's X-Frame-Options shows
                // "<host> refused to connect" in the preview. OAuth providers
                // never permit framing; a new tab is the only way it works
                // inside a framed preview.
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-presentation"
                  allow="clipboard-read; clipboard-write; fullscreen"
                  onLoad={() => {
                    transitionPreviewMachine("ready", "webcontainer iframe loaded");
                    window.dispatchEvent(
                      new CustomEvent("lifemark-preview-settled", { detail: { ok: true } }),
                    );
                  }}
                />,
              )
            ) : (
              <div className="flex flex-1 items-center justify-center p-6">
                <div className="max-w-md text-center space-y-3">
                  <div className="text-sm font-medium">
                    {wcError ? "In-browser preview unavailable" : "Starting in-browser preview"}
                  </div>
                  <div className="text-xs text-muted-foreground whitespace-pre-wrap">
                    {wcError ?? wcPhase ?? "Booting runtime…"}
                  </div>
                  {wcError && (
                    <button
                      type="button"
                      onClick={() => setWcNonce((n) => n + 1)}
                      className="text-xs px-3 py-1.5 rounded-md border hover:bg-muted"
                    >
                      Restart runtime
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : previewEngine === "sandbox" && sandboxUrl ? (
          /* Real Modal sandbox — live Vite/Next on Modal tunnel */
          <div className={`flex flex-col flex-1 min-h-0 overflow-hidden relative${errorGuard.freezePreview ? " pointer-events-none" : ""}`}>
            {withDeviceFrame(
              <iframe
                id="static-preview-panel"
                // Prefer stable URL key — sandboxId churn from reclaim used to remount
                // onto a dying tunnel and paint a white blank pane. reloadNonce bumps
                // only when a zombie tunnel is healed in place, forcing a reconnect off
                // the stale connection-reset page.
                key={`sandbox-${sandboxUrl}-${refreshKey}-${sandboxReloadNonce}`}
                ref={sandboxIframeRef}
                src={sandboxUrlWithPath(sandboxUrl, sandboxIframePath)}
                data-preview-url={sandboxUrl}
                className="w-full h-full min-h-0 border-0 bg-[var(--bg-base,#0a0a0a)]"
                title="Live sandbox preview"
                // `allow-popups-to-escape-sandbox` lets a preview open OAuth
                // (Supabase/Google/GitHub) in a NEW TAB that is NOT itself
                // sandboxed, so the sign-in can actually complete. Without it,
                // a same-frame OAuth redirect tries to embed the provider in
                // this iframe and the provider's X-Frame-Options shows
                // "<host> refused to connect" in the preview. OAuth providers
                // never permit framing; a new tab is the only way it works
                // inside a framed preview.
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-presentation"
                allow="clipboard-read; clipboard-write; fullscreen"
                onLoad={() => {
                  transitionPreviewMachine("ready", "sandbox iframe loaded");
                  window.dispatchEvent(new CustomEvent("lifemark-preview-settled", { detail: { ok: true } }));
                  // Detect OAuth / external full-page navigations: after the
                  // bridge has been alive once, a subsequent load with no pong
                  // means the iframe left our app (e.g. supabase.co).
                  const expectAlive = sandboxBridgeAliveRef.current;
                  const token = ++sandboxPingTokenRef.current;
                  sandboxIframeRef.current?.contentWindow?.postMessage(
                    { type: "lifemark-preview-ping", token },
                    "*",
                  );
                  window.setTimeout(() => {
                    if (sandboxPongTokenRef.current === token) return;
                    if (!expectAlive) return;
                    const now = Date.now();
                    if (now - sandboxEscapeRemountAtRef.current < 2500) return;
                    sandboxEscapeRemountAtRef.current = now;
                    sandboxBridgeAliveRef.current = false;
                    setSandboxIframePath("/");
                    setRefreshKey((k) => k + 1);
                  }, 900);
                }}
                onError={() => {
                  // Dead tunnel (sandbox expired between renders) — reconnect to
                  // the current sandbox instead of leaving a broken frame.
                  void reconnectSandboxPreview().then((re) => {
                    if (!re.previewUrl) void requestSandboxPreview();
                  });
                }}
              />
            )}
            {visualEditEnabled && vebSelected && (
              <VebBridgePopover
                selection={vebSelected}
                selections={vebSelectedList}
                files={files}
                projectId={projectId}
                onFileChange={handleVebFileChange}
                onLiveApply={(payload) => {
                  sandboxIframeRef.current?.contentWindow?.postMessage(
                    { type: "lifemark-veb-apply", ...payload },
                    "*",
                  );
                }}
                onRequestAiEdit={onSendPromptToChat}
                onClose={() => {
                  clearVebSelection();
                  sandboxIframeRef.current?.contentWindow?.postMessage({ type: "lifemark-veb-clear" }, "*");
                }}
                onSelectionChange={(next) => {
                  setVebSelected(next);
                  setVebSelectedList((prev) =>
                    prev.map((p) => (p.xpath === next.xpath ? next : p)),
                  );
                }}
                onStageTextEdit={stagePendingTextEdit}
              />
            )}
            {projectId && (
              <PreviewAnnotations
                projectId={projectId}
                enabled={annotationsEnabled}
                onSendToChat={onSendPromptToChat}
              />
            )}
          </div>
        ) : showDeployedPreview && deployedUrl ? (
          <div className={`flex flex-col flex-1 min-h-0 overflow-hidden relative${errorGuard.freezePreview ? " pointer-events-none" : ""}`}>
            {withDeviceFrame(
              <iframe
                key={`deployed-${refreshKey}`}
                src={deployedUrl}
                className="w-full h-full border-0"
                title="Live deployment"
                // `allow-popups-to-escape-sandbox` lets a preview open OAuth
                // (Supabase/Google/GitHub) in a NEW TAB that is NOT itself
                // sandboxed, so the sign-in can actually complete. Without it,
                // a same-frame OAuth redirect tries to embed the provider in
                // this iframe and the provider's X-Frame-Options shows
                // "<host> refused to connect" in the preview. OAuth providers
                // never permit framing; a new tab is the only way it works
                // inside a framed preview.
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox allow-modals allow-downloads allow-presentation"
                allow="clipboard-read; clipboard-write; fullscreen"
                onLoad={() => transitionPreviewMachine("ready", "deployment iframe loaded")}
              />,
            )}
          </div>
        ) : !sandboxStatusResolved ? (
          /* Backend status still unknown — neutral loading only. This pane used
             to flash setup instructions (env var names, provider) at every
             editor open before the status check returned. */
          <div className="flex-1 flex items-center justify-center bg-[var(--bg-base,#0a0a0a)]">
            <div className="text-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground/40">Loading preview…</p>
            </div>
          </div>
        ) : (
          /* Live preview backend not configured. Setup details (env vars,
             provider name) are shown to DEVELOPERS only — end users get a
             generic message that never reveals the underlying technology. */
          <div className="flex-1 flex items-center justify-center bg-[var(--bg-base,#0a0a0a)]">
            <div className="text-center max-w-md px-6">
              <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-2xl border border-violet-500/30 bg-violet-500/10">
                <Globe className="size-5 text-violet-700 dark:text-violet-300" />
              </div>
              <p className="text-sm font-semibold text-foreground/90 mb-1.5">
                Live preview unavailable
              </p>
              <p className="text-xs text-muted-foreground/70 leading-relaxed mb-3">
                {process.env.NODE_ENV === "development"
                  ? "The live-sandbox backend is not configured for this server."
                  : "The live preview service is temporarily unavailable. Your project and files are safe — try again in a moment."}
              </p>
              {process.env.NODE_ENV === "development" && (
                <>
                  <pre className="text-left text-[11px] font-mono rounded-lg border border-border/60 bg-muted/30 px-3 py-2.5 text-muted-foreground mb-4 overflow-x-auto">
{`# .env.local
MODAL_TOKEN_ID=ak-...
MODAL_TOKEN_SECRET=...
# optional:
# MODAL_APP_NAME=lifemark-preview
# SANDBOX_PROVIDER=modal`}
                  </pre>
                  <p className="text-[10px] text-muted-foreground/50 mb-4">
                    Add tokens, restart <code className="text-muted-foreground/70">npm run dev</code>, then reload this editor.
                  </p>
                </>
              )}
              <button
                type="button"
                onClick={() => {
                  void (async () => {
                    const re = await reconnectSandboxPreview();
                    if (!re.enabled) {
                      toast({
                        title: "Preview unavailable",
                        description:
                          process.env.NODE_ENV === "development"
                            ? "Set MODAL_TOKEN_ID and MODAL_TOKEN_SECRET in .env.local"
                            : "The live preview service is not available right now. Try again shortly.",
                        variant: "destructive",
                      });
                      return;
                    }
                    if (!re.previewUrl) await requestSandboxPreview();
                  })();
                }}
                className="h-8 px-4 rounded-md text-xs font-medium bg-violet-600 hover:bg-violet-500 text-white"
              >
                Try again
              </button>
            </div>
          </div>
        )}

        {/* Console / Network / Perf — Modal live preview only */}
        {showConsole &&
          hasFiles &&
          previewEngine === "sandbox" &&
          !!sandboxUrl && (
            <div className="h-40 border-t border-border bg-muted/30 flex flex-col shrink-0">
              <div className="flex items-center gap-1 px-2 py-1 border-b border-border/60 shrink-0">
                {(["console", "network", "perf"] as const).map((tab) => (
                  <button
                    key={tab}
                    type="button"
                    onClick={() => setPreviewBottomTab(tab)}
                    className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors capitalize ${
                      previewBottomTab === tab
                        ? "bg-muted text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {tab === "console" ? "Console" : tab === "network" ? "Network" : "Perf"}
                    {tab === "network" && networkLines.length > 0 && (
                      <span className="ml-1 text-muted-foreground/70">({networkLines.length})</span>
                    )}
                  </button>
                ))}
              </div>
              <div className="flex-1 overflow-y-auto p-2 font-mono text-xs space-y-0.5">
                {previewBottomTab === "console" ? (
                  consoleLines.length === 0 ? (
                    <p className="text-muted-foreground">No console output yet…</p>
                  ) : (
                    consoleLines.map((line, i) => (
                      <div
                        key={i}
                        className={
                          line.type === "error" ? "text-red-400"
                            : line.type === "warn" ? "text-yellow-400"
                            : "text-foreground/80"
                        }
                      >
                        {line.text}
                      </div>
                    ))
                  )
                ) : previewBottomTab === "network" ? (
                  networkLines.length === 0 ? (
                    <p className="text-muted-foreground">No network activity yet…</p>
                  ) : (
                    networkLines.map((line, i) => (
                      <div key={i} className="text-foreground/70 truncate">
                        {`${line.method} ${line.url}`}
                        {line.status != null ? ` — ${line.status}` : ""}
                        {line.durationMs != null ? ` (${Math.round(line.durationMs)}ms)` : ""}
                        {line.error ? ` — ${line.error}` : ""}
                      </div>
                    ))
                  )
                ) : (
                  <p className="text-muted-foreground">Perf metrics appear when the live preview is running.</p>
                )}
              </div>
            </div>
          )}

        {/* LifemarkAI badge — overlaid on the preview (mirrors what appears on published apps) */}
        {!badgeHidden && (
          <div className="absolute bottom-0 right-0 pointer-events-none" style={{ zIndex: 50 }}>
            <div className="pointer-events-auto">
              <LifemarkBadge hidden={badgeHidden} projectRef={projectId} />
            </div>
          </div>
        )}

        {/* Generation shimmer overlay */}
        <AnimatePresence>
          {isGenerating && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="absolute inset-0 z-40 pointer-events-none"
            >
              {/* Frosted glass dimmer */}
              <div className="absolute inset-0 bg-background/60 backdrop-blur-[1px]" />
              {/* Scanning shimmer line */}
              <motion.div
                className="absolute left-0 right-0 h-[2px] bg-gradient-to-r from-transparent via-violet-400 to-transparent opacity-70"
                animate={{ top: ["0%", "100%"] }}
                transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
              />
              {/* Status badge */}
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="flex items-center gap-2.5 bg-background/90 backdrop-blur-md border border-violet-500/30 rounded-full px-4 py-2 shadow-xl">
                  <div className="flex gap-0.5">
                    {[0, 1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-violet-400"
                        animate={{ scale: [1, 1.5, 1], opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 0.8, delay: i * 0.15, repeat: Infinity }}
                      />
                    ))}
                  </div>
                  <span className="text-[12px] text-violet-800 dark:text-violet-200 font-medium">
                    {generatingFileCount > 0
                      ? `Writing ${generatingFileCount} file${generatingFileCount !== 1 ? "s" : ""}…`
                      : "AI is generating…"}
                  </span>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        <PreviewHealingOverlay
          phase={errorGuard.phase}
          report={errorGuard.report}
          importDiagnosis={previewDiagnosis}
          onRetry={() => errorGuard.startHealing()}
          onShowLogs={() => setShowConsole((value) => !value)}
          onDismiss={() => errorGuard.clearErrors()}
          logsVisible={showConsole}
        />

        {previewStatusText && previewMachineState !== "ready" && (
          <div className="absolute top-2 left-2 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background/90 border border-border/70 text-[10px] text-muted-foreground shadow-sm">
            {previewMachineState === "building" || previewMachineState === "loading" ? (
              <Loader2 className="w-3 h-3 animate-spin text-blue-400" />
            ) : previewMachineState === "error" ? (
              <AlertTriangle className="w-3 h-3 text-red-400" />
            ) : (
              <Check className="w-3 h-3 text-amber-400" />
            )}
            <span>{previewStatusText}</span>
          </div>
        )}

        <AnimatePresence>
          {showRecoveryOverlay && (
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.18 }}
              // Lovable-style neutral error card: bg-secondary-pulse + shadow-surface-xl, red dot, round "Try to fix" pill
              className="absolute top-12 left-1/2 -translate-x-1/2 z-40 w-[min(420px,92%)] rounded-[var(--radius-6)] bg-[var(--bg-secondary-pulse)] shadow-surface-xl px-4 py-3"
            >
              <div className="flex items-start gap-2.5">
                <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-red-500" aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-[var(--fg-primary)]">Your preview has an error</div>
                  <div className="mt-0.5 text-xs text-[var(--fg-tertiary)] truncate">
                    {activeError ?? errorGuard.report?.errors[0]?.message ?? "The last update could not render cleanly."}
                  </div>
                  {previewDiagnosis && (
                    <div className="mt-1 text-[11px] text-[var(--fg-tertiary)]/80 line-clamp-2">
                      {previewDiagnosis.replace(/\n+/g, " ").slice(0, 180)}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2.5 flex flex-wrap items-center justify-end gap-1">
                <button
                  onClick={() => setShowConsole((value) => !value)}
                  className="h-7 rounded-full px-3 text-xs text-[var(--fg-primary)] hover:bg-[var(--bg-muted)] transition-colors"
                >
                  Show error
                </button>
                <button
                  onClick={() => refreshPreview(files)}
                  className="h-7 rounded-full px-3 text-xs text-[var(--fg-primary)] hover:bg-[var(--bg-muted)] transition-colors"
                >
                  Refresh
                </button>
                {onFixWithAI && (
                  <button
                    onClick={() => {
                      handleFixWithAI(activeError ?? errorGuard.report?.formatted ?? "Preview runtime error");
                      setErrorDismissed(true);
                    }}
                    className="h-7 rounded-full px-3 text-xs font-medium bg-[var(--fg-primary)] text-[var(--bg-base)] hover:opacity-90 transition-opacity"
                  >
                    Try to fix
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {hideTopChrome && <LovablePreviewStatusPill label={previewStatusText} />}

        {hideTopChrome && (
          <LovablePreviewInteractionToolbar
            visualEdit={visualEdit}
            visualEditDisabled={!!versionPreviewLabel}
            onVisualEditToggle={() => {
              if (versionPreviewLabel) return;
              setEditTextMode(false);
              setVisualEdit(!visualEdit);
              onVisualEditToggle?.();
            }}
            editTextMode={editTextMode}
            onEditTextToggle={() => {
              if (versionPreviewLabel) return;
              const next = !editTextMode;
              setEditTextMode(next);
              if (next && !visualEdit) {
                setVisualEdit(true);
                onVisualEditToggle?.();
              }
            }}
            commentPinMode={commentPinMode}
            onCommentPinToggle={() => {
              setCommentPinMode((v) => !v);
              if (commentPinMode) setPendingComment(null);
            }}
            annotationsEnabled={annotationsEnabled}
            onAnnotationsToggle={() => setAnnotationsEnabled((v) => !v)}
            onCaptureAnnotate={captureForAnnotation}
            showConsole={showConsole}
            onConsoleToggle={() => setShowConsole((v) => !v)}
            onRefresh={refresh}
            previewFullscreen={previewFullscreen}
            onFullscreenToggle={() => setPreviewFullscreen((v) => !v)}
            showFrame={showFrame}
            onFrameToggle={() => setShowFrame((v) => !v)}
            device={device}
            onDeviceChange={(d) => {
              setDevice(d);
              window.dispatchEvent(new CustomEvent("lifemark-preview-device", { detail: d }));
            }}
            selectionCount={vebSelectedList.length}
            onClearSelections={clearVebSelection}
            onAskAboutSelections={() => {
              if (vebSelectedList.length === 0) return;
              const lines = vebSelectedList.map((el, i) => {
                const text = el.textContent.trim().slice(0, 80);
                return `${i + 1}. <${el.tagName}>${text ? ` "${text}"` : ""}${
                  el.classList.length ? ` class="${el.classList.slice(0, 4).join(" ")}"` : ""
                }`;
              });
              onSendPromptToChat?.(
                `I selected ${vebSelectedList.length} element${vebSelectedList.length === 1 ? "" : "s"} in the preview:\n${lines.join("\n")}\n\nPlease improve or fix these elements.`,
              );
              clearVebSelection();
            }}
            annotationCount={annotationMeta.count}
            canAnnotationUndo={annotationMeta.canUndo}
            canAnnotationRedo={annotationMeta.canRedo}
            onAnnotationUndo={() =>
              window.dispatchEvent(new CustomEvent("lifemark-preview-annotations-undo"))
            }
            onAnnotationRedo={() =>
              window.dispatchEvent(new CustomEvent("lifemark-preview-annotations-redo"))
            }
            onAnnotationClear={() => {
              window.dispatchEvent(new CustomEvent("lifemark-preview-annotations-clear"));
            }}
            pendingChangeCount={pendingVisualEdits.length}
            onClearPendingChanges={clearPendingVisualEdits}
            onSendPendingChanges={sendPendingVisualEdits}
            unreadCommentCount={
              commentsBannerDismissed ? 0 : openCommentCount
            }
            onViewComments={() => {
              setCommentsBannerDismissed(true);
              onOpenPanel?.("comments");
            }}
            onDismissCommentsBanner={() => setCommentsBannerDismissed(true)}
            reverting={isRevertingPreview}
            onDismissReverting={() => setIsRevertingPreview(false)}
          />
        )}

        {showDeployedPreview && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/15 border border-violet-500/25 text-[10px] text-violet-700 dark:text-violet-300">
            <Globe className="w-3 h-3" />
            Live deployment
          </div>
        )}

        {/* Fix-with-AI error banner */}
        <AnimatePresence>
          {activeError && !errorDismissed && !outOfCredits && !errorGuard.freezePreview && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              transition={{ duration: 0.2 }}
              className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 max-w-[90%] bg-red-950/95 backdrop-blur-sm border border-red-500/40 text-red-800 dark:text-red-200 text-xs px-3 py-2 rounded-xl shadow-2xl"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="flex-1 truncate min-w-0 font-mono opacity-80">
                {activeError.length > 80 ? activeError.slice(0, 80) + "…" : activeError}
              </span>
              {onFixWithAI && (
                <button
                  onClick={() => { handleFixWithAI(activeError); setErrorDismissed(true); }}
                  className="flex items-center gap-1 shrink-0 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-800 dark:text-red-200 px-2 py-1 rounded-lg transition-colors"
                >
                  <Wrench className="w-3 h-3" />
                  Fix with AI
                </button>
              )}
              <button
                onClick={() => setErrorDismissed(true)}
                className="shrink-0 text-red-400/60 hover:text-red-300 transition-colors ml-1"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    {/* Capture & annotate modal */}
    {annotateScreenshot && (
      <PreviewAnnotateModal
        screenshotDataUrl={annotateScreenshot}
        onClose={() => setAnnotateScreenshot(null)}
        onSend={(annotatedDataUrl, prompt) => {
          onSendAnnotatedToChat?.(prompt, annotatedDataUrl);
          setAnnotateScreenshot(null);
        }}
      />
    )}

    {pendingComment && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Pin comment to element</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                &lt;{pendingComment.tagName}&gt; on {previewPath}
                {pendingComment.textContent ? ` — "${pendingComment.textContent.slice(0, 40)}…"` : ""}
              </p>
            </div>
            <button type="button" onClick={() => setPendingComment(null)} className="text-muted-foreground hover:text-foreground">
              <X className="w-4 h-4" />
            </button>
          </div>
          <Textarea
            value={commentDraft}
            onChange={(e) => setCommentDraft(e.target.value)}
            placeholder="Leave a comment for your team…"
            className="min-h-[80px] text-sm"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setPendingComment(null)}>Cancel</Button>
            <Button
              variant="outline"
              size="sm"
              disabled={!commentDraft.trim()}
              onClick={sendElementCommentToChat}
            >
              Send to AI
            </Button>
            <Button size="sm" disabled={commentSaving || !commentDraft.trim()} onClick={() => void submitElementComment()}>
              {commentSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Post comment"}
            </Button>
          </div>
        </div>
      </div>
    )}

    {activePinComment && (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4">
        <div className="w-full max-w-md rounded-xl border border-border bg-background shadow-xl p-4 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-semibold">Pinned comment</p>
              <p className="text-[11px] text-muted-foreground mt-0.5 font-mono truncate">
                &lt;{activePinComment.element_tag ?? "element"}&gt; on{" "}
                {activePinComment.page_path || previewPath}
                {activePinComment.element_preview
                  ? ` — "${activePinComment.element_preview.slice(0, 40)}"`
                  : ""}
              </p>
              {activePinComment.is_guest && (
                <p className="text-[10px] text-sky-400 mt-1">
                  Guest{activePinComment.guest_name ? `: ${activePinComment.guest_name}` : ""}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => setActivePinComment(null)}
              className="text-muted-foreground hover:text-foreground shrink-0"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-wrap break-words">
            {activePinComment.content}
          </p>
          <div className="flex justify-end gap-2 flex-wrap">
            <Button variant="ghost" size="sm" onClick={() => setActivePinComment(null)}>
              Close
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                onOpenPanel?.("comments");
                setActivePinComment(null);
              }}
            >
              Open Comments
            </Button>
            <Button variant="outline" size="sm" onClick={sendActivePinCommentToChat}>
              Send to AI
            </Button>
            <Button
              size="sm"
              disabled={pinResolving}
              onClick={() => {
                if (!projectId || !activePinComment) return;
                setPinResolving(true);
                void fetch(`/api/projects/${projectId}/comments/${activePinComment.id}`, {
                  method: "PATCH",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ resolved: true }),
                })
                  .then((res) => {
                    if (!res.ok) throw new Error("resolve failed");
                    setActivePinComment(null);
                    void refreshElementCommentPins();
                    toast({ title: "Comment resolved" });
                  })
                  .catch(() => toast({ title: "Could not resolve", variant: "destructive" }))
                  .finally(() => setPinResolving(false));
              }}
            >
              {pinResolving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Resolve"}
            </Button>
          </div>
        </div>
      </div>
    )}
    </TooltipProvider>
  );
}

// ── VebPopover ─────────────────────────────────────────────────────────────────
// Popover that appears when the VEB bridge reports a click inside the Sandpack iframe.

interface VebPopoverProps {
  selected: VebElement;
  files: ProjectFile[];
  onFileChange: (path: string, content: string) => void;
  onClose: () => void;
}

function VebPopover({ selected, files, onFileChange, onClose }: VebPopoverProps) {
  const [activeTab, setActiveTab] = useState<"text" | "colors" | "spacing">("text");
  const [editText, setEditText] = useState(selected.textContent);
  const [editClasses, setEditClasses] = useState(selected.classList.join(" "));

  const left = Math.min(selected.rect.left + selected.rect.width / 2 - 136, window.innerWidth - 288);
  const top = Math.min(selected.rect.top + selected.rect.height + 8, window.innerHeight - 420);

  function applyFileChange({ textContent, classes }: { textContent?: string; classes?: string }) {
    const appFile =
      files.find((f) => f.path.endsWith("App.tsx") || f.path.endsWith("App.jsx")) ??
      files.find((f) => f.path.endsWith("index.tsx") || f.path.endsWith("index.jsx")) ??
      files[0];
    if (!appFile) return;

    let content = appFile.content;
    if (textContent !== undefined && selected.textContent) {
      content = content.replace(selected.textContent, textContent);
    }
    if (classes !== undefined) {
      const regex = /className="([^"]*)"/g;
      let found = false;
      content = content.replace(regex, (match, existing: string) => {
        if (!found && existing === selected.classList.join(" ")) {
          found = true;
          return `className="${classes}"`;
        }
        return match;
      });
    }
    onFileChange(appFile.path, content);
  }

  function addClass(cls: string) {
    const updated = editClasses.includes(cls)
      ? editClasses.split(" ").filter((c) => c !== cls).join(" ")
      : (editClasses + " " + cls).trim();
    setEditClasses(updated);
    applyFileChange({ classes: updated });
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -8, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="fixed z-50 bg-popover border border-border rounded-2xl shadow-2xl w-72"
        style={{ left: Math.max(8, left), top: Math.max(8, top) }}
      >
        {/* Selection border */}
        <div
          className="fixed pointer-events-none z-40 border-2 border-blue-500 rounded"
          style={{
            top: selected.rect.top,
            left: selected.rect.left,
            width: selected.rect.width,
            height: selected.rect.height,
          }}
        />

        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Wand2 className="w-4 h-4 text-violet-400" />
            <span className="text-sm font-medium">&lt;{selected.tagName}&gt;</span>
          </div>
          <Button variant="ghost" size="icon" className="w-6 h-6" onClick={onClose}>
            <X className="w-3.5 h-3.5" />
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-border">
          {(["text", "colors", "spacing"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-2 text-xs font-medium capitalize transition-colors ${
                activeTab === tab
                  ? "text-foreground border-b-2 border-violet-500"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="p-3 space-y-3">
          {activeTab === "text" && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Content</label>
                <div className="flex gap-1">
                  <Input
                    value={editText}
                    onChange={(e) => setEditText(e.target.value)}
                    className="h-8 text-xs"
                    onKeyDown={(e) => e.key === "Enter" && applyFileChange({ textContent: editText })}
                  />
                  <Button size="icon" className="w-8 h-8 shrink-0" onClick={() => applyFileChange({ textContent: editText })}>
                    <Check className="w-3.5 h-3.5" />
                  </Button>
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Size</label>
                <div className="flex flex-wrap gap-1">
                  {TAILWIND_SIZES.map((cls) => (
                    <button key={cls} onClick={() => addClass(cls)}
                      className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                        editClasses.includes(cls)
                          ? "bg-violet-500/20 border-violet-500/40 text-violet-700 dark:text-violet-300"
                          : "bg-muted border-border hover:bg-accent"
                      }`}
                    >
                      {cls.replace("text-", "")}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Weight</label>
                <div className="flex flex-wrap gap-1">
                  {TAILWIND_WEIGHTS.map((cls) => (
                    <button key={cls} onClick={() => addClass(cls)}
                      className={`px-2 py-0.5 rounded text-xs border transition-colors ${
                        editClasses.includes(cls)
                          ? "bg-violet-500/20 border-violet-500/40 text-violet-700 dark:text-violet-300"
                          : "bg-muted border-border hover:bg-accent"
                      }`}
                    >
                      {cls.replace("font-", "")}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Align</label>
                <div className="flex gap-1">
                  {[
                    { cls: "text-left", Icon: AlignLeft },
                    { cls: "text-center", Icon: AlignCenter },
                    { cls: "text-right", Icon: AlignRight },
                  ].map(({ cls, Icon }) => (
                    <button key={cls} onClick={() => addClass(cls)}
                      className={`flex-1 flex items-center justify-center py-1.5 rounded border transition-colors ${
                        editClasses.includes(cls)
                          ? "bg-violet-500/20 border-violet-500/40"
                          : "bg-muted border-border hover:bg-accent"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {activeTab === "colors" && (
            <>
              <div>
                <label className="text-xs text-muted-foreground mb-1 block">Text color</label>
                <div className="flex flex-wrap gap-1">
                  {TAILWIND_COLORS.map((cls) => (
                    <button
                      key={cls}
                      onClick={() => addClass(cls)}
                      title={cls}
                      className={`w-6 h-6 rounded border border-border/40 transition-all hover:scale-110 bg-${cls.replace("text-","").replace("bg-","")}`}
                    />
                  ))}
                </div>
              </div>
            </>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
