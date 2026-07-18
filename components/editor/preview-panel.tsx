"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  RefreshCw, Smartphone, Tablet, Monitor,
  ExternalLink, MousePointer, Terminal, Loader2,
  Check, X, Wand2, AlignLeft, AlignCenter, AlignRight,
  AlertTriangle, Wrench, Frame, MessageSquarePlus, Pencil, Pin, Globe, History,
  ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Maximize2, Minimize2,
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AnimatePresence, motion } from "framer-motion";
import { VisualEditOverlay, VebBridgePopover } from "./visual-edit-overlay";
import { PreviewAnnotations } from "./preview-annotations";
import { PreviewAnnotateModal } from "./preview-annotate-modal";
import { LifemarkBadge } from "@/components/shared/lifemark-badge";
import type { ProjectFile } from "@/types/database";
import dynamic from "next/dynamic";
import { buildFallbackHtml, EMPTY_PREVIEW_HTML, PREVIEW_ENGINE_REV } from "@/lib/preview/build-fallback-html";
import { buildEsbuildHtml } from "@/lib/preview/esbuild-engine";
import { filesContentSignature } from "@/lib/preview/files-signature";
import { resolvePreviewEngine, shouldUseWebContainer, WC_UNAVAILABLE_KEY, type PreviewEngine } from "@/lib/preview/resolve-preview-engine";
import { sandboxUrlWithPath } from "@/lib/preview/sandbox-url";
import { getPreviewBarLabel } from "@/lib/preview/preview-url";
import { useSandboxPreview } from "@/lib/preview/use-sandbox-preview";
import { usePreviewErrorGuard } from "@/hooks/use-preview-error-guard";
import { isNoisePreviewError, type PreviewErrorReport } from "@/lib/preview/preview-error-bridge";
import { appendPreviewDiagnosis, buildPreviewDiagnosis } from "@/lib/preview/diagnose-preview";
import { applyVisualEdit, buildVisualEditPrompt } from "@/lib/editor/apply-visual-edit";
import { PreviewHealingOverlay } from "./preview-healing-overlay";
import Link from "next/link";
import { LovablePreviewInteractionToolbar } from "./lovable/preview-interaction-toolbar";
import { LovablePreviewStatusPill } from "./lovable/preview-status-pill";
import { LovableVersionPreviewBanner } from "./lovable/version-preview-banner";

const WebContainerPreview = dynamic(() => import("./webcontainer-preview"), {
  ssr: false,
  loading: () => (
    <div className="flex-1 flex items-center justify-center bg-[#0a0a0a]">
      <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/50" />
    </div>
  ),
});

// Sandpack stubs — these branches are never reached (sandpackReady is always false)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SandpackProvider = "div" as any;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const SandpackConsoleComp = "div" as any;

// Sandpack dynamic imports kept for type reference but not used at runtime —
// the preview always uses the local srcdoc/Babel engine (sandpackReady=false).
// Removing these would require a larger refactor of the conditional render tree.

// Visual Edit Bridge — injected into Sandpack iframe via files map
const VEB_SCRIPT = `(function() {
  if (window.parent === window) return;
  var style = document.createElement('style');
  style.textContent = [
    '.lm-hover{outline:2px solid #7c3aed!important;outline-offset:2px;cursor:pointer!important}',
    '.lm-selected{outline:2px solid #0e90e8!important;outline-offset:2px}'
  ].join('');
  document.head.appendChild(style);
  var hovered = null;
  function getXPath(el) {
    var parts = [], cur = el;
    while (cur && cur !== document.body) {
      var tag = cur.tagName.toLowerCase();
      var parent = cur.parentElement;
      var sibs = parent ? Array.from(parent.children).filter(function(c){return c.tagName===cur.tagName}) : [cur];
      parts.unshift(sibs.length > 1 ? tag+'['+(sibs.indexOf(cur)+1)+']' : tag);
      cur = parent;
    }
    return '//'+parts.join('/');
  }
  document.addEventListener('mouseover', function(e) {
    if (hovered && hovered !== e.target) hovered.classList.remove('lm-hover');
    hovered = e.target;
    if (hovered) hovered.classList.add('lm-hover');
  });
  document.addEventListener('mouseout', function(e) {
    if (e.target) e.target.classList.remove('lm-hover');
  });
  document.addEventListener('click', function(e) {
    e.preventDefault(); e.stopPropagation();
    var el = e.target;
    var rect = el.getBoundingClientRect();
    document.querySelectorAll('.lm-selected').forEach(function(n){n.classList.remove('lm-selected')});
    el.classList.add('lm-selected');
    window.parent.postMessage({
      source: 'lifemark-veb',
      tagName: el.tagName.toLowerCase(),
      textContent: (el.textContent || '').trim(),
      classList: Array.from(el.classList).filter(function(c){return !c.startsWith('lm-')}),
      xpath: getXPath(el),
      rect: { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
    }, '*');
  }, true);
})();`;

type DeviceSize = "mobile" | "tablet" | "desktop";
type PreviewMachineState = "idle" | "building" | "loading" | "ready" | "error" | "fallback";

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
}

function OutOfCreditsPreviewPaused() {
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center bg-[#0a0a0a]">
      <div className="text-center max-w-sm px-8 py-10">
        <div className="w-12 h-12 rounded-xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center mx-auto mb-4">
          <AlertTriangle className="w-5 h-5 text-violet-400" />
        </div>
        <p className="text-sm font-semibold text-foreground mb-2">Preview paused</p>
        <p className="text-xs text-muted-foreground leading-relaxed mb-5">
          Your files are saved. Add credits to rebuild and preview your app.
        </p>
        <Link
          href="/dashboard/billing"
          className="inline-flex items-center gap-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-medium px-4 py-2 transition-colors"
        >
          Upgrade plan
        </Link>
      </div>
    </div>
  );
}

const DEVICE_WIDTHS: Record<DeviceSize, string> = {
  mobile: "390px",
  tablet: "768px",
  desktop: "100%",
};

// ── WebContainer availability flag with TTL ──────────────────────────────────
// WC_UNAVAILABLE_KEY used to be set once and never cleared, so a single
// transient boot failure (network blip loading @webcontainer/api, one slow
// boot) locked the user into the fallback engine for the entire tab session.
// The flag now expires after 10 minutes; a companion timestamp key tracks age.
const WC_UNAVAILABLE_AT_KEY = `${WC_UNAVAILABLE_KEY}-at`;
const WC_UNAVAILABLE_TTL_MS = 10 * 60 * 1000;

// How long a WebContainer may keep warming in the BACKGROUND before we give up on
// it. This must outlast WebContainerPreview's own phase budgets (boot 18s +
// install 75s + start 35s ≈ 128s), otherwise we tear the container down while it
// is still legitimately installing — which is precisely what the previous 12s
// value did, so the background Vite hand-off could never once succeed.
const WC_WARM_BUDGET_MS = 140_000;

function isWcBlocked(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (sessionStorage.getItem(WC_UNAVAILABLE_KEY) !== "1") return false;
    const at = Number(sessionStorage.getItem(WC_UNAVAILABLE_AT_KEY) ?? 0);
    if (at > 0 && Date.now() - at > WC_UNAVAILABLE_TTL_MS) {
      sessionStorage.removeItem(WC_UNAVAILABLE_KEY);
      sessionStorage.removeItem(WC_UNAVAILABLE_AT_KEY);
      return false;
    }
    // Legacy flag without a timestamp — start the TTL clock now.
    if (!at) sessionStorage.setItem(WC_UNAVAILABLE_AT_KEY, String(Date.now()));
    return true;
  } catch {
    return false;
  }
}

function markWcUnavailable(): void {
  try {
    sessionStorage.setItem(WC_UNAVAILABLE_KEY, "1");
    sessionStorage.setItem(WC_UNAVAILABLE_AT_KEY, String(Date.now()));
  } catch {
    /* storage unavailable — engine choice just won't persist */
  }
}

function clearWcBlock(): void {
  try {
    sessionStorage.removeItem(WC_UNAVAILABLE_KEY);
    sessionStorage.removeItem(WC_UNAVAILABLE_AT_KEY);
  } catch {
    /* ignore */
  }
}

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

function isEsbuildPreviewEnabled(): boolean {
  return (
    process.env.NEXT_PUBLIC_PREVIEW_ESBUILD === "1" ||
    process.env.NEXT_PUBLIC_PREVIEW_ESBUILD === "true"
  );
}

function shouldAutoStartVitePreview(): boolean {
  // Lovable parity: real Vite dev server by default. Set NEXT_PUBLIC_PREVIEW_AUTO_VITE=0 to disable.
  return process.env.NEXT_PUBLIC_PREVIEW_AUTO_VITE !== "0";
}

function detectTemplate(files: ProjectFile[]): "react-ts" | "react" | "static" {
  const paths = files.map((f) => f.path);
  if (paths.some((p) => p.endsWith(".tsx") || p.endsWith(".ts"))) return "react-ts";
  if (paths.some((p) => p.endsWith(".jsx"))) return "react";
  return "static";
}

function toSandpackFiles(files: ProjectFile[]): Record<string, { code: string }> {
  const map: Record<string, { code: string }> = {};
  for (const f of files) {
    let sp = f.path.startsWith("/") ? f.path : `/${f.path}`;
    sp = sp.replace(/^\/src\//, "/");
    map[sp] = { code: f.content ?? "" };
  }
  if (!map["/index.css"] && !map["/styles.css"]) {
    map["/index.css"] = { code: "@tailwind base;\n@tailwind components;\n@tailwind utilities;" };
  }
  return map;
}

function addVebBridge(
  files: Record<string, { code: string }>
): Record<string, { code: string }> {
  const result = { ...files };
  // Inject the bridge script file
  result["/__veb.js"] = { code: VEB_SCRIPT };
  // Inject into index.html (used by static template) or public/index.html (react template)
  const htmlKey = result["/public/index.html"] ? "/public/index.html"
    : result["/index.html"] ? "/index.html"
    : null;
  if (htmlKey) {
    result[htmlKey] = {
      code: result[htmlKey].code.replace("</body>", '<script src="/__veb.js"></script></body>'),
    };
  } else {
    // Provide a custom index.html that includes the bridge
    result["/public/index.html"] = {
      code: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Preview</title>
</head>
<body>
  <div id="root"></div>
  <script src="/__veb.js"></script>
</body>
</html>`,
    };
  }
  return result;
}

// ── Device frame components ───────────────────────────────────────────────────

function PhoneFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-col items-center justify-center h-full py-4">
      {/* Outer bezel */}
      <div
        className="relative flex flex-col rounded-[44px] overflow-hidden shadow-[0_0_0_2px_#3a3a3c,0_0_0_8px_#1c1c1e,0_20px_60px_rgba(0,0,0,0.7)]"
        style={{ width: 390, height: 812, background: "#000", flexShrink: 0 }}
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
      {/* Side buttons */}
      <div className="absolute left-[-3px] top-[120px] w-[3px] h-8 bg-[#3a3a3c] rounded-l-sm" />
      <div className="absolute left-[-3px] top-[160px] w-[3px] h-12 bg-[#3a3a3c] rounded-l-sm" />
      <div className="absolute left-[-3px] top-[184px] w-[3px] h-12 bg-[#3a3a3c] rounded-l-sm" />
      <div className="absolute right-[-3px] top-[150px] w-[3px] h-16 bg-[#3a3a3c] rounded-r-sm" />
    </div>
  );
}

function TabletFrame({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative flex flex-col items-center justify-center h-full py-4">
      <div
        className="relative rounded-[24px] overflow-hidden shadow-[0_0_0_2px_#3a3a3c,0_0_0_10px_#1c1c1e,0_20px_60px_rgba(0,0,0,0.7)]"
        style={{ width: 768, maxWidth: "calc(100vw - 120px)", height: 680, background: "#000", flexShrink: 0 }}
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
  const [previewBottomTab, setPreviewBottomTab] = useState<"console" | "network">("console");
  const [annotateScreenshot, setAnnotateScreenshot] = useState<string | null>(null);
  const [commentPinMode, setCommentPinMode] = useState(false);
  const [pendingComment, setPendingComment] = useState<VebElement | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const { toast } = useToast();
  const [previewEngine, setPreviewEngine] = useState<PreviewEngine>(() => {
    if (typeof window === "undefined") return "fallback";
    if (isWcBlocked()) return "fallback";
    return "fallback";
  });
  const [vitePreviewRequested, setVitePreviewRequested] = useState(shouldAutoStartVitePreview);
  const [backgroundViteActive, setBackgroundViteActive] = useState(false);
  const [backgroundViteKey, setBackgroundViteKey] = useState(0);
  const [consoleLines, setConsoleLines] = useState<{ type: string; text: string }[]>([]);
  const [networkLines, setNetworkLines] = useState<
    { method: string; url: string; status?: number; ok?: boolean; durationMs?: number; error?: string }[]
  >([]);
  const clearPreviewLogs = useCallback(() => {
    setConsoleLines([]);
    setNetworkLines([]);
  }, []);
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
  // Real cloud sandbox preview (Modal — Lovable parity; E2B fallback).
  const {
    previewUrl: sandboxUrl,
    enabled: sandboxEnabled,
    provider: sandboxProvider,
    stopPreview: stopSandboxPreview,
    syncFiles: syncSandboxFiles,
    sandboxId,
    loading: sandboxLoading,
  } = useSandboxPreview(projectId ?? "");
  const sandboxIdLiveRef = useRef(sandboxId);
  sandboxIdLiveRef.current = sandboxId;
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
  const [activeError, setActiveError] = useState<string | null>(null);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [previewCompileFailed, setPreviewCompileFailed] = useState(false);
  const [previewCompileOk, setPreviewCompileOk] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sandpackContainerRef = useRef<HTMLDivElement>(null);
  const sandboxIframeRef = useRef<HTMLIFrameElement>(null);
  const unifiedIframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [annotationsEnabled, setAnnotationsEnabled] = useState(false);

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
    if (!visualEditEnabled) setVebSelected(null);
  }, [visualEditEnabled]);

  const getPreviewContentWindow = useCallback((): Window | null => {
    if (previewEngine === "webcontainer") {
      return sandpackContainerRef.current?.querySelector("iframe")?.contentWindow ?? null;
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

  // Pick WebContainers (Lovable-style Vite runtime) or srcdoc fallback.
  useEffect(() => {
    if (files.length === 0) {
      setPreviewEngine((prev) => (prev === "fallback" ? prev : "fallback"));
      return;
    }

    // isWcBlocked() also CLEARS an expired flag from sessionStorage before
    // resolvePreviewEngine() independently re-reads it below.
    const wcBlocked = isWcBlocked();

    if (wcBlocked) {
      setPreviewEngine((prev) => (prev === "fallback" ? prev : "fallback"));
      return;
    }

    const isolated = typeof window !== "undefined" ? window.crossOriginIsolated : false;
    const engine = resolvePreviewEngine(files, {
      preferWebContainers: useWebContainers && vitePreviewRequested,
      crossOriginIsolated: isolated,
      sandboxUrl,
    });
    setPreviewEngine((prev) => (prev === engine ? prev : engine));
  }, [files, useWebContainers, vitePreviewRequested, projectId, sandboxUrl]);

  const getActivePreviewIframe = useCallback((): HTMLIFrameElement | null => {
    if (previewEngine === "webcontainer") {
      return sandpackContainerRef.current?.querySelector("iframe") ?? null;
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

  // Auto-warm Vite preview on open — only when cloud sandbox is NOT configured.
  // Lovable never runs browser npm install when Modal is available.
  useEffect(() => {
    if (sandboxEnabled) return;
    if (!useWebContainers || files.length === 0 || isWcBlocked()) return;
    if (!shouldUseWebContainer(files)) return;
    setVitePreviewRequested(true);
    setBackgroundViteActive(true);
  }, [sandboxEnabled, useWebContainers, projectId, files.length]);

  // Top-bar URL bar → in-preview navigation (hideTopChrome mode).
  useEffect(() => {
    function onExternalNavigate(e: Event) {
      const pathname = (e as CustomEvent<{ pathname?: string }>).detail?.pathname;
      if (!pathname || typeof pathname !== "string") return;
      const target = pathname.startsWith("/") ? pathname : `/${pathname}`;
      if (previewEngine !== "sandbox") {
        getPreviewContentWindow()?.postMessage({ type: "lifemark-preview-navigate", pathname: target }, "*");
      }
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
  }, [previewEngine, getPreviewContentWindow]);
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
      const d = e.data as Record<string, unknown> | null;
      if (!d || typeof d !== "object") return;
      if (d.source === "lifemark-veb" && visualEditEnabled) {
        const data = asVebElement(d);
        if (!data) return;
        const iframe = getActivePreviewIframe();
        const iframeRect = iframe?.getBoundingClientRect();
        setVebSelected({
          ...data,
          rect: {
            top: data.rect.top + (iframeRect?.top ?? 0),
            left: data.rect.left + (iframeRect?.left ?? 0),
            width: data.rect.width,
            height: data.rect.height,
          },
        });
      }
      if (d.source === "lifemark-veb-inline" && visualEditEnabled) {
        const data = asVebInlineElement(d);
        const text = typeof d.text === "string" ? d.text : null;
        if (!data || !text) return;
        const result = applyVisualEdit(filesRef.current, data, { text });
        if (result) {
          const file = filesRef.current.find((f) => f.path === result.path);
          if (file && onFileUpdateRef.current) {
            onFileUpdateRef.current({ ...file, content: result.content });
          }
        } else {
          onSendPromptToChatRef.current?.(buildVisualEditPrompt(data, { text }));
        }
        getPreviewContentWindow()?.postMessage(
          { type: "lifemark-veb-apply", xpath: data.xpath, text },
          "*",
        );
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
        const error = typeof d.error === "string" ? d.error : undefined;
        setNetworkLines((prev) => [
          ...prev.slice(-99),
          { method, url, status, ok, durationMs, error },
        ]);
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
      if (d.type === "lifemark-preview-location") {
        const pathname = d.pathname;
        if (typeof pathname === "string" && pathname.length > 0) {
          setPreviewPath(pathname);
          // Don't clobber whatever the user is typing into the address bar.
          if (!urlEditing) setUrlInput(pathname);
          // Record in the back/forward history — unless this location change
          // was caused by a back/forward click itself.
          if (navSuppressRef.current) {
            navSuppressRef.current = false;
          } else {
            setRouteNav((prev) =>
              prev.stack[prev.idx] === pathname
                ? prev
                : { stack: [...prev.stack.slice(0, prev.idx + 1), pathname], idx: prev.idx + 1 },
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
  }, [onError, visualEditEnabled, commentPinMode, outOfCredits, errorGuard.completeHealing, urlEditing, transitionPreviewMachine, getActivePreviewIframe, getPreviewContentWindow]);

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

    const hasExplicit = Array.isArray(nextFiles) && nextFiles.length > 0;
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
      setRefreshKey((k) => k + 1);
      clearPreviewLogs();
      setVebSelected(null);
      errorGuard.clearErrors();
      previewBuildShaRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      transitionPreviewMachine("loading", "refresh remount");
      return;
    }

    const relevantFiles = previewRelevantFiles(nextFiles!);
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

    // Lovable parity: warm runtimes sync in place — never cold-boot npm on every AI edit.
    const engine = previewEngineRef.current;
    if (engine === "sandbox" && sandboxIdLiveRef.current) {
      clearPreviewLogs();
      setVebSelected(null);
      errorGuard.clearErrors();
      transitionPreviewMachine("loading", "sandbox file sync");
      return;
    }
    if (engine === "webcontainer") {
      clearPreviewLogs();
      setVebSelected(null);
      errorGuard.clearErrors();
      transitionPreviewMachine("loading", "webcontainer file sync");
      return;
    }

    setRefreshKey((k) => k + 1);
    clearPreviewLogs();
    setVebSelected(null);
    errorGuard.clearErrors();
    previewBuildShaRef.current = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    transitionPreviewMachine("loading", "refresh requested");
  }, [errorGuard.clearErrors, transitionPreviewMachine]);

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
        if (previewEngine !== "sandbox") {
          getPreviewContentWindow()?.postMessage({ type: "lifemark-preview-navigate", pathname: target }, "*");
        }
        setPreviewPath(target);
        setUrlInput(target);
        setUrlEditing(false);
        return { ...prev, idx };
      });
    }
    window.addEventListener("lifemark-preview-history", onHistoryNav);
    return () => window.removeEventListener("lifemark-preview-history", onHistoryNav);
  }, [previewEngine, getPreviewContentWindow]);

  // Sandbox live sync — push debounced file changes into the running E2B VM.
  useEffect(() => {
    if (previewEngine !== "sandbox" || !sandboxId || previewFiles.length === 0) return;
    const payload = previewFiles.map((f) => ({ path: f.path, content: f.content ?? "" }));
    const timer = window.setTimeout(() => {
      void syncSandboxFiles(payload);
    }, 800);
    return () => window.clearTimeout(timer);
  }, [previewEngine, sandboxId, previewFiles, syncSandboxFiles]);

  const captureForAnnotation = useCallback(() => {
    const msgId = `ann-${Date.now()}`;
    const handleReady = (e: Event) => {
      const detail = (e as CustomEvent).detail as { messageId: string; dataUrl: string | null };
      if (detail.messageId !== msgId) return;
      window.removeEventListener("lifemark-screenshot-ready", handleReady);
      if (detail.dataUrl) setAnnotateScreenshot(detail.dataUrl);
    };
    window.addEventListener("lifemark-screenshot-ready", handleReady);
    window.dispatchEvent(new CustomEvent("lifemark-request-screenshot", { detail: { messageId: msgId } }));
    // Cleanup listener after 5s in case iframe never responds
    setTimeout(() => window.removeEventListener("lifemark-screenshot-ready", handleReady), 5000);
  }, []);

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
      if (engine === "fallback" || engine === "detecting") {
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
      if (engine === "fallback" || engine === "detecting") {
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

  const template = useMemo(() => detectTemplate(files), [files]);
  const sandpackFiles = useMemo(() => {
    const base = toSandpackFiles(files);
    return visualEditEnabled ? addVebBridge(base) : base;
  }, [files, visualEditEnabled]);
  const fallbackHtml = useMemo(
    // Always build srcdoc HTML. Gating on `previewEngine === "fallback"` left
    // srcDoc="" (white blank) when the engine was briefly sandbox/webcontainer
    // without a live URL — the catch-all iframe branch still mounts.
    () => buildFallbackHtml(previewFiles.length > 0 ? previewFiles : previewRelevantFiles(files)),
    [previewFiles, files],
  );
  // ── esbuild preview engine (flagged) ────────────────────────────────────────
  // When NEXT_PUBLIC_PREVIEW_ESBUILD is on, compile the fallback preview with the
  // real esbuild-wasm bundler instead of the regex transpiler. It's async, so it
  // lands in state; until it's ready (or if it errors) we keep showing the regex
  // result — so this is never worse than today. See lib/preview/esbuild-engine.ts.
  const [esbuildHtml, setEsbuildHtml] = useState("");
  const [esbuildBuilding, setEsbuildBuilding] = useState(false);
  useEffect(() => {
    const on = isEsbuildPreviewEnabled();
    if (!on || previewEngine !== "fallback" || previewFiles.length === 0) {
      setEsbuildHtml("");
      setEsbuildBuilding(false);
      return;
    }
    let cancelled = false;
    setEsbuildHtml("");
    setEsbuildBuilding(true);
    transitionPreviewMachine("building", "esbuild preview compiling");
    void buildEsbuildHtml(previewFiles)
      .then((res) => {
        if (cancelled) return;
        if (res.html) {
          setEsbuildHtml(res.html);
          setEsbuildBuilding(false);
          transitionPreviewMachine("loading", "esbuild preview compiled");
        } else {
          console.warn("[preview/esbuild] build failed; using fallback engine:", res.errors);
          setConsoleLines((prev) => [
            ...prev.slice(-99),
            {
              type: "warn",
              text: `esbuild preview fell back: ${res.errors.slice(0, 2).join("; ")}`,
            },
          ]);
          setEsbuildHtml("");
          setEsbuildBuilding(false);
          transitionPreviewMachine("fallback", "esbuild preview fell back");
        }
      })
      .catch((e) => {
        if (!cancelled) {
          console.warn("[preview/esbuild] error; using fallback engine:", e);
          setConsoleLines((prev) => [
            ...prev.slice(-99),
            {
              type: "warn",
              text: `esbuild preview fell back: ${e instanceof Error ? e.message : String(e)}`,
            },
          ]);
          setEsbuildHtml("");
          setEsbuildBuilding(false);
          transitionPreviewMachine("fallback", "esbuild preview error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [previewFiles, previewEngine, transitionPreviewMachine]);
  /** Rendered HTML: the esbuild bundle when ready, else the regex-engine result. */
  // Never feed the iframe an empty string — that paints a white blank pane.
  const effectivePreviewHtml = esbuildHtml || fallbackHtml || EMPTY_PREVIEW_HTML;
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
      const frames = Array.from(sandpackContainerRef.current?.querySelectorAll("iframe") ?? []);
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

      // SLOW IS NOT BROKEN. A cold WebContainer has to boot AND `npm install`
      // before it can paint — WebContainerPreview itself budgets 18s/75s/35s for
      // boot/install/start. This watchdog fires after 12s, so for any project that
      // needs a real install it ALWAYS wins the race while the container is still
      // happily installing. It used to call markWcUnavailable(), which poisons
      // sessionStorage and pins the user to the srcdoc engine for the whole
      // session — on a machine where WebContainer works perfectly.
      //
      // So: show the fast preview immediately (good UX), but DEMOTE the container
      // to background warming rather than killing it. Its onReady swaps it back in
      // when the dev server is actually up. Only a genuine failure (the child's
      // onError, raised after ITS phase budgets expire) may mark WC unavailable.
      setVitePreviewRequested(false); // keep the resolver on fallback (no flip-flop)
      setBackgroundViteActive(true);  // …but keep the container alive and installing
      setConsoleLines((prev) => [
        ...prev.slice(-99),
        {
          type: "warn",
          text: "Vite runtime is still warming up; showing the standard preview and switching over when it's ready.",
        },
      ]);
      setPreviewEngine("fallback");
      transitionPreviewMachine("fallback", "vite still warming — demoted to background");
    }, 12_000);
    return () => window.clearTimeout(timer);
  }, [previewEngine, refreshKey, filesSignature, toast, transitionPreviewMachine, hideTopChrome]);

  // Backstop for background warming. This must OUTLAST the container's own phase
  // budgets (boot 18s + install 75s + start 35s ≈ 128s) — at the old 12s it killed
  // the warm-up long before `npm install` could possibly finish, which is why the
  // background Vite path never once succeeded. It also no longer marks WC
  // unavailable: a real failure arrives via the child's onError, and "still slow"
  // is not evidence that WebContainer is broken.
  useEffect(() => {
    if (!backgroundViteActive || previewEngine !== "fallback") return;
    const timer = window.setTimeout(() => {
      setVitePreviewRequested(false);
      setBackgroundViteActive(false);
      transitionPreviewMachine("fallback", "background vite preview timed out");
      setConsoleLines((prev) => [
        ...prev.slice(-99),
        {
          type: "warn",
          text: "Vite preview did not become ready in the background; standard preview stayed visible.",
        },
      ]);
    }, WC_WARM_BUDGET_MS);
    return () => window.clearTimeout(timer);
  }, [backgroundViteActive, previewEngine, backgroundViteKey, transitionPreviewMachine]);

  useEffect(() => {
    unifiedIframeRef.current =
      previewEngine === "webcontainer"
        ? sandpackContainerRef.current?.querySelector("iframe") ?? null
        : iframeRef.current;
  }, [previewEngine, refreshKey, filesSignature]);

  useEffect(() => {
    setPreviewCompileFailed(false);
    setPreviewCompileOk(false);
  }, [previewFiles, fallbackHtml]);

  // At 0 credits: probe local preview first; fall back to deployment only if compile fails
  const showDeployedPreview =
    outOfCredits && !!deployedUrl && previewCompileFailed && !previewCompileOk;
  const iframeVisible = !outOfCredits || previewCompileOk;
  const showPausedOverlay = outOfCredits && !previewCompileOk && !showDeployedPreview;
  const showEsbuildBadge =
    !hideTopChrome &&
    isEsbuildPreviewEnabled() &&
    previewEngine === "fallback" &&
    !showDeployedPreview &&
    (esbuildBuilding || !!esbuildHtml);
  const previewStatusText =
    hideTopChrome
      ? (previewMachineState === "building" || previewMachineState === "loading" || sandboxLoading
          ? "Loading preview"
          : null)
      : previewMachineState === "building"
        ? "Preparing preview"
        : previewMachineState === "loading"
          ? "Loading update"
          : previewMachineState === "fallback"
            ? "Standard preview active"
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
    } catch {
      toast({ title: "Could not save comment", variant: "destructive" });
    } finally {
      setCommentSaving(false);
    }
  }

  // Inject element-pick script when comment pin mode is active (srcDoc iframe)
  useEffect(() => {
    if (!commentPinMode || !fallbackHtml) return;
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
  }, [commentPinMode, fallbackHtml, refreshKey]);

  // New iframe srcDoc — drop stale errors until the fresh preview reports status.
  // Keyed on the RENDERED html string, not fallbackHtml.length: two different
  // builds of identical length (or an esbuild swap) kept a stale error banner up.
  useEffect(() => {
    setActiveError(null);
    setErrorDismissed(false);
  }, [effectivePreviewHtml, refreshKey]);

  const hasFiles = files.length > 0;
  const useFallback = previewEngine === "fallback";
  const viteCapable = useWebContainers && shouldUseWebContainer(files);

  const retryVitePreview = useCallback(() => {
    clearWcBlock();
    if (!viteCapable) {
      toast({
        title: "Standard preview",
        description: "This project does not use a Vite/package.json layout.",
      });
      return;
    }
    if (typeof window !== "undefined" && !window.crossOriginIsolated) {
      toast({
        title: "Reloading for Vite preview",
        description: "A full page load is required for the in-browser Vite runtime.",
      });
      window.location.reload();
      return;
    }
    setBackgroundViteActive(true);
    setBackgroundViteKey((k) => k + 1);
    clearPreviewLogs();
  }, [toast, viteCapable]);

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
      const iframe = sandpackContainerRef.current?.querySelector("iframe");
      if (iframe?.contentWindow) {
        try {
          iframe.contentWindow.location.reload();
          clearPreviewLogs();
          setVebSelected(null);
          return;
        } catch {
          /* cross-origin — fall through to remount */
        }
      }
    }
    refreshPreview(files);
  }

  function openInNewTab() {
    if (deployedUrl) {
      window.open(deployedUrl, "_blank", "noopener,noreferrer");
    } else if (projectId) {
      window.open(`/preview/${projectId}`, "_blank", "noopener,noreferrer");
    } else if (useFallback && fallbackHtml) {
      const blob = new Blob([fallbackHtml], { type: "text/html" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      // Blob URLs are never GC'd while this document lives — each click leaked
      // the full preview HTML. Revoke once the new tab has had time to load.
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
    }
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
  }, [deployedUrl, projectId, useFallback, fallbackHtml]);

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
    if (device === "mobile" && showFrame) return <PhoneFrame>{children}</PhoneFrame>;
    if (device === "tablet" && showFrame) return <TabletFrame>{children}</TabletFrame>;
    // Desktop: flat, chrome-free preview (Lovable-minimal). Device + URL controls
    // already live in the slim toolbar above — no macOS window skeuomorphism.
    if (device === "desktop") return <div className="w-full h-full overflow-hidden bg-white">{children}</div>;
    // no-frame mobile/tablet
    return (
      <div className="flex items-start justify-center w-full h-full bg-muted/20 overflow-auto p-4">
        <div className="mx-auto rounded-xl overflow-hidden shadow-2xl bg-white" style={deviceStyle}>
          {children}
        </div>
      </div>
    );
  }

  return (
    <TooltipProvider delayDuration={200}>
      <div className={`relative flex flex-col bg-background ${previewFullscreen ? "fixed inset-0 z-[100] h-screen" : "h-full"} ${!previewFullscreen ? "rounded-[var(--radius-4)] shadow-surface-xl overflow-hidden m-1" : ""}`}>
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
                    ? sandpackContainerRef.current?.querySelector("iframe")?.contentWindow
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
                    ? sandpackContainerRef.current?.querySelector("iframe")?.contentWindow
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
                          ? sandpackContainerRef.current?.querySelector("iframe")?.contentWindow
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
                    : previewMachineState === "fallback"
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
            {previewEngine === "fallback" && !showDeployedPreview && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-500/20 text-slate-400 border border-slate-500/30 mr-1">
                Standard
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

            {previewEngine === "fallback" && viteCapable && !showDeployedPreview && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={retryVitePreview}
                    className="p-1.5 rounded-md text-violet-400/80 hover:text-violet-300 hover:bg-violet-500/10 transition-all"
                  >
                    <Wand2 className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>Switch to Vite preview (real dev server)</TooltipContent>
              </Tooltip>
            )}

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
          <div className="flex-1 flex items-center justify-center bg-[#0a0a0a] text-muted-foreground">
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
          <div className="flex-1 flex items-center justify-center bg-[#0a0a0a]">
            <div className="text-center">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground/40">Loading preview…</p>
            </div>
          </div>
        ) : previewEngine === "sandbox" && !sandboxUrl ? (
          <div className="flex-1 flex items-center justify-center bg-[#0a0a0a]">
            <div className="text-center">
              <Loader2 className="w-6 h-6 animate-spin text-muted-foreground/50 mx-auto mb-2" />
              <p className="text-xs text-muted-foreground/40">Loading preview…</p>
            </div>
          </div>
        ) : previewEngine === "sandbox" && sandboxUrl ? (
          /* Real sandbox (Modal/E2B) — live dev server running server-side */
          <div className={`flex flex-col flex-1 overflow-hidden relative${errorGuard.freezePreview ? " pointer-events-none" : ""}`}>
            {withDeviceFrame(
              <iframe
                key={`sandbox-${sandboxId ?? projectId ?? "warm"}`}
                ref={sandboxIframeRef}
                src={sandboxUrlWithPath(sandboxUrl, previewPath)}
                className="w-full h-full border-0"
                title="Live sandbox preview"
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                onLoad={() => transitionPreviewMachine("ready", "sandbox iframe loaded")}
              />
            )}
            {visualEditEnabled && vebSelected && (
              <VebBridgePopover
                selection={vebSelected}
                files={files}
                onFileChange={handleVebFileChange}
                onLiveApply={(payload) => {
                  sandboxIframeRef.current?.contentWindow?.postMessage(
                    { type: "lifemark-veb-apply", ...payload },
                    "*",
                  );
                }}
                onRequestAiEdit={onSendPromptToChat}
                onClose={() => {
                  setVebSelected(null);
                  sandboxIframeRef.current?.contentWindow?.postMessage({ type: "lifemark-veb-clear" }, "*");
                }}
                onSelectionChange={setVebSelected}
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
        ) : previewEngine === "webcontainer" ? (
          <div
            className={`flex flex-col flex-1 overflow-hidden relative${errorGuard.freezePreview ? " pointer-events-none" : ""}`}
            ref={sandpackContainerRef}
          >
            {withDeviceFrame(
              <WebContainerPreview
                key={`wc-${projectId ?? "preview"}`}
                files={previewFiles}
                projectId={projectId}
                embedded
                onReady={() => {
                  transitionPreviewMachine("ready", "webcontainer dev server ready");
                }}
                onError={(msg) => {
                  transitionPreviewMachine("fallback", "webcontainer preview error");
                  if (typeof window !== "undefined") {
                    markWcUnavailable();
                  }
                  setVitePreviewRequested(false);
                  queueMicrotask(() => {
                    toast({
                      title: "WebContainer preview unavailable",
                      description: msg,
                      variant: "destructive",
                    });
                    setPreviewEngine("fallback");
                  });
                }}
              />
            )}

            {/* Visual edits — cross-origin engine, driven via postMessage bridge */}
            {visualEditEnabled && vebSelected && (
              <VebBridgePopover
                selection={vebSelected}
                files={files}
                onFileChange={handleVebFileChange}
                onLiveApply={(payload) => {
                  const iframe = sandpackContainerRef.current?.querySelector("iframe");
                  iframe?.contentWindow?.postMessage({ type: "lifemark-veb-apply", ...payload }, "*");
                }}
                onRequestAiEdit={onSendPromptToChat}
                onClose={() => {
                  setVebSelected(null);
                  const iframe = sandpackContainerRef.current?.querySelector("iframe");
                  iframe?.contentWindow?.postMessage({ type: "lifemark-veb-clear" }, "*");
                }}
                onSelectionChange={setVebSelected}
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
        ) : (
          /* Fallback: Babel + CDN iframe — still renders at 0 credits (errors suppressed below) */
          <div
            ref={previewContainerRef}
            className={`flex flex-col flex-1 overflow-hidden relative${errorGuard.freezePreview ? " pointer-events-none" : ""}`}
          >
            <div className="flex-1 overflow-hidden flex flex-col bg-background">
              {withDeviceFrame(
                showDeployedPreview ? (
                  <iframe
                    key={`deployed-${refreshKey}`}
                    src={deployedUrl}
                    className="w-full h-full border-0"
                    title="Live deployment"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    onLoad={() => transitionPreviewMachine("ready", "deployment iframe loaded")}
                  />
                ) : (
                  <div className="relative w-full h-full">
                    {showPausedOverlay && <OutOfCreditsPreviewPaused />}
                    <iframe
                      key={`${refreshKey}-${filesSignature}-${PREVIEW_ENGINE_REV}`}
                      ref={iframeRef}
                      srcDoc={effectivePreviewHtml}
                      className={
                        iframeVisible
                          ? "w-full h-full border-0"
                          : "absolute w-px h-px opacity-0 pointer-events-none border-0"
                      }
                      title="App Preview"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                      onLoad={() => transitionPreviewMachine("ready", "standard preview iframe loaded")}
                    />
                  </div>
                )
              )}
            </div>

            {/* VisualEditOverlay — works because srcDoc iframe is same-origin */}
            {backgroundViteActive && viteCapable && !showDeployedPreview && (
              <div className="hidden" aria-hidden="true">
                <WebContainerPreview
                  key={`background-vite-${backgroundViteKey}`}
                  files={previewFiles}
                  projectId={projectId}
                  embedded
                  onReady={() => {
                    setBackgroundViteActive(false);
                    setVitePreviewRequested(true);
                    setPreviewEngine("webcontainer");
                    setRefreshKey((k) => k + 1);
                    clearPreviewLogs();
                  }}
                  onError={(msg) => {
                    if (typeof window !== "undefined") {
                      markWcUnavailable();
                    }
                    setVitePreviewRequested(false);
                    setBackgroundViteActive(false);
                    setConsoleLines((prev) => [
                      ...prev.slice(-99),
                      { type: "warn", text: `Vite preview stayed in the background: ${msg}` },
                    ]);
                  }}
                />
              </div>
            )}

            <VisualEditOverlay
              iframeRef={iframeRef}
              files={files}
              onFileChange={handleVebFileChange}
              enabled={visualEditEnabled}
              onRequestAiEdit={onSendPromptToChat}
            />

            {/* Preview Annotations overlay */}
            {projectId && (
              <PreviewAnnotations
                projectId={projectId}
                enabled={annotationsEnabled}
                onSendToChat={onSendPromptToChat}
              />
            )}

            {showConsole && (
              <div className="h-40 border-t border-border bg-muted/30 flex flex-col">
                <div className="flex items-center gap-1 px-2 py-1 border-b border-border/60 shrink-0">
                  {(["console", "network"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setPreviewBottomTab(tab)}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium transition-colors ${
                        previewBottomTab === tab
                          ? "bg-muted text-foreground"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab === "console" ? "Console" : "Network"}
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
                              : "text-emerald-400"
                          }
                        >
                          {line.text}
                        </div>
                      ))
                    )
                  ) : networkLines.length === 0 ? (
                    <p className="text-muted-foreground">No network requests yet…</p>
                  ) : (
                    networkLines.map((line, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px] leading-snug">
                        <span className="shrink-0 font-semibold text-violet-400 w-10">{line.method}</span>
                        <span
                          className={
                            line.ok === false || (line.status != null && line.status >= 400)
                              ? "text-red-400"
                              : "text-emerald-400"
                          }
                        >
                          {line.status ?? "—"}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-muted-foreground" title={line.url}>
                          {line.url}
                        </span>
                        {line.durationMs != null && (
                          <span className="shrink-0 text-muted-foreground/70">{line.durationMs}ms</span>
                        )}
                        {line.error && (
                          <span className="shrink-0 text-red-400 truncate max-w-[120px]" title={line.error}>
                            {line.error}
                          </span>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
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
                  <span className="text-[12px] text-violet-200 font-medium">
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
              className="absolute top-12 left-1/2 -translate-x-1/2 z-40 w-[min(420px,92%)] rounded-xl border border-red-500/30 bg-background/95 shadow-2xl backdrop-blur px-3 py-2.5"
            >
              <div className="flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 text-red-400 shrink-0" />
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-semibold text-foreground">Preview paused after a runtime error</div>
                  <div className="mt-0.5 text-[11px] text-muted-foreground truncate">
                    {activeError ?? errorGuard.report?.errors[0]?.message ?? "The last update could not render cleanly."}
                  </div>
                  {previewDiagnosis && (
                    <div className="mt-1 text-[10px] text-muted-foreground/80 line-clamp-2">
                      {previewDiagnosis.replace(/\n+/g, " ").slice(0, 180)}
                    </div>
                  )}
                </div>
              </div>
              <div className="mt-2 flex flex-wrap justify-end gap-1.5">
                <button
                  onClick={() => setShowConsole((value) => !value)}
                  className="px-2 py-1 rounded-md border border-border/70 bg-muted/40 hover:bg-muted text-[11px] text-muted-foreground"
                >
                  Logs
                </button>
                <button
                  onClick={() => refreshPreview(files)}
                  className="px-2 py-1 rounded-md border border-border/70 bg-muted/40 hover:bg-muted text-[11px] text-muted-foreground"
                >
                  Refresh
                </button>
                {onFixWithAI && (
                  <button
                    onClick={() => {
                      handleFixWithAI(activeError ?? errorGuard.report?.formatted ?? "Preview runtime error");
                      setErrorDismissed(true);
                    }}
                    className="px-2 py-1 rounded-md border border-red-500/30 bg-red-500/15 hover:bg-red-500/25 text-[11px] text-red-200"
                  >
                    Fix with AI
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
              setVisualEdit(!visualEdit);
              onVisualEditToggle?.();
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
          />
        )}

        {showDeployedPreview && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/15 border border-violet-500/25 text-[10px] text-violet-300">
            <Globe className="w-3 h-3" />
            Live deployment
          </div>
        )}

        {showEsbuildBadge && (
          <div className="absolute top-2 right-2 z-20 flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[10px] text-emerald-300">
            {esbuildBuilding ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
            {esbuildBuilding ? "Bundling" : "esbuild preview"}
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
              className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex items-center gap-2 max-w-[90%] bg-red-950/95 backdrop-blur-sm border border-red-500/40 text-red-200 text-xs px-3 py-2 rounded-xl shadow-2xl"
            >
              <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />
              <span className="flex-1 truncate min-w-0 font-mono opacity-80">
                {activeError.length > 80 ? activeError.slice(0, 80) + "…" : activeError}
              </span>
              {onFixWithAI && (
                <button
                  onClick={() => { handleFixWithAI(activeError); setErrorDismissed(true); }}
                  className="flex items-center gap-1 shrink-0 bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 text-red-200 px-2 py-1 rounded-lg transition-colors"
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
            <Button size="sm" disabled={commentSaving || !commentDraft.trim()} onClick={() => void submitElementComment()}>
              {commentSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : "Post comment"}
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
                          ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
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
                          ? "bg-violet-500/20 border-violet-500/40 text-violet-300"
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
