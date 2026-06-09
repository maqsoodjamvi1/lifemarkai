"use client";

import { useState, useMemo, useCallback, useEffect, useRef } from "react";
import {
  RefreshCw, Smartphone, Tablet, Monitor,
  ExternalLink, MousePointer, Terminal, Loader2,
  Check, X, Wand2, AlignLeft, AlignCenter, AlignRight,
  AlertTriangle, Wrench, Frame, MessageSquarePlus, Pencil, Pin, Globe,
} from "lucide-react";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { AnimatePresence, motion } from "framer-motion";
import { VisualEditOverlay } from "./visual-edit-overlay";
import { PreviewAnnotations } from "./preview-annotations";
import { PreviewAnnotateModal } from "./preview-annotate-modal";
import { LifemarkBadge } from "@/components/shared/lifemark-badge";
import type { ProjectFile } from "@/types/database";
import dynamic from "next/dynamic";
import { buildFallbackHtml, PREVIEW_ENGINE_REV } from "@/lib/preview/build-fallback-html";
import { filesContentSignature } from "@/lib/preview/files-signature";
import { resolvePreviewEngine, WC_UNAVAILABLE_KEY, type PreviewEngine } from "@/lib/preview/resolve-preview-engine";
import Link from "next/link";

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

function BrowserFrame({ children, url }: { children: React.ReactNode; url: string }) {
  return (
    <div className="flex flex-col h-full">
      {/* Browser chrome — Lovable style */}
      <div className="flex items-center gap-2 px-3 h-9 bg-muted/40 border-b border-border shrink-0">
        {/* Traffic lights */}
        <div className="flex items-center gap-1.5 shrink-0">
          <div className="w-3 h-3 rounded-full bg-[#ff5f57] border border-[#e0443e]/60" />
          <div className="w-3 h-3 rounded-full bg-[#febc2e] border border-[#d4a017]/60" />
          <div className="w-3 h-3 rounded-full bg-[#28c840] border border-[#1aab29]/60" />
        </div>
        {/* Nav arrows */}
        <div className="flex items-center gap-0.5 shrink-0">
          <button className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors" title="Back">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M7.5 2L3.5 6L7.5 10"/></svg>
          </button>
          <button className="p-1 rounded text-muted-foreground hover:text-foreground transition-colors" title="Forward">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4.5 2L8.5 6L4.5 10"/></svg>
          </button>
        </div>
        {/* URL bar */}
        <div className="flex-1 flex items-center gap-1.5 bg-background border border-border rounded-md px-2.5 py-1 mx-1">
          <div className="w-2 h-2 rounded-full bg-emerald-500/50 shrink-0" />
          <span className="text-[11px] text-muted-foreground font-mono truncate flex-1 text-center">{url}</span>
        </div>
      </div>
      <div className="flex-1 overflow-hidden">{children}</div>
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
  onFixWithAI,
  useWebContainers,

  isGenerating = false,
  generatingFileCount = 0,
  deployedUrl,
  badgeHidden = false,
  onSendAnnotatedToChat,
  credits,
}: PreviewPanelProps) {
  const outOfCredits = credits !== undefined && credits <= 0;
  const [device, setDevice] = useState<DeviceSize>("desktop");
  const [showFrame, setShowFrame] = useState(true);
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
  const [showConsole, setShowConsole] = useState(false);
  const [annotateScreenshot, setAnnotateScreenshot] = useState<string | null>(null);
  const [commentPinMode, setCommentPinMode] = useState(false);
  const [pendingComment, setPendingComment] = useState<VebElement | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const [commentSaving, setCommentSaving] = useState(false);
  const { toast } = useToast();
  const [previewEngine, setPreviewEngine] = useState<PreviewEngine>(() => {
    if (typeof window === "undefined") return "detecting";
    if (sessionStorage.getItem(WC_UNAVAILABLE_KEY) === "1") return "fallback";
    return "detecting";
  });
  const [consoleLines, setConsoleLines] = useState<{ type: string; text: string }[]>([]);
  const [vebSelected, setVebSelected] = useState<VebElement | null>(null);
  const [activeError, setActiveError] = useState<string | null>(null);
  const [errorDismissed, setErrorDismissed] = useState(false);
  const [previewCompileFailed, setPreviewCompileFailed] = useState(false);
  const [previewCompileOk, setPreviewCompileOk] = useState(false);
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const sandpackContainerRef = useRef<HTMLDivElement>(null);
  const previewContainerRef = useRef<HTMLDivElement>(null);
  const [annotationsEnabled, setAnnotationsEnabled] = useState(false);

  useEffect(() => {
    if (isVisualEditActive !== undefined) setVisualEdit(isVisualEditActive);
  }, [isVisualEditActive]);

  useEffect(() => {
    if (!visualEdit) setVebSelected(null);
  }, [visualEdit]);

  // Pick WebContainers (Lovable-style Vite runtime) or srcdoc fallback.
  useEffect(() => {
    if (files.length === 0) {
      setPreviewEngine("detecting");
      return;
    }

    const wcBlocked =
      typeof window !== "undefined" &&
      sessionStorage.getItem(WC_UNAVAILABLE_KEY) === "1";

    if (wcBlocked) {
      setPreviewEngine("fallback");
      return;
    }

    const isolated = typeof window !== "undefined" ? window.crossOriginIsolated : false;
    const engine = resolvePreviewEngine(files, {
      preferWebContainers: useWebContainers,
      crossOriginIsolated: isolated,
    });
    setPreviewEngine(engine);
  }, [files, useWebContainers, projectId]);

  useEffect(() => {
    function handler(e: MessageEvent) {
      if (e.data?.source === "lifemark-veb" && visualEdit) {
        const data = e.data as VebElement & { source: string };
        // Get the sandpack iframe's position to offset the rect
        const iframe = sandpackContainerRef.current?.querySelector("iframe");
        const iframeRect = iframe?.getBoundingClientRect();
        setVebSelected({
          tagName: data.tagName,
          textContent: data.textContent,
          classList: data.classList,
          xpath: data.xpath,
          rect: {
            top: data.rect.top + (iframeRect?.top ?? 0),
            left: data.rect.left + (iframeRect?.left ?? 0),
            width: data.rect.width,
            height: data.rect.height,
          },
        });
      }
      if (e.data?.source === "lifemark-comment-pin" && commentPinMode) {
        const data = e.data as VebElement & { source: string };
        setPendingComment(data);
        setCommentDraft("");
      }
      if (e.data?.source === "lifemark-preview") {
        const { type, text } = e.data as { source: string; type: string; text: string };
        setConsoleLines((prev) => [...prev.slice(-99), { type, text }]);
        if (type === "success") {
          setActiveError(null);
          setPreviewCompileFailed(false);
          setPreviewCompileOk(true);
          setErrorDismissed(false);
        } else if (type === "error") {
          if (outOfCredits) {
            setPreviewCompileFailed(true);
            setPreviewCompileOk(false);
            return;
          }
          if (onError) onError(text);
          setActiveError(text);
          setErrorDismissed(false);
        }
      }
      if (e.data?.type === "lifemark-screenshot") {
        const { messageId, dataUrl } = e.data as { type: string; messageId: string; dataUrl: string | null };
        if (messageId && dataUrl) {
          window.dispatchEvent(new CustomEvent("lifemark-screenshot-ready", { detail: { messageId, dataUrl } }));
        }
      }
      // URL sync — the iframe boot script reports its current path on initial
      // mount and on every history change so the address bar stays in sync
      // with react-router navigations inside the running app.
      if (e.data?.type === "lifemark-preview-location") {
        const { pathname } = e.data as { type: string; pathname: string };
        if (typeof pathname === "string" && pathname.length > 0) {
          setPreviewPath(pathname);
          // Don't clobber whatever the user is typing into the address bar.
          if (!urlEditing) setUrlInput(pathname);
        }
      }
    }
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, [onError, visualEdit, commentPinMode, outOfCredits]);

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
      iframeRef.current?.contentWindow?.postMessage({ type: "lifemark-capture", messageId }, "*");
    }
    window.addEventListener("lifemark-request-screenshot", handleCaptureRequest);
    return () => window.removeEventListener("lifemark-request-screenshot", handleCaptureRequest);
  }, []);

  useEffect(() => {
    function handleRefresh() {
      setRefreshKey((k) => k + 1);
      setConsoleLines([]);
      setVebSelected(null);
    }
    window.addEventListener("lifemark-refresh-preview", handleRefresh);
    return () => window.removeEventListener("lifemark-refresh-preview", handleRefresh);
  }, []);

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

  const template = useMemo(() => detectTemplate(files), [files]);
  const sandpackFiles = useMemo(() => {
    const base = toSandpackFiles(files);
    return visualEdit ? addVebBridge(base) : base;
  }, [files, visualEdit]);
  const fallbackHtml = useMemo(
    () => (previewEngine === "fallback" ? buildFallbackHtml(files) : ""),
    [files, previewEngine]
  );
  const filesSignature = useMemo(() => filesContentSignature(files), [files]);

  useEffect(() => {
    setPreviewCompileFailed(false);
    setPreviewCompileOk(false);
  }, [files, fallbackHtml]);

  // At 0 credits: probe local preview first; fall back to deployment only if compile fails
  const showDeployedPreview =
    outOfCredits && !!deployedUrl && previewCompileFailed && !previewCompileOk;
  const iframeVisible = !outOfCredits || previewCompileOk;
  const showPausedOverlay = outOfCredits && !previewCompileOk && !showDeployedPreview;

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
  useEffect(() => {
    setActiveError(null);
    setErrorDismissed(false);
  }, [fallbackHtml.length, refreshKey]);

  const hasFiles = files.length > 0;
  const useFallback = previewEngine === "fallback";

  function refresh() {
    setRefreshKey((k) => k + 1);
    setConsoleLines([]);
    setVebSelected(null);
  }

  function openInNewTab() {
    if (deployedUrl) {
      window.open(deployedUrl, "_blank", "noopener,noreferrer");
    } else if (projectId) {
      window.open(`/preview/${projectId}`, "_blank", "noopener,noreferrer");
    } else if (useFallback && fallbackHtml) {
      const blob = new Blob([fallbackHtml], { type: "text/html" });
      window.open(URL.createObjectURL(blob), "_blank", "noopener,noreferrer");
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
    const previewUrl = previewEngine === "webcontainer"
      ? `webcontainer://project/${projectId ?? "local"}`
      : `preview://project/${projectId ?? "local"}`;

    if (device === "mobile" && showFrame) return <PhoneFrame>{children}</PhoneFrame>;
    if (device === "tablet" && showFrame) return <TabletFrame>{children}</TabletFrame>;
    if (device === "desktop") return <BrowserFrame url={previewUrl}>{children}</BrowserFrame>;
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
      <div className="relative flex flex-col h-full bg-background">
        {/* Toolbar — Lovable style */}
        <div className="flex items-center gap-1.5 px-2.5 h-9 border-b border-border bg-background shrink-0">
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
                    onClick={() => setDevice(d)}
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
                  value={urlEditing ? urlInput : previewPath}
                  onChange={(e) => { setUrlInput(e.target.value); setUrlEditing(true); }}
                  onFocus={() => { setUrlInput(previewPath); setUrlEditing(true); }}
                  onBlur={() => setUrlEditing(false)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const target = urlInput.startsWith("/") ? urlInput : `/${urlInput}`;
                      // Tell the iframe to navigate. The iframe's URL-sync
                      // script (injected into fallbackHtml) listens for this
                      // and calls history.pushState + dispatches popstate so
                      // react-router picks it up.
                      iframeRef.current?.contentWindow?.postMessage(
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
            {previewEngine === "webcontainer" && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-500/20 text-violet-400 border border-violet-500/30 mr-1">
                Vite
              </span>
            )}

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => { setVisualEdit(!visualEdit); onVisualEditToggle?.(); }}
                  className={`p-1.5 rounded-md transition-all ${
                    visualEdit
                      ? "bg-violet-500/20 text-violet-400 border border-violet-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                >
                  <MousePointer className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Visual Edit {visualEdit ? "(on)" : "(off)"}</TooltipContent>
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
              <TooltipContent>Console</TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => setShowFrame((v) => !v)}
                  className={`p-1.5 rounded-md transition-all ${
                    showFrame && device !== "desktop"
                      ? "bg-indigo-500/20 text-indigo-400 border border-indigo-500/30"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  }`}
                  disabled={device === "desktop"}
                >
                  <Frame className="w-3.5 h-3.5" />
                </button>
              </TooltipTrigger>
              <TooltipContent>Toggle device frame</TooltipContent>
            </Tooltip>

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
        ) : previewEngine === "webcontainer" ? (
          <div className="flex flex-col flex-1 overflow-hidden relative" ref={sandpackContainerRef}>
            <WebContainerPreview
              key={refreshKey}
              files={files}
              embedded
              onError={() => {
                if (typeof window !== "undefined") {
                  sessionStorage.setItem(WC_UNAVAILABLE_KEY, "1");
                }
                setPreviewEngine("fallback");
              }}
            />
          </div>
        ) : (
          /* Fallback: Babel + CDN iframe — still renders at 0 credits (errors suppressed below) */
          <div ref={previewContainerRef} className="flex flex-col flex-1 overflow-hidden relative">
            <div className="flex-1 overflow-hidden flex flex-col bg-background">
              {withDeviceFrame(
                showDeployedPreview ? (
                  <iframe
                    key={`deployed-${refreshKey}`}
                    src={deployedUrl}
                    className="w-full h-full border-0"
                    title="Live deployment"
                    sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                  />
                ) : (
                  <div className="relative w-full h-full">
                    {showPausedOverlay && <OutOfCreditsPreviewPaused />}
                    <iframe
                      key={`${refreshKey}-${filesSignature}-${PREVIEW_ENGINE_REV}`}
                      ref={iframeRef}
                      srcDoc={fallbackHtml}
                      className={
                        iframeVisible
                          ? "w-full h-full border-0"
                          : "absolute w-px h-px opacity-0 pointer-events-none border-0"
                      }
                      title="App Preview"
                      sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
                    />
                  </div>
                )
              )}
            </div>

            {/* VisualEditOverlay — works because srcDoc iframe is same-origin */}
            <VisualEditOverlay
              iframeRef={iframeRef}
              files={files}
              onFileChange={handleVebFileChange}
              enabled={visualEdit}
            />

            {/* Preview Annotations overlay */}
            {projectId && (
              <PreviewAnnotations
                projectId={projectId}
                enabled={annotationsEnabled}
              />
            )}

            {showConsole && (
              <div className="h-40 border-t border-border bg-muted/30 overflow-y-auto p-2 font-mono text-xs space-y-0.5">
                {consoleLines.length === 0 ? (
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
                )}
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

        {showDeployedPreview && (
          <div className="absolute top-2 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 px-3 py-1 rounded-full bg-violet-500/15 border border-violet-500/25 text-[10px] text-violet-300">
            <Globe className="w-3 h-3" />
            Live deployment
          </div>
        )}

        {/* Fix-with-AI error banner */}
        <AnimatePresence>
          {activeError && !errorDismissed && !outOfCredits && (
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
                  onClick={() => { onFixWithAI(activeError); setErrorDismissed(true); }}
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
