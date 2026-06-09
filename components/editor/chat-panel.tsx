"use client";

import React, { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
// Use the ESM path (not dist/cjs) to avoid the "module factory is not
// available" error Turbopack emits on Next 16 when the cjs build's
// refractor/refractor-core chunk graph gets stale-cached by the service
// worker. The ESM Prism export bundles all languages and works with
// Turbopack out of the box.
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  Send, Loader2, Image, Sparkles,
  RotateCcw, Copy, Check, ChevronDown, AlertCircle,
  Wand2, XCircle, Undo2, ThumbsUp, ThumbsDown, Bookmark,
  CheckCheck, FileText, Pencil, Play, Pause, ChevronUp,
  GripVertical, RefreshCw, Brain, Trash2, Grid3X3, Search, FileCode, CornerDownLeft, Download,
  Paperclip, FileCode2, X, Pin, PinOff, Minimize2, Zap, ListChecks, Globe, Smartphone, Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { createClient } from "@/lib/supabase/client";
import { DiffViewer, computeFileDiff, type FileState } from "@/components/editor/diff-viewer";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { Project, ProjectFile, Message, Json } from "@/types/database";
import type { EditorMode } from "./editor-layout";
import { VoiceMode } from "./voice-mode";
import { SnippetPicker } from "./snippet-picker";
import { FileAttachmentList, type GeneratedFile } from "./file-attachment-card";
import { PreviewAnnotateModal } from "./preview-annotate-modal";
import { useKeyboardInset } from "@/hooks/use-keyboard-inset";
import { findMissingPackages, buildInstallCommand, syncPackageJsonDeps } from "@/lib/ai/npm-auto-install";
import { classifyBuildIntent, type BuildIntent } from "@/lib/ai/build-intent";
import { useEditorModelPrefs } from "@/store/app-store";
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
  DEFAULT_CODING_MODEL,
} from "@/lib/ai/editor-intelligence";
import { shouldRunPreviewVerify } from "@/lib/ai/preview-verify";
import type { SubagentStep } from "@/lib/ai/subagents";
import { SubagentActivityCard } from "./subagent-activity-card";
import { BuildActivityCard } from "./build-activity-card";
import {
  initialBuildActivitySteps,
  applyBuildIntentLabel,
  onBuildFileProgress,
  finalizeBuildActivity,
  type BuildActivityStep,
} from "@/lib/ai/build-activity";

/** Prose intro shown above Working/Edited cards during build streams. */
function extractStreamingProse(content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) return null;
  if (/^\s*[\[{]/.test(trimmed) && /"path"\s*:/.test(trimmed)) return null;
  const beforeFence = trimmed.split(/```/)[0].trim();
  if (beforeFence.length < 8) return null;
  return beforeFence.slice(0, 800);
}

type AIModel =
  | "gpt-4o"
  | "gpt-4o-mini"
  | "moonshotai/kimi-k2-instruct-0905"
  | "claude-opus-4-6"
  | "claude-sonnet-4-6"
  | "claude-haiku-4-5-20251001"
  | "gemini-2.0-flash"
  | "gemini-2.0-flash-lite"
  | "gemini-1.5-pro"
  | "meta-llama/llama-3.3-70b-instruct"
  | "meta-llama/llama-4-maverick"
  | "deepseek/deepseek-r1"
  | "deepseek/deepseek-chat-v3-0324"
  | "mistralai/mistral-large"
  | "mistralai/devstral-small"
  | "qwen/qwen3-235b-a22b"
  | "x-ai/grok-2-1212"
  | "google/gemma-3-27b-it";

const AI_MODELS: { id: AIModel; label: string; badge: string; fast?: boolean; new?: boolean; best?: boolean; creditMultiplier?: number }[] = [
  // ── OpenAI ───────────────────────────────────────────────────────────────
  { id: "gpt-4o", label: "GPT-4o", badge: "OpenAI" },
  { id: "gpt-4o-mini", label: "GPT-4o mini", badge: "OpenAI", fast: true },
  // ── Anthropic ────────────────────────────────────────────────────────────
  { id: "claude-opus-4-6", label: "Claude Opus 4", badge: "Anthropic", best: true, creditMultiplier: 2 },
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4", badge: "Anthropic" },
  { id: "claude-haiku-4-5-20251001", label: "Claude Haiku 4.5", badge: "Anthropic", fast: true },
  // ── Google ───────────────────────────────────────────────────────────────
  { id: "gemini-2.0-flash", label: "Gemini 2.0 Flash", badge: "Google", fast: true, new: true },
  { id: "gemini-2.0-flash-lite", label: "Gemini 2.0 Flash Lite", badge: "Google", fast: true },
  { id: "gemini-1.5-pro", label: "Gemini 1.5 Pro", badge: "Google" },
  // ── OpenRouter ───────────────────────────────────────────────────────────
  { id: "meta-llama/llama-4-maverick", label: "Llama 4 Maverick", badge: "OpenRouter", new: true },
  { id: "meta-llama/llama-3.3-70b-instruct", label: "Llama 3.3 70B", badge: "OpenRouter" },
  { id: "deepseek/deepseek-r1", label: "DeepSeek R1", badge: "OpenRouter", new: true },
  { id: "deepseek/deepseek-chat-v3-0324", label: "DeepSeek V3", badge: "OpenRouter" },
  { id: "mistralai/mistral-large", label: "Mistral Large", badge: "OpenRouter" },
  { id: "mistralai/devstral-small", label: "Devstral Small", badge: "OpenRouter", fast: true, new: true },
  { id: "qwen/qwen3-235b-a22b", label: "Qwen3 235B", badge: "OpenRouter", new: true },
  { id: "x-ai/grok-2-1212", label: "Grok 2", badge: "OpenRouter" },
  { id: "google/gemma-3-27b-it", label: "Gemma 3 27B", badge: "OpenRouter", fast: true },
  // ── Kimi (Groq) ──────────────────────────────────────────────────────────
  { id: "moonshotai/kimi-k2-instruct-0905", label: "Kimi K2", badge: "Kimi", new: true },
];

interface ChatPanelProps {
  project: Project;
  messages: Message[];
  files: ProjectFile[];
  activeFile?: ProjectFile | null;
  mode: EditorMode;
  credits: number;
  starterPrompt?: string;
  previewError?: string | null;
  pendingFixPrompt?: string | null;
  /** When set, inserts "@filename " into the chat input and focuses it */
  pendingFileRef?: ProjectFile | null;
  onMessagesUpdate: (msgs: Message[]) => void;
  onFilesUpdate: (files: ProjectFile[]) => void;
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
  /** Focus the preview pane (Lovable Details/Preview card) */
  onFocusPreview?: () => void;
  /** Show skeleton shimmer while messages are being fetched from the server */
  isMessagesLoading?: boolean;
}

const PROMPT_TEMPLATES: { category: string; prompts: string[] }[] = [
  {
    category: "UI & Design",
    prompts: [
      "Add a dark mode toggle to the header",
      "Make the layout fully responsive for mobile",
      "Add smooth page transition animations",
      "Style all buttons consistently with a primary color",
      "Add a loading skeleton for data-fetching sections",
    ],
  },
  {
    category: "Features",
    prompts: [
      "Add user authentication with email and password",
      "Create a dashboard with key metrics cards",
      "Add a search bar that filters results in real time",
      "Implement infinite scroll for the list",
      "Add a notification bell with a dropdown feed",
    ],
  },
  {
    category: "Fixes",
    prompts: [
      "Fix all TypeScript errors in the project",
      "Make all images use next/image for optimization",
      "Add proper error boundaries and fallback UI",
      "Fix layout overflow issues on small screens",
      "Replace all console.log calls with proper error handling",
    ],
  },
  {
    category: "Data & API",
    prompts: [
      "Add a REST API integration with loading and error states",
      "Create a form with validation and submission handler",
      "Add optimistic UI updates for mutations",
      "Implement client-side pagination for the table",
      "Add data export to CSV functionality",
    ],
  },
];

interface FileDiffEntry {
  path: string;
  fileId?: string;
  oldContent: string;
  newContent: string;
}

/** An item sitting in the prompt queue while AI is busy */
interface ClarifyQuestion {
  id: string;
  question: string;
  type: "text" | "choice";
  options?: string[];
  answer: string;
}

interface ClarifySession {
  originalPrompt: string;
  questions: ClarifyQuestion[];
}

interface QueueItem {
  id: string;
  text: string;
  /** Total number of times to run this prompt */
  repeat: number;
  /** How many runs are still remaining */
  remaining: number;
}

/** A visible task step shown during Agent mode execution */
interface AgentTaskStep {
  label: string;
  status: "running" | "done";
  detail?: string;
}

function agentStepToTaskStep(step: AgentStep): AgentTaskStep {
  if (step.type === "thought") {
    return { label: "Thinking…", status: "running", detail: step.content.slice(0, 120) || undefined };
  }
  if (step.type === "action") {
    const tool = step.tool ?? "tool";
    return { label: `Running ${tool}`, status: "running", detail: step.content.slice(0, 120) || undefined };
  }
  if (step.type === "observation") {
    return { label: "Observing result", status: "running", detail: step.content.slice(0, 120) || undefined };
  }
  if (step.type === "done") {
    return { label: "Complete", status: "done", detail: step.content.slice(0, 120) || undefined };
  }
  return { label: step.type, status: "running", detail: step.content.slice(0, 120) || undefined };
}

const MAX_AUTO_FIX_ATTEMPTS = 3;


/** Stateful wrapper for code blocks in chat — adds Copy + Insert + Collapse buttons */
// ── Mermaid diagram renderer ──────────────────────────────────────────────────
function MermaidBlock({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [svg, setSvg] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function render() {
      try {
        setLoading(true);
        setError(null);
        // @ts-ignore
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({
          startOnLoad: false,
          theme: "dark",
          themeVariables: {
            background: "#1e1e2e",
            primaryColor: "#7c3aed",
            primaryTextColor: "#cdd6f4",
            primaryBorderColor: "#313244",
            lineColor: "#6c7086",
            secondaryColor: "#313244",
            tertiaryColor: "#1e1e2e",
          },
        });
        const id = `mermaid-${Math.random().toString(36).slice(2)}`;
        const { svg: rendered } = await mermaid.render(id, code);
        if (!cancelled) { setSvg(rendered); setLoading(false); }
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Diagram render failed");
          setLoading(false);
        }
      }
    }
    void render();
    return () => { cancelled = true; };
  }, [code]);

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-6 my-2 rounded-lg border border-border/40 bg-[#1e1e2e]">
        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
        <span className="text-xs text-muted-foreground">Rendering diagram…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="my-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3">
        <p className="text-[10px] text-destructive font-mono">{error}</p>
        <pre className="mt-2 text-[10px] text-muted-foreground font-mono whitespace-pre-wrap">{code}</pre>
      </div>
    );
  }

  return (
    <div className="my-2 rounded-lg overflow-hidden border border-border/40 bg-[#1e1e2e]">
      <div className="flex items-center justify-between px-3 py-1 border-b border-border/30">
        <span className="text-[10px] text-[#6c7086] font-mono flex items-center gap-1">
          <span>📊</span> mermaid diagram
        </span>
        <button
          onClick={() => navigator.clipboard.writeText(code).catch(() => {})}
          className="text-[10px] text-[#6c7086] hover:text-[#cdd6f4] transition-colors px-1.5 py-0.5 rounded hover:bg-[#313244]/60"
        >Copy source</button>
      </div>
      <div
        ref={ref}
        className="p-4 overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  );
}

function ChatCodeBlock({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const [inserted, setInserted] = useState(false);
  // Default-collapse code blocks > 8 lines so long generated files don't
  // dominate the chat panel. Matches Lovable's behavior: chat is for prose,
  // code lives in the editor/preview. Short blocks (≤8 lines) stay expanded
  // because they're usually inline snippets the user wants to see.
  const lineCount = code.split("\n").length;
  const [isCollapsed, setIsCollapsed] = useState(lineCount > 8);

  // Render Mermaid diagrams natively
  if (language === "mermaid") return <MermaidBlock code={code} />;

  useEffect(() => {
    function handleSetAll(e: Event) {
      setIsCollapsed((e as CustomEvent<{ collapsed: boolean }>).detail.collapsed);
    }
    window.addEventListener("chat-codeblock-set-all", handleSetAll);
    return () => window.removeEventListener("chat-codeblock-set-all", handleSetAll);
  }, []);

  function handleCopy() {
    navigator.clipboard.writeText(code).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function handleInsert() {
    window.dispatchEvent(new CustomEvent("monaco-insert-code", { detail: { text: code } }));
    setInserted(true);
    setTimeout(() => setInserted(false), 1800);
  }

  // Languages that map to downloadable file types
  const DOWNLOADABLE: Record<string, string> = {
    csv:  "data.csv",
    json: "data.json",
    xml:  "data.xml",
    yaml: "data.yaml",
    yml:  "data.yaml",
    toml: "data.toml",
    txt:  "output.txt",
    text: "output.txt",
    markdown: "output.md",
    md:   "output.md",
    sql:  "query.sql",
    sh:   "script.sh",
    bash: "script.sh",
  };
  const downloadFilename = DOWNLOADABLE[language?.toLowerCase() ?? ""];

  function handleDownload() {
    const mimeMap: Record<string, string> = {
      csv: "text/csv", json: "application/json", xml: "application/xml",
      yaml: "text/yaml", yml: "text/yaml", sql: "text/plain",
    };
    const mime = mimeMap[language?.toLowerCase() ?? ""] ?? "text/plain";
    const blob = new Blob([code], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = downloadFilename ?? "file.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  if (isCollapsed) {
    return (
      <div className="relative my-2 rounded-lg border border-border/40 bg-[#1e1e2e] flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-[#24243e] transition-colors" onClick={() => setIsCollapsed(false)}>
        <FileCode2 className="w-3 h-3 text-[#6c7086] shrink-0" />
        <span className="text-[10px] text-[#6c7086] font-mono">{language || "code"}</span>
        <span className="text-[10px] text-[#45475a]">·</span>
        <span className="text-[10px] text-[#45475a] font-mono">{lineCount} line{lineCount !== 1 ? "s" : ""}</span>
        <ChevronDown className="w-3 h-3 text-[#6c7086] ml-auto" />
      </div>
    );
  }

  return (
    <div className="relative group my-2 rounded-lg overflow-hidden border border-border/40">
      {/* Toolbar */}
      <div className="flex items-center justify-between px-3 py-1 bg-[#1e1e2e] border-b border-border/30">
        <span className="text-[10px] text-[#6c7086] font-mono">{language || "code"}</span>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setIsCollapsed(true)}
            className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[#6c7086] hover:text-[#cba6f7] hover:bg-[#313244]/60 transition-colors"
            title="Collapse code block"
          >
            <ChevronUp className="w-3 h-3" />
          </button>
          <button
            onClick={handleInsert}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              inserted
                ? "text-green-400 bg-green-500/10"
                : "text-[#6c7086] hover:text-[#cba6f7] hover:bg-[#313244]/60"
            }`}
            title="Insert at cursor in editor"
          >
            {inserted ? <Check className="w-3 h-3" /> : <FileCode2 className="w-3 h-3" />}
            {inserted ? "Inserted" : "Insert"}
          </button>
          {downloadFilename && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-[#6c7086] hover:text-[#a6e3a1] hover:bg-[#313244]/60 transition-colors"
              title={`Download as ${downloadFilename}`}
            >
              <Download className="w-3 h-3" />
              Download
            </button>
          )}
          <button
            onClick={handleCopy}
            className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] transition-colors ${
              copied
                ? "text-green-400 bg-green-500/10"
                : "text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#313244]/60"
            }`}
            title="Copy code"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <SyntaxHighlighter
        style={oneDark as Record<string, React.CSSProperties>}
        language={language || "text"}
        PreTag="div"
        customStyle={{ margin: 0, borderRadius: 0, fontSize: "0.78rem" }}
      >
        {code}
      </SyntaxHighlighter>
    </div>
  );
}

function MessageContent({ content, mode }: { content: string; mode: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        code({ className, children, ...props }: React.ComponentPropsWithoutRef<"code"> & { inline?: boolean }) {
          const match = /language-(\w+)/.exec(className || "");
          const inline = !match;
          const code = String(children).replace(/\n$/, "");
          return !inline ? (
            <ChatCodeBlock language={match?.[1] ?? ""} code={code} />
          ) : (
            <code className="bg-muted/60 px-1 py-0.5 rounded text-[0.85em] font-mono" {...props}>
              {children}
            </code>
          );
        },
        p: ({ children }) => <p className="mb-2 last:mb-0 leading-relaxed">{children}</p>,
        ul: ({ children }) => <ul className="list-disc list-inside mb-2 space-y-0.5">{children}</ul>,
        ol: ({ children }) => <ol className="list-decimal list-inside mb-2 space-y-0.5">{children}</ol>,
        li: ({ children }) => <li className="leading-relaxed">{children}</li>,
        strong: ({ children }) => <strong className="font-semibold text-foreground">{children}</strong>,
        h1: ({ children }) => <h1 className="text-base font-bold mt-3 mb-1">{children}</h1>,
        h2: ({ children }) => <h2 className="text-sm font-semibold mt-3 mb-1">{children}</h2>,
        h3: ({ children }) => <h3 className="text-sm font-medium mt-2 mb-1">{children}</h3>,
        blockquote: ({ children }) => (
          <blockquote className="border-l-2 border-muted-foreground/30 pl-3 italic text-muted-foreground my-2">{children}</blockquote>
        ),
        a: ({ href, children }) => (
          <a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline hover:no-underline">{children}</a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

/** Format a message timestamp for the hover tooltip */
function formatMsgTime(isoString: string | null | undefined): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) return time;
  if (isYesterday) return `Yesterday ${time}`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" }) + " " + time;
}

/** Lovable-style date divider label between messages on different days */
function formatDateSeparator(isoString: string | null | undefined): string {
  if (!isoString) return "";
  const d = new Date(isoString);
  const now = new Date();
  const isToday = d.toDateString() === now.toDateString();
  const yesterday = new Date(now);
  yesterday.setDate(now.getDate() - 1);
  const isYesterday = d.toDateString() === yesterday.toDateString();
  const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  if (isToday) return `Today at ${time}`;
  if (isYesterday) return `Yesterday at ${time}`;
  const datePart = d.toLocaleDateString([], { month: "short", day: "numeric" });
  return `${datePart} at ${time}`;
}

function sameCalendarDay(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return true;
  return new Date(a).toDateString() === new Date(b).toDateString();
}

/** Group a flat message array into per-turn threads (each user message starts a new thread) */
function groupIntoThreads(msgs: Message[]): Message[][] {
  const threads: Message[][] = [];
  let current: Message[] = [];
  for (const msg of msgs) {
    if (msg.role === "user" && current.length > 0) {
      threads.push(current);
      current = [msg];
    } else {
      current.push(msg);
    }
  }
  if (current.length > 0) threads.push(current);
  return threads;
}

export function ChatPanel({
  project, messages, files, activeFile, mode, credits, starterPrompt,
  previewError, pendingFixPrompt, pendingFileRef,
  onMessagesUpdate, onFilesUpdate, onCreditsUpdate,
  onAutoFixComplete, onPendingFixConsumed, onPendingFileRefConsumed,
  onStreamingChange, onModeChange, onApprovePlan,
  pendingBuildFromFile, onPendingBuildFromFileConsumed,
  isLocked = false, onOpenPanel, onFocusPreview, isMessagesLoading = false,
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

  const contextualEmptyPrompts = useMemo(() => {
    if (credits <= 0) return getNoCreditsPrompts();
    if (previewError) return getPreviewErrorPrompts(previewError);
    return getEmptyProjectPrompts(inferProjectStage(files), project.framework);
  }, [files, previewError, credits, project.framework]);

  const [input, setInput] = useState("");
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
  const {
    preferredModel: storedPreferredModel,
    modelManuallySelected,
    setPreferredModel: persistPreferredModel,
    setModelManuallySelected,
  } = useEditorModelPrefs();
  const modelManuallySelectedRef = useRef(modelManuallySelected);
  const [selectedModel, setSelectedModel] = useState<AIModel>(() =>
    AI_MODELS.some((m) => m.id === storedPreferredModel) ? storedPreferredModel : DEFAULT_CODING_MODEL,
  );
  useEffect(() => {
    modelManuallySelectedRef.current = modelManuallySelected;
  }, [modelManuallySelected]);
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);
  // Emoji reactions: { [messageId]: Set<emoji> }
  const [reactions, setReactions] = useState<Record<string, Set<string>>>({});
  const QUICK_EMOJI = ["👍", "❤️", "🚀", "😂", "😮", "👎"];
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

  // Prompt queue — messages queued while AI is streaming
  const [promptQueue, setPromptQueue] = useState<QueueItem[]>([]);
  const [queuePaused, setQueuePaused] = useState(false);
  const [editingQueueId, setEditingQueueId] = useState<string | null>(null);
  const [editingQueueText, setEditingQueueText] = useState("");
  const [repeatInputId, setRepeatInputId] = useState<string | null>(null);
  // Agent task step visibility
  const [agentSteps, setAgentSteps] = useState<AgentTaskStep[]>([]);
  const [subagentSteps, setSubagentSteps] = useState<SubagentStep[]>([]);
  const [previewVerify, setPreviewVerify] = useState<{ ok: boolean; checks: Array<{ name: string; pass: boolean; detail?: string }> } | null>(null);
  const [messageCredits, setMessageCredits] = useState<Record<string, number>>({});
  const [buildStatus, setBuildStatus] = useState<BuildIntent | null>(null);
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
  const [currentUserId, setCurrentUserId] = useState<string>("");
  const [showClearDialog, setShowClearDialog] = useState(false);
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
  // Results render as their own "system" bubbles in the chat — list of past runs.
  const [analyzeResults, setAnalyzeResults] = useState<Array<{
    id: string;
    instruction: string;
    stdout: string;
    stderr: string;
    files: Array<{ name: string; base64: string; sizeBytes: number; mimeType: string }>;
    createdAt: number;
  }>>([]);
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  // Seed screenshots from freshly-loaded messages (e.g., on page reload)
  useEffect(() => {
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
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Handle file-to-app drop: pre-fill input (and image) then consume
  useEffect(() => {
    if (!pendingBuildFromFile) return;
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
  const { toast } = useToast();

  useEffect(() => {
    if (!streaming) {
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
    const supabase = createClient();
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
        setAttachedText({ name: file.name, content: reader.result as string });
        setAttachedImage(null);
      };
      reader.readAsText(file);
    } else {
      toast({ title: "Unsupported file type", description: "Drop an image or code file.", variant: "destructive" });
    }
  }

  function startEditMessage(msg: Message) {
    setEditingMessageId(msg.id);
    setEditInput(msg.content);
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
    await sendMessage(lastUserMsg.content, undefined, truncated);
  }

  useEffect(() => {
    const fromMeta: Record<string, number> = {};
    messages.forEach((m) => {
      const c = (m.metadata as Record<string, unknown> | null)?.credits_used;
      if (m.role === "assistant" && typeof c === "number") fromMeta[m.id] = c;
    });
    if (Object.keys(fromMeta).length > 0) {
      setMessageCredits((prev) => ({ ...fromMeta, ...prev }));
    }
  }, [messages]);

  // Auto-fire starter prompt from URL (new project with ?prompt=...)
  // Wait until credits are synced — sendMessage no-ops when credits <= 0
  useEffect(() => {
    if (!starterPrompt || starterFired || messages.length > 0 || streaming) return;
    if (credits <= 0) return;

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

  // Populate input when user clicks "Fix with AI" on the error banner in preview panel
  useEffect(() => {
    if (!pendingFixPrompt || credits <= 0) {
      if (pendingFixPrompt && credits <= 0) onPendingFixConsumed?.();
      return;
    }
    setInput(`Fix this runtime error:\n\n${pendingFixPrompt}`);
    onPendingFixConsumed?.();
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Insert "@filename " into input when user clicks "Ask AI" in code panel
  useEffect(() => {
    if (!pendingFileRef) return;
    const mention = `@${pendingFileRef.path} `;
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

  // Auto-fix loop: when a preview error arrives, call /api/ai/fix automatically
  useEffect(() => {
    if (
      !previewError ||
      previewError === lastFixedError ||
      autoFixing ||
      streaming ||
      autoFixAttempts >= MAX_AUTO_FIX_ATTEMPTS ||
      credits < 1
    )
      return;

    const timer = setTimeout(() => {
      void triggerAutoFix(previewError);
    }, 1500); // short delay so user sees the error first

    return () => clearTimeout(timer);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [previewError]);

  // Auto-collapse all threads except the latest 2 whenever messages grow
  useEffect(() => {
    const threads = groupIntoThreads(messages);
    if (threads.length <= 2) return;
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

  async function triggerAutoFix(error: string) {
    setAutoFixing(true);
    setLastFixedError(error);
    setAutoFixAttempts((n) => n + 1);

    // Show an in-chat notification
    const fixingMsg: Message = {
      id: `autofix-${Date.now()}`,
      project_id: project.id,
      role: "assistant",
      content: `🔧 **Auto-fixing error** (attempt ${autoFixAttempts + 1}/${MAX_AUTO_FIX_ATTEMPTS})\n\n\`\`\`\n${error.slice(0, 300)}\n\`\`\``,
      tokens_used: null,
      model: null,
      mode: "build",
      metadata: null,
      rating: null,
      created_at: new Date().toISOString(),
    };
    onMessagesUpdate([...messages, fixingMsg]);

    try {
      const res = await fetch("/api/ai/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          error,
          files: files.map((f) => ({ path: f.path, content: f.content })),
        }),
      });

      if (!res.ok) throw new Error(`Fix API ${res.status}`);

      const data = (await res.json()) as {
        files: Array<{ path: string; content: string }>;
        explanation: string;
        tokensUsed: number;
      };

      // Update credits
      onCreditsUpdate(credits - 1);

      // Refresh files from DB
      const { createClient } = await import("@/lib/supabase/client");
      const supabase = createClient();
      const { data: updatedFiles } = await (supabase as any)
        .from("project_files")
        .select("*")
        .eq("project_id", project.id);

      if (updatedFiles) onFilesUpdate(updatedFiles);

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
      onMessagesUpdate([...messages, fixingMsg, successMsg]);
      onAutoFixComplete?.();
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
      onMessagesUpdate([...messages, fixingMsg, errMsg]);
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
      const data = await res.json() as { projects?: Array<{id:string;name:string;slug:string}> };
      const others = (data.projects ?? []).filter((p) => p.id !== project.id);
      setCrossProjects(others);
      setCrossProjectsLoaded(true);
    } catch { /* ignore */ }
  }

  async function loadCrossProjectFiles(projectId: string) {
    if (crossProjectFiles[projectId]) return;
    try {
      const res = await fetch("/api/projects/" + projectId + "/files");
      if (!res.ok) return;
      const data = await res.json() as { files?: Array<{path:string}> };
      setCrossProjectFiles((prev) => ({ ...prev, [projectId]: data.files ?? [] }));
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

  // Parse <!-- STEP_PLAN --> messages into ordered steps
  function parseStepPlan(raw: string): string[] {
    const body = raw.replace("<!-- STEP_PLAN -->", "").trim();
    // Split on numbered list items: 1. ... or **1.** ...
    const lines = body.split("\n");
    const steps: string[] = [];
    let current = "";
    for (const line of lines) {
      if (/^\*{0,2}\d+\.\*{0,2}\s/.test(line.trim())) {
        if (current.trim()) steps.push(current.trim());
        current = line.trim().replace(/^\*{0,2}\d+\.\*{0,2}\s+/, "");
      } else {
        current += " " + line.trim();
      }
    }
    if (current.trim()) steps.push(current.trim());
    return steps.filter(Boolean);
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
    if (!userMessage.trim() || streaming) return;

    const effectiveMode = resolvePromptMode(userMessage, intelCtx, overrideMode);
    const effectiveModel = modelManuallySelectedRef.current
      ? selectedModel
      : resolveSmartModel(effectiveMode, intelCtx, userMessage);
    let availableCredits = credits;
    if (effectiveMode === "agent" && availableCredits < 5) {
      try {
        const cr = await fetch("/api/billing/credits");
        if (cr.ok) {
          const { credits: fresh } = (await cr.json()) as { credits?: number };
          if (typeof fresh === "number") {
            availableCredits = fresh;
            onCreditsUpdate(fresh);
          }
        }
      } catch {}
    }
    const minCredits = effectiveMode === "agent" ? 5 : 1;
    if (availableCredits < minCredits) {
      if (effectiveMode === "agent") {
        toast({
          title: "Insufficient credits",
          description: "Agent mode needs at least 5 credits.",
          variant: "destructive",
        });
      }
      return;
    }
    if (!overrideMode && effectiveMode !== mode) {
      onModeChange?.(effectiveMode);
    }
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
      setAgentSteps([{ label: "Starting agent…", status: "running" }]);
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
      content: userMessage,
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
              const d = await r.json() as { files?: Array<{path:string;content:string}> };
              const match = (d.files ?? []).find((f) => f.path === ref.filePath);
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
            model: effectiveModel,
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

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          for (const line of decoder.decode(value).split("\n")) {
            if (!line.startsWith("data: ")) continue;
            try {
              const data = JSON.parse(line.slice(6));

              if (data.step) {
                const step = data.step as AgentStep;
                setAgentSteps((prev) => {
                  const donePrev = prev.map((s) => ({ ...s, status: "done" as const }));
                  return [...donePrev, agentStepToTaskStep(step)];
                });
              }

              if (typeof data.fileUpdated?.path === "string") {
                changedPaths.add(data.fileUpdated.path);
                setStreamingFiles(Array.from(changedPaths));
                onStreamingChange?.(true, changedPaths.size);
              }

              if (data.done) {
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
                  const assistantId = `assistant-${Date.now()}`;
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

                  const missingPkgs = findMissingPackages(diffSource, updatedFiles.find((f: { path: string }) => f.path === "package.json")?.content ?? null);
                  if (missingPkgs.length > 0) {
                    toast({
                      title: `${missingPkgs.length} new package${missingPkgs.length > 1 ? "s" : ""} detected`,
                      description: `Run: ${buildInstallCommand(missingPkgs)}`,
                      duration: 8000,
                    });
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

                if (shouldRunPreviewVerify(userMessage, effectiveMode)) {
                  void fetch(`/api/projects/${project.id}/preview-verify`, { method: "POST" })
                    .then((r) => r.json())
                    .then((result) => setPreviewVerify(result))
                    .catch(() => setPreviewVerify(null));
                }

                const captureId = syncedMessages?.at(-1)?.id ?? `assistant-${Date.now()}`;
                setTimeout(() => {
                  window.dispatchEvent(new CustomEvent("lifemark-request-screenshot", { detail: { messageId: captureId } }));
                }, 2500);
              }

              if (data.error) {
                toast({ title: "Agent Error", description: data.error, variant: "destructive" });
                onMessagesUpdate(baseMessages);
              }
            } catch {}
          }
        }
        return;
      }

      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          projectId: project.id,
          message: messageWithContext + crossProjectContext,
          mode: effectiveMode,
          model: effectiveModel,
          framework: mobileMode ? "react-native" : "web",
          clarifyFirst: effectiveMode === "build" && clarifyFirst && files.length === 0,
          // If @mentions present, only send those files for context (saves tokens + focuses AI)
          files: mentionedFiles
            ? mentionedFiles.map((f) => ({ path: f.path, content: f.content }))
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
        throw new Error(`API error: ${res.status}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      // Pre-generate ID so mid-stream events (patches_applied) can reference the same message
      const streamingAssistantId = `assistant-${Date.now()}`;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const text = decoder.decode(value);
        const lines = text.split("\n");

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          try {
            const data = JSON.parse(line.slice(6));

            // Patch mode: capture how many patches were applied.
            // assistantId is only created when data.done fires; for in-flight
            // patches_applied events we stash the count under a "pending" key
            // and reconcile it onto the real assistant message at data.done.
            if (data.status === "patches_applied" && data.count != null) {
              setPatchCounts((prev) => ({ ...prev, __pending: data.count as number }));
            }

            // Skill auto-match: API sends matched skills before the model output begins
            // so we can render a "using skill: X" chip on the pending assistant message.
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
              setPendingSkills(
                data.skills_attached.map((s: { id: string; name: string; reason?: string }) => ({
                  id: s.id,
                  name: s.name,
                  reason: s.reason,
                })),
              );
            }

            // Server confirms a file landed in project_files. Track so we can
            // re-fetch on data.done even if the server's parseAIResponse
            // returns empty (prose+fences case — file is in DB but not in
            // data.files at done).
            if (typeof data.streamedFile === "string") {
              serverStreamedPathsRef.current.add(data.streamedFile);
              applyBuildSteps((prev) => (prev.length > 0 ? onBuildFileProgress(prev) : prev));
            }

            if (data.chunk) {
              accumulated += data.chunk;
              setStreamingContent(accumulated);
              // Extract file paths from partial JSON as they stream in
              const pathMatches = [...accumulated.matchAll(/"path"\s*:\s*"([^"]+)"/g)];
              if (pathMatches.length > 0) {
                const paths = pathMatches.map((m) => m[1]);
                setStreamingFiles(paths);
                onStreamingChange?.(true, paths.length);
                if (paths.length > 0) {
                  applyBuildSteps((prev) =>
                    prev.length > 0 ? onBuildFileProgress(prev) : prev,
                  );
                }
              }
            }

            if (data.clarifying_questions) {
              // Agent asked for clarification before building
              setActiveClarifySession({
                originalPrompt: data.originalPrompt ?? userMessage,
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
              // Remove the optimistic user message so clarify cards appear instead
              onMessagesUpdate(baseMessages);
              return;
            }

            if (data.done) {
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
              if (data.creditsUsed) {
                onCreditsUpdate(credits - data.creditsUsed);
                setMessageCredits((prev) => ({ ...prev, [assistantId]: data.creditsUsed as number }));
              }

              // Persist any auto-matched skills onto the final assistant message
              // and clear the pending state so the chip doesn't flash onto the
              // next stream's placeholder.
              if (pendingSkills.length > 0) {
                setMessageSkills((prev) => ({ ...prev, [assistantId]: pendingSkills }));
                setPendingSkills([]);
              }

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
              const haveStreamedFiles = serverStreamedPathsRef.current.size > 0;
              if ((data.files && data.files.length > 0) || haveStreamedFiles) {
                const supabase = createClient();
                const { data: updatedFiles } = await (supabase as any)
                  .from("project_files")
                  .select("*")
                  .eq("project_id", project.id);

                if (updatedFiles) {
                  // Build diff entries. Prefer data.files (has fresh content from
                  // the AI response) when present; fall back to the streamed
                  // paths + their re-fetched content when only streaming
                  // happened.
                  const diffSource: Array<{ path: string; content: string }> =
                    (data.files as Array<{ path: string; content: string }> | undefined)?.length
                      ? (data.files as Array<{ path: string; content: string }>)
                      : Array.from(serverStreamedPathsRef.current).map((path) => {
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

                  // ── npm auto-install + package.json auto-sync ──────────────────
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
                    if (missingPkgs.length > 0) {
                      const cmd = buildInstallCommand(missingPkgs);
                      toast({
                        title: `${missingPkgs.length} new package${missingPkgs.length > 1 ? "s" : ""} detected`,
                        description: `Run: ${cmd}`,
                        duration: 8000,
                      });

                      // #384 — package.json auto-sync: also update package.json in the project files
                      if (pkgJsonFile?.content) {
                        const sync = syncPackageJsonDeps(updatedFiles as Array<{ path: string; content: string }>, pkgJsonFile.content);
                        if (sync) {
                          try {
                            const { createClient } = await import("@/lib/supabase/client");
                            const supabase = createClient();
                            await (supabase as any).from("project_files").upsert({
                              project_id: project.id,
                              path: "package.json",
                              content: sync.updated,
                              language: "json",
                            }, { onConflict: "project_id,path" });
                            // Refresh files so the editor shows the updated package.json
                            const { data: refreshed } = await (supabase as any)
                              .from("project_files")
                              .select("*")
                              .eq("project_id", project.id);
                            if (refreshed) onFilesUpdate(refreshed);
                          } catch {
                            // Silently ignore — not critical
                          }
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
                // Prefer the server's human-readable summary — `accumulated` is
                // the raw JSON blob in build mode.
                content: (data.displayMessage as string | undefined) || accumulated,
                tokens_used: data.tokensUsed ?? null,
                model: effectiveModel,
                // Same narrowing as the user message above — collapse "patch"
                // to "build" so the assistant row fits Message['mode'].
                mode: (effectiveMode === "patch" ? "build" : effectiveMode) as "chat" | "plan" | "build" | "agent",
                metadata: completedBuildActivity
                  ? ({ build_activity: completedBuildActivity } as unknown as Json)
                  : null,
                rating: null,
                created_at: new Date().toISOString(),
              };
              onMessagesUpdate([...baseMessages, tempUserMsg, assistantMsg]);
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

              if (shouldRunPreviewVerify(userMessage, effectiveMode)) {
                void fetch(`/api/projects/${project.id}/preview-verify`, { method: "POST" })
                  .then((r) => r.json())
                  .then((result) => setPreviewVerify(result))
                  .catch(() => setPreviewVerify(null));
              }

              // Multi-role test chips (Lovable best-practice: recheck multi-role behavior after big edits)
              const roleChips = buildRoleTestChips(filePaths);
              if (roleChips.length > 0) {
                setRoleTestChips((prev) => ({ ...prev, [assistantId]: roleChips }));
              }
            }

            if (data.error) {
              toast({ title: "AI Error", description: data.error, variant: "destructive" });
            }
          } catch {}
        }
      }
    } catch (err: unknown) {
      applyBuildSteps([]);
      toast({
        title: "Request failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    } finally {
      setStreamingWithCallback(false);
      setStreamingContent("");
      setStreamingFiles([]);
      setBuildStatus(null);
      setSubagentSteps([]);
      setPreviewVerify(null);
      // buildActivitySteps cleared in data.done; completed steps live on the assistant message
    }
  }

  function handleSend() {
    if (isLocked) return;
    if (!input.trim()) return;
    if (streaming) {
      // AI is busy — add to queue instead of blocking
      const text = input.trim();
      setPromptQueue((prev) => [...prev, { id: `q-${Date.now()}`, text, repeat: 1, remaining: 1 }]);
      setInput("");
      return;
    }
    void sendMessage(input.trim(), mode);
  }

  // Auto-drain the queue when streaming finishes (unless paused)
  useEffect(() => {
    if (streaming) return;
    const q = promptQueueRef.current;
    if (queuePausedRef.current || q.length === 0) return;
    const [next, ...rest] = q;
    const newRemaining = next.remaining - 1;
    if (newRemaining > 0) {
      // Still has repeats left — put a decremented copy back at the front
      setPromptQueue([{ ...next, remaining: newRemaining }, ...rest]);
    } else {
      setPromptQueue(rest);
    }
    void sendMessage(next.text, mode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  // Debounce ref for URL scraping
  const scrapeDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  function handleInputChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value;
    setInput(val);
    // "/" at start of input opens the template/skill picker
    if (val.startsWith("/")) {
      setShowTemplates(true);
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

  // Files + collaborators filtered by @mention query
  type MentionItem =
    | { kind: "file"; path: string }
    | { kind: "user"; display: string; email: string }
    | { kind: "xproject"; projectName: string; projectId: string; filePath: string };

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
          // Hint to trigger cross-project mode
          ...(!mentionQuery || "project".startsWith(mentionQuery.toLowerCase()) ? [{ kind: "xproject" as const, projectName: "Other project…", projectId: "", filePath: "" }] : []),
        ]
    : [];

  // Keep backward-compat alias
  const mentionFiles = mentionItems;

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
      : item.kind === "file" ? item.path : item.display;
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
    // Close template picker on Escape
    if (showTemplates && e.key === "Escape") { e.preventDefault(); setShowTemplates(false); return; }
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
      handleSend();
    }
  }

  async function copyMessage(content: string, id: string) {
    await navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  }

  async function handleClearChat() {
    try {
      await fetch(`/api/projects/${project.id}/messages`, { method: "DELETE" });
    } catch {
      // best-effort
    }
    onMessagesUpdate([]);
    setShowClearDialog(false);
    toast({ title: "Conversation cleared" });
  }

  function exportChatAsMarkdown() {
    if (messages.length === 0) return;
    const lines: string[] = [
      `# ${project.name} — Chat Export`,
      ``,
      `> Exported ${new Date().toLocaleString()}`,
      ``,
    ];
    for (const msg of messages) {
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

  // ⌘⇧K — open clear chat dialog
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === "K") {
        e.preventDefault();
        setShowClearDialog(true);
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ⌘F — open/close chat search
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key === "f") {
        e.preventDefault();
        setShowSearch((v) => {
          if (!v) setTimeout(() => searchInputRef.current?.focus(), 50);
          return !v;
        });
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Alt+P — toggle between Build and Plan (matches Lovable's "Toggle with Alt P")
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      // Ignore when the user is typing in an input/textarea/contenteditable
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)) return;
      if (e.key.toLowerCase() !== "p") return;
      e.preventDefault();
      onModeChange?.(mode === "plan" ? "build" : "plan");
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [mode, onModeChange]);

  const noCredits = credits <= 0;

  // Mode tab config
  const MODE_TABS: { id: EditorMode; label: string; shortLabel: string }[] = [
    { id: "chat",  label: "Chat",       shortLabel: "Chat"  },
    { id: "build", label: "Build",      shortLabel: "Build" },
    { id: "patch", label: "Quick Edit", shortLabel: "Edit"  },
    { id: "plan",  label: "Plan",       shortLabel: "Plan"  },
    { id: "agent", label: "Agent",      shortLabel: "Agent" },
  ];

  return (
    <div
      className="flex flex-col h-full bg-background"
      // Lift the chat panel above the on-screen keyboard on mobile. inset is 0
      // on desktop, ~250-300px on iOS/Android when the keyboard is up. The
      // padding-bottom approach (vs. translateY) preserves scroll position
      // and keeps the most-recent messages visible.
      style={{ paddingBottom: keyboardInset }}
    >
      {/* ── Lovable-style mode tab bar ── */}
      <div className="flex items-center gap-0.5 px-3 pt-2 pb-0 border-b border-border/60 flex-shrink-0">
        {MODE_TABS.map((tab) => (
          <button
            key={tab.id}
            onClick={() => onModeChange?.(tab.id)}
            className={`relative px-3 py-2 text-xs font-medium transition-colors rounded-t-sm ${
              mode === tab.id
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab.label}
            {mode === tab.id && (
              <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary rounded-full" />
            )}
          </button>
        ))}
        <div className="flex-1" />
        {/* Credit cost badge */}
        <span className="text-[10px] text-muted-foreground/50 pr-1 pb-1.5 flex-shrink-0">
          {mode === "build" || mode === "agent" ? "2" : "1"} credit{mode === "patch" ? " · patch" : ""} / msg
        </span>
        {/* Export chat as Markdown */}
        <button
          onClick={exportChatAsMarkdown}
          disabled={messages.length === 0}
          className="mb-1 p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          title="Export conversation as Markdown"
        >
          <Download className="w-3.5 h-3.5" />
        </button>
        {/* Copy all messages */}
        <button
          onClick={async () => {
            const text = messages.map((m) => `${m.role === "user" ? "You" : "AI"}: ${m.content}`).join("\n\n");
            await navigator.clipboard.writeText(text);
            setCopiedAll(true);
            setTimeout(() => setCopiedAll(false), 2000);
          }}
          disabled={messages.length === 0}
          className="mb-1 p-1 rounded text-muted-foreground/40 hover:text-foreground hover:bg-muted/60 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          title="Copy all messages"
        >
          {copiedAll ? <Check className="w-3.5 h-3.5 text-green-500" /> : <Copy className="w-3.5 h-3.5" />}
        </button>
        {/* Clear chat button */}
        <button
          onClick={() => setShowClearDialog(true)}
          disabled={messages.length === 0}
          className="mb-1 p-1 rounded text-muted-foreground/40 hover:text-destructive hover:bg-destructive/10 transition-colors disabled:opacity-20 disabled:cursor-not-allowed"
          title="Clear conversation (⌘⇧K)"
        >
          <Trash2 className="w-3.5 h-3.5" />
        </button>
        {/* Search messages button */}
        <button
          onClick={() => {
            setShowSearch((v) => {
              if (!v) setTimeout(() => searchInputRef.current?.focus(), 50);
              return !v;
            });
          }}
          disabled={messages.length === 0}
          className={`mb-1 p-1 rounded transition-colors disabled:opacity-20 disabled:cursor-not-allowed ${
            showSearch
              ? "text-violet-400 bg-violet-500/10"
              : "text-muted-foreground/40 hover:text-foreground hover:bg-muted/60"
          }`}
          title="Search messages (⌘F)"
        >
          <Search className="w-3.5 h-3.5" />
        </button>
        {/* Bookmarks filter button */}
        <button
          onClick={() => setShowBookmarks((v) => !v)}
          disabled={messages.length === 0}
          className={`mb-1 p-1 rounded transition-colors disabled:opacity-20 disabled:cursor-not-allowed relative ${
            showBookmarks
              ? "text-amber-400 bg-amber-500/10"
              : "text-muted-foreground/40 hover:text-foreground hover:bg-muted/60"
          }`}
          title={showBookmarks ? "Show all messages" : "Show bookmarked messages only"}
        >
          <Bookmark className={`w-3.5 h-3.5 ${showBookmarks ? "fill-amber-400" : ""}`} />
          {bookmarkedIds.size > 0 && (
            <span className="absolute -top-0.5 -right-0.5 w-2 h-2 rounded-full bg-amber-400" />
          )}
        </button>
        {/* Collapse / expand all code blocks */}
        <button
          onClick={() => {
            const next = !allCodeBlocksCollapsed;
            setAllCodeBlocksCollapsed(next);
            window.dispatchEvent(new CustomEvent("chat-codeblock-set-all", { detail: { collapsed: next } }));
          }}
          disabled={messages.length === 0}
          className={`mb-1 p-1 rounded transition-colors disabled:opacity-20 disabled:cursor-not-allowed ${
            allCodeBlocksCollapsed
              ? "text-violet-400 bg-violet-500/10"
              : "text-muted-foreground/40 hover:text-foreground hover:bg-muted/60"
          }`}
          title={allCodeBlocksCollapsed ? "Expand all code blocks" : "Collapse all code blocks"}
        >
          <Minimize2 className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Message search bar */}
      <AnimatePresence>
        {showSearch && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-b border-border/60"
          >
            <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/20">
              <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              <input
                ref={searchInputRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") { setShowSearch(false); setSearchQuery(""); }
                }}
                placeholder="Search messages…"
                className="flex-1 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50 text-foreground"
              />
              {searchQuery && (
                <span className="text-[10px] text-muted-foreground/60 shrink-0">
                  {messages.filter((m) =>
                    m.content.toLowerCase().includes(searchQuery.toLowerCase())
                  ).length} match
                </span>
              )}
              <button
                onClick={() => { setShowSearch(false); setSearchQuery(""); }}
                className="text-muted-foreground/50 hover:text-foreground transition-colors"
              >
                <XCircle className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context summary banner — shown when older messages have been compressed */}
      {!!(project.metadata as Record<string, unknown> | null)?.context_summary && (
        <div className="flex items-center gap-2 px-4 py-2 bg-violet-500/5 border-b border-violet-500/15 text-[11px] text-muted-foreground">
          <Brain className="w-3 h-3 text-violet-400 flex-shrink-0" />
          <span>
            <span className="text-violet-400 font-medium">Context summarised</span>
            {" · "}
            {(project.metadata as Record<string, unknown>).context_summary_covers as number ?? "Earlier"} messages compressed to keep AI focused
          </span>
        </div>
      )}

      {/* Messages */}
      <div className="flex-1 relative min-h-0 flex flex-col">
      <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-4 py-5 space-y-5 bg-[#faf8f5] dark:bg-background">
        {isMessagesLoading && (
          <div className="flex flex-col gap-5 px-4 py-5">
            {/* AI message skeleton */}
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-24 rounded-full" />
              <Skeleton className="h-16 w-full rounded-xl" />
              <Skeleton className="h-3 w-3/4 rounded-full" />
            </div>
            {/* User message skeleton — right-aligned */}
            <div className="flex flex-col items-end gap-2">
              <Skeleton className="h-10 w-2/3 rounded-2xl" />
            </div>
            {/* AI message skeleton */}
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3.5 w-20 rounded-full" />
              <Skeleton className="h-24 w-full rounded-xl" />
              <Skeleton className="h-3 w-1/2 rounded-full" />
              <Skeleton className="h-3 w-2/3 rounded-full" />
            </div>
            {/* User message skeleton — right-aligned */}
            <div className="flex flex-col items-end gap-2">
              <Skeleton className="h-10 w-1/2 rounded-2xl" />
            </div>
          </div>
        )}

        {!isMessagesLoading && messages.length === 0 && !streaming && (
          <div className="flex flex-col items-center justify-center h-full py-10 px-4">
            {/* Star/sparkle icon */}
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-600/20 to-purple-600/10 border border-violet-500/20 flex items-center justify-center mb-5 shadow-sm">
              <Sparkles className="w-7 h-7 text-violet-400" />
            </div>
            <h3 className="text-base font-semibold mb-1.5 text-foreground">Start building with AI</h3>
            <p className="text-xs text-muted-foreground mb-7 text-center max-w-[220px] leading-relaxed">
              Describe what you want to build, fix, or improve and watch it come to life.
            </p>
            {/* Suggestion chips — Lovable-style bordered cards */}
            <div className="w-full space-y-2">
              {contextualEmptyPrompts.map((prompt) => (
                <button
                  key={prompt}
                  onClick={() => {
                    setInput(prompt);
                    textareaRef.current?.focus();
                  }}
                  className="w-full text-left text-xs px-3.5 py-2.5 rounded-xl border border-border/60 bg-muted/30 hover:bg-muted hover:border-border transition-all text-muted-foreground hover:text-foreground group"
                >
                  <span className="flex items-start gap-2">
                    <span className="mt-0.5 text-violet-400/60 group-hover:text-violet-400 transition-colors">→</span>
                    <span>{prompt}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Pinned message banner */}
        {pinnedMsgId && (() => {
          const pinned = messages.find((m) => m.id === pinnedMsgId);
          if (!pinned) return null;
          const preview = pinned.content.replace(/\s+/g, " ").slice(0, 90) + (pinned.content.length > 90 ? "…" : "");
          return (
            <div className="flex items-center gap-2 px-3 py-2 mx-3 mb-1 rounded-lg bg-violet-500/10 border border-violet-500/20 text-xs">
              <Pin className="w-3 h-3 text-violet-400 shrink-0" />
              <span className="flex-1 text-muted-foreground truncate">{preview}</span>
              <button
                onClick={() => setPinnedMsgId(null)}
                className="shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors text-muted-foreground hover:text-foreground"
                title="Unpin"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
          );
        })()}

        {showBookmarks && bookmarkedIds.size === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <Bookmark className="w-8 h-8 text-muted-foreground/30 mb-3" />
            <p className="text-sm text-muted-foreground/60">No bookmarks yet</p>
            <p className="text-xs text-muted-foreground/40 mt-1">Click the bookmark icon on any message card</p>
          </div>
        )}

        {groupIntoThreads(
          showBookmarks
            ? messages.filter((m) => bookmarkedIds.has(m.id))
            : searchQuery
            ? messages.filter((m) =>
                m.content.toLowerCase().includes(searchQuery.toLowerCase())
              )
            : messages
        ).map((thread, threadIdx) => {
          const isCollapsed = !searchQuery && collapsedThreads.has(threadIdx);
          const userMsg = thread.find((m) => m.role === "user");
          const preview = userMsg
            ? userMsg.content.replace(/\s+/g, " ").slice(0, 65) +
              (userMsg.content.length > 65 ? "…" : "")
            : "";
          return (
            <div key={thread[0]?.id ?? `thread-${threadIdx}`}>
              {/* Thread divider (not for the very first turn) */}
              {!searchQuery && threadIdx > 0 && (
                <div className="flex items-center gap-2 my-3">
                  <div className="flex-1 h-px bg-border/40" />
                  <button
                    onClick={() =>
                      setCollapsedThreads((prev) => {
                        const n = new Set(prev);
                        if (n.has(threadIdx)) n.delete(threadIdx);
                        else n.add(threadIdx);
                        return n;
                      })
                    }
                    className="flex items-center gap-1.5 text-[11px] px-2 py-0.5 rounded-full border border-border/50 bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors shrink-0 max-w-[220px]"
                  >
                    <span className="font-medium text-violet-400/80 shrink-0">
                      Turn {threadIdx + 1}
                    </span>
                    {isCollapsed && preview && (
                      <span className="truncate opacity-70 text-[10px]">{preview}</span>
                    )}
                    {isCollapsed ? (
                      <ChevronDown className="w-3 h-3 shrink-0" />
                    ) : (
                      <ChevronUp className="w-3 h-3 shrink-0" />
                    )}
                  </button>
                  <div className="flex-1 h-px bg-border/40" />
                </div>
              )}
              <AnimatePresence initial={false}>
                {!isCollapsed && thread.map((msg, msgIdx) => {
                  const prevMsg = msgIdx > 0 ? thread[msgIdx - 1] : null;
                  const showDateSep = !sameCalendarDay(msg.created_at, prevMsg?.created_at);
                  return (
                  <div key={msg.id}>
                    {showDateSep && (
                      <div className="flex items-center gap-3 my-4 px-1">
                        <div className="flex-1 h-px bg-border/40" />
                        <span className="text-[11px] text-muted-foreground/70 whitespace-nowrap shrink-0">
                          {formatDateSeparator(msg.created_at)}
                        </span>
                        <div className="flex-1 h-px bg-border/40" />
                      </div>
                    )}
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div className={`group relative ${msg.role === "user" ? "max-w-[80%] items-end" : "w-full items-start"} flex flex-col gap-1`}>
                {/* Step Plan card — shown when AI returns a numbered step-by-step plan */}
                {msg.role === "assistant" && msg.content.includes("<!-- STEP_PLAN -->") ? (() => {
                  const steps = parseStepPlan(msg.content);
                  const approved = approvedSteps[msg.id] ?? new Set(steps.map((_, i) => i));
                  return (
                    <div className="w-full rounded-xl border border-violet-500/30 bg-card overflow-hidden">
                      <div className="flex items-center gap-2 px-3 py-2 bg-violet-500/10 border-b border-violet-500/20">
                        <ListChecks className="w-3.5 h-3.5 text-violet-400" />
                        <span className="text-xs font-semibold">Step-by-Step Plan</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">{approved.size}/{steps.length} steps selected</span>
                      </div>
                      <div className="px-3 py-2 space-y-1.5">
                        {steps.map((step, idx) => (
                          <button
                            key={idx}
                            onClick={() => toggleStepApproval(msg.id, idx)}
                            className={`w-full flex items-start gap-2.5 px-2.5 py-2 rounded-lg text-left text-xs transition-all border ${
                              approved.has(idx)
                                ? "border-violet-500/40 bg-violet-500/10 text-foreground"
                                : "border-border bg-muted/30 text-muted-foreground line-through"
                            }`}
                          >
                            <span className={`mt-0.5 w-4 h-4 rounded flex items-center justify-center shrink-0 text-[10px] font-bold border ${
                              approved.has(idx) ? "border-violet-400 bg-violet-400 text-white" : "border-border text-muted-foreground"
                            }`}>
                              {approved.has(idx) ? <Check className="w-2.5 h-2.5" /> : idx + 1}
                            </span>
                            <span>{step}</span>
                          </button>
                        ))}
                      </div>
                      <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/20">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1"
                          onClick={() => {
                            const all = new Set(steps.map((_, i) => i));
                            setApprovedSteps((prev) => ({ ...prev, [msg.id]: all }));
                          }}
                        >
                          <CheckCheck className="w-3 h-3" /> Select all
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-7 text-xs gap-1 text-muted-foreground"
                          onClick={() => setApprovedSteps((prev) => ({ ...prev, [msg.id]: new Set() }))}
                        >
                          Clear
                        </Button>
                        <Button
                          size="sm"
                          className="ml-auto h-7 text-xs gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
                          disabled={approved.size === 0}
                          onClick={() => executeApprovedSteps(msg.id, steps)}
                        >
                          <Zap className="w-3 h-3" />
                          Build {approved.size} step{approved.size !== 1 ? "s" : ""}
                        </Button>
                      </div>
                    </div>
                  );
                })() : null}

                {/* Plan card — shown when AI response includes a formal plan */}
                {msg.role === "assistant" && msg.content.includes("<!-- PLAN_READY -->") ? (
                  <div className="w-full rounded-xl border border-border bg-card overflow-hidden">
                    {/* Plan header */}
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b border-border">
                      <FileText className="w-3.5 h-3.5 text-violet-400" />
                      <span className="text-xs font-semibold">Implementation Plan</span>
                      <span className="ml-auto text-[10px] text-muted-foreground">Plan mode · no code changed</span>
                    </div>
                    {/* Plan body */}
                    <div className="px-4 py-3 text-sm leading-relaxed text-foreground">
                      <MessageContent
                        content={msg.content.replace("<!-- PLAN_READY -->", "").trim()}
                        mode="plan"
                      />
                    </div>
                    {/* Approve / build actions */}
                    <div className="flex items-center gap-2 px-3 py-2 border-t border-border bg-muted/20">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs gap-1.5"
                        onClick={() => sendMessage(`Continue refining this plan. Ask me any clarifying questions.`)}
                      >
                        <Pencil className="w-3 h-3" />
                        Refine
                      </Button>
                      <Button
                        size="sm"
                        className="ml-auto h-7 text-xs gap-1.5 bg-[#0066FF] hover:bg-[#0052cc] text-white"
                        onClick={() => {
                          const planMarkdown = msg.content.replace("<!-- PLAN_READY -->", "").trim();
                          onApprovePlan?.(planMarkdown);
                          // Also switch mode to build and send as a build message
                          onModeChange?.("build");
                          void sendMessage(`Implement this approved plan:\n\n${planMarkdown}`, "build");
                        }}
                      >
                        <CheckCheck className="w-3 h-3" />
                        Approve &amp; Build
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className={`text-sm leading-relaxed ${
                    msg.role === "user"
                      ? "px-3.5 py-2.5 rounded-2xl rounded-br-sm bg-muted text-foreground"
                      : "text-foreground py-0.5"
                  }`}>
                    {/*
                      Build-mode rendering: when this assistant message produced
                      files (messageDiffs has entries) AND it's a build/agent/patch
                      message, hide the raw prose+code dump and show only a
                      Lovable-style one-line summary. The detailed diff card
                      below still renders with the file chips. Code goes to the
                      Code tab — chat stays conversational.
                    */}
                    {msg.role === "assistant" &&
                      (msg.mode === "build" || msg.mode === "agent" || msg.mode === "patch") &&
                      messageDiffs[msg.id] && messageDiffs[msg.id].length > 0 ? (
                      <p className="text-sm text-foreground/90 leading-relaxed">
                        {/* Use the first sentence of msg.content as the summary,
                            stripped of any leading "I'll" / "Let's" filler.
                            Falls back to a generic line when the content is
                            empty or starts with a code fence. */}
                        {(() => {
                          const c = (msg.content ?? "").trim();
                          if (!c || c.startsWith("```") || c.startsWith("{")) {
                            const diffCount = messageDiffs[msg.id].length;
                            return `Updated ${diffCount} file${diffCount === 1 ? "" : "s"}. Open the Code tab or preview to see the result.`;
                          }
                          // First sentence, max 220 chars; strip markdown emphasis.
                          const firstSentence = c.split(/(?<=[.!?])\s+/)[0]
                            .replace(/[*_`]/g, "")
                            .slice(0, 220);
                          return firstSentence;
                        })()}
                      </p>
                    ) : (
                      <MessageContent content={msg.content} mode={msg.mode ?? "chat"} />
                    )}
                  </div>
                )}

                {/* Persisted build activity — Lovable-style Complete card in message history */}
                {msg.role === "assistant" && (() => {
                  const steps =
                    messageBuildActivity[msg.id] ??
                    ((msg.metadata as { build_activity?: BuildActivityStep[] } | null)?.build_activity ?? null);
                  if (!steps?.length) return null;
                  return (
                    <div className="w-full mt-1">
                      <BuildActivityCard steps={steps} title="Complete" />
                    </div>
                  );
                })()}

                {/* Commit-title card for build/agent messages with file changes */}
                {msg.role === "assistant" && messageDiffs[msg.id] && messageDiffs[msg.id].length > 0 && (() => {
                  const diffs = messageDiffs[msg.id];

                  // Compute rich diff summary
                  const added   = diffs.filter((d) => !d.oldContent.trim()).length;
                  const modified = diffs.length - added;
                  let linesAdded = 0, linesRemoved = 0;
                  for (const d of diffs) {
                    const oldLines = d.oldContent ? d.oldContent.split("\n").length : 0;
                    const newLines = d.newContent ? d.newContent.split("\n").length : 0;
                    if (newLines > oldLines) linesAdded += newLines - oldLines;
                    else linesRemoved += oldLines - newLines;
                  }

                  // Build human-readable title
                  const parts: string[] = [];
                  if (added > 0)    parts.push(`${added} new`);
                  if (modified > 0) parts.push(`${modified} updated`);
                  const title = diffs.length === 1
                    ? (added ? `Created ${diffs[0].path.split("/").pop()}` : `Updated ${diffs[0].path.split("/").pop()}`)
                    : `${parts.join(", ")} file${diffs.length !== 1 ? "s" : ""}`;

                  // Build stat string
                  const statParts: string[] = [];
                  if (linesAdded > 0)   statParts.push(`+${linesAdded}`);
                  if (linesRemoved > 0) statParts.push(`-${linesRemoved}`);
                  const statStr = statParts.join(" ");

                  return (
                    <div className="w-full mt-1 rounded-lg border border-border/60 bg-muted/20 overflow-hidden">
                      <div className="flex items-center justify-between px-3 py-2">
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-medium truncate block">{title}</span>
                          {statStr && (
                            <span className="text-[10px] text-muted-foreground font-mono">{statStr} lines</span>
                          )}
                        </div>
                        <button
                          onClick={() => toggleBookmark(msg.id)}
                          className={`shrink-0 ml-2 transition-colors ${
                            bookmarkedIds.has(msg.id)
                              ? "text-amber-400 hover:text-amber-300"
                              : "text-muted-foreground hover:text-amber-400"
                          }`}
                          title={bookmarkedIds.has(msg.id) ? "Remove bookmark" : "Bookmark this response"}
                        >
                          <Bookmark className={`w-3.5 h-3.5 ${bookmarkedIds.has(msg.id) ? "fill-amber-400" : ""}`} />
                        </button>
                      </div>
                      {/* Details / Preview tabs */}
                      <div className="flex border-t border-border/40">
                        <button
                          onClick={() =>
                            setExpandedDiffs((prev) => {
                              const next = new Set(prev);
                              next.has(msg.id) ? next.delete(msg.id) : next.add(msg.id);
                              return next;
                            })
                          }
                          className={`flex-1 py-1.5 text-[11px] font-medium transition-colors ${
                            expandedDiffs.has(msg.id)
                              ? "bg-background text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Details
                        </button>
                        <button
                          onClick={() => {
                            setExpandedDiffs((prev) => { const next = new Set(prev); next.delete(msg.id); return next; });
                            onFocusPreview?.();
                          }}
                          className={`flex-1 py-1.5 text-[11px] font-medium transition-colors border-l border-border/40 ${
                            !expandedDiffs.has(msg.id)
                              ? "bg-background text-foreground"
                              : "text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Preview
                        </button>
                      </div>
                      <AnimatePresence>
                        {expandedDiffs.has(msg.id) && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.2 }}
                            className="overflow-hidden border-t border-border/40"
                          >
                            <DiffViewer
                              diffs={messageDiffs[msg.id].map((d) =>
                                computeFileDiff(d.path, d.oldContent, d.newContent)
                              )}
                              compact
                              fileStates={fileStates[msg.id]}
                              onAccept={(path) =>
                                setFileStates((prev) => ({
                                  ...prev,
                                  [msg.id]: { ...(prev[msg.id] ?? {}), [path]: "accepted" },
                                }))
                              }
                              onRevert={(path, oldContent) => {
                                const diff = messageDiffs[msg.id].find((d) => d.path === path);
                                if (diff) void handleRevertFile(msg.id, { ...diff, oldContent });
                              }}
                              onReApply={(path, newContent) => {
                                const diff = messageDiffs[msg.id].find((d) => d.path === path);
                                if (diff) void handleReApplyFile(msg.id, { ...diff, newContent });
                              }}
                            />
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })()}

                {/* Preview snapshot thumbnail — shown after build/agent generations */}
                {msg.role === "assistant" && messageScreenshots[msg.id] && (
                  <div className="w-full mt-1.5 rounded-lg overflow-hidden border border-border/50 bg-muted/10 group/thumb">
                    <div className="flex items-center justify-between px-3 py-1.5 border-b border-border/30">
                      <span className="text-[10px] text-muted-foreground/60 flex items-center gap-1.5">
                        <Globe className="w-3 h-3" />
                        Preview snapshot
                      </span>
                      <button
                        onClick={() =>
                          window.dispatchEvent(
                            new CustomEvent("lifemark-request-screenshot", { detail: { messageId: msg.id } })
                          )
                        }
                        className="text-[10px] text-muted-foreground/40 hover:text-foreground transition-colors px-1.5 py-0.5 rounded hover:bg-white/10"
                        title="Re-capture current preview"
                      >
                        Refresh
                      </button>
                    </div>
                    <div className="relative overflow-hidden max-h-36 group-hover/thumb:max-h-64 transition-all duration-300">
                      <img
                        src={messageScreenshots[msg.id]}
                        alt="App preview at this point in time"
                        className="w-full h-auto object-cover object-top"
                        style={{ imageRendering: "crisp-edges" }}
                      />
                      <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-background/80 to-transparent group-hover/thumb:opacity-0 transition-opacity pointer-events-none" />
                    </div>
                  </div>
                )}

                {/* Action bar — hover-only for both roles */}
                <div className={`flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${
                  msg.role === "assistant" ? "self-start" : "self-end"
                }`}>
                  {/* Timestamp */}
                  {msg.created_at && (
                    <span className="text-[10px] text-muted-foreground/50 px-1 select-none mr-1">
                      {formatMsgTime(msg.created_at)}
                    </span>
                  )}
                  {/* AI model badge */}
                  {msg.role === "assistant" && msg.model && (
                    <span
                      className="text-[10px] text-muted-foreground/40 px-1.5 py-0.5 rounded border border-border/30 select-none font-mono"
                      title={`Generated by ${msg.model}`}
                    >
                      {msg.model.includes("claude") ? "Claude" : msg.model.includes("gpt-4o-mini") ? "GPT-4o mini" : msg.model.includes("gpt-4o") ? "GPT-4o" : msg.model.includes("gpt-4") ? "GPT-4" : msg.model}
                    </span>
                  )}
                  {/* Auto-attached skills — matches Lovable's "using skill: X" chip */}
                  {msg.role === "assistant" && messageSkills[msg.id]?.length > 0 && messageSkills[msg.id].map((s) => (
                    <span
                      key={s.id}
                      className="text-[10px] px-1.5 py-0.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300 select-none"
                      title={s.reason ? `Auto-attached skill — ${s.reason}` : "Auto-attached skill"}
                    >
                      ⚡ {s.name}
                    </span>
                  ))}
                  {/* Credit cost badge — Lovable-style per-message cost */}
                  {msg.role === "assistant" && messageCredits[msg.id] != null && (
                    <span
                      className="text-[10px] text-muted-foreground/50 px-1.5 py-0.5 rounded border border-border/30 select-none"
                      title="Credits used for this message"
                    >
                      {messageCredits[msg.id]} credit{messageCredits[msg.id] === 1 ? "" : "s"}
                    </span>
                  )}
                  {/* AI thinking time badge */}
                  {msg.role === "assistant" && genTimes[msg.id] != null && (
                    <span className="text-[10px] text-muted-foreground/40 px-0.5 select-none" title="AI generation time">
                      ⚡ {genTimes[msg.id]}s
                    </span>
                  )}
                  {/* Token usage badge */}
                  {msg.role === "assistant" && msg.tokens_used != null && msg.tokens_used > 0 && (
                    <span
                      className="text-[10px] text-muted-foreground/35 px-1 select-none font-mono"
                      title={`${msg.tokens_used.toLocaleString()} tokens used`}
                    >
                      {msg.tokens_used >= 1000
                        ? `${(msg.tokens_used / 1000).toFixed(1)}k tok`
                        : `${msg.tokens_used} tok`}
                    </span>
                  )}
                  {/* Edit message (user messages only) */}
                  {msg.role === "user" && !streaming && editingMessageId !== msg.id && (
                    <button
                      onClick={() => startEditMessage(msg)}
                      className="p-1 rounded hover:bg-white/10 transition-colors"
                      title="Edit message"
                    >
                      <Pencil className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                    </button>
                  )}
                  <button
                    onClick={() => copyMessage(msg.content, msg.id)}
                    className="p-1 rounded hover:bg-white/10 transition-colors"
                    title="Copy"
                  >
                    {copiedId === msg.id
                      ? <Check className="w-3.5 h-3.5 text-green-500" />
                      : <Copy className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                    }
                  </button>
                  {/* Thumbs up/down (assistant messages only) */}
                  {msg.role === "assistant" && (
                    <>
                      {/* Pin / unpin */}
                      <button
                        onClick={() => setPinnedMsgId((prev) => prev === msg.id ? null : msg.id)}
                        className="p-1 rounded hover:bg-white/10 transition-colors"
                        title={pinnedMsgId === msg.id ? "Unpin message" : "Pin message"}
                      >
                        {pinnedMsgId === msg.id
                          ? <PinOff className="w-3.5 h-3.5 text-violet-400" />
                          : <Pin className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground" />
                        }
                      </button>
                      <button
                        onClick={() => void rateMessage(msg.id, 1)}
                        className="p-1 rounded hover:bg-white/10 transition-colors"
                        title="Good response"
                      >
                        <ThumbsUp className={`w-3.5 h-3.5 transition-colors ${ratings[msg.id] === 1 ? "text-green-400 fill-green-400" : "text-muted-foreground hover:text-foreground"}`} />
                      </button>
                      <button
                        onClick={() => void rateMessage(msg.id, -1)}
                        className="p-1 rounded hover:bg-white/10 transition-colors"
                        title="Poor response"
                      >
                        <ThumbsDown className={`w-3.5 h-3.5 transition-colors ${ratings[msg.id] === -1 ? "text-red-400 fill-red-400" : "text-muted-foreground hover:text-foreground"}`} />
                      </button>
                      {/* Save as skill — turns a useful answer into a reusable playbook */}
                      <button
                        onClick={() => {
                          // Find the preceding user message so we can suggest a description.
                          const idx = messages.findIndex((m) => m.id === msg.id);
                          const prevUser = idx > 0
                            ? [...messages.slice(0, idx)].reverse().find((m) => m.role === "user")
                            : null;
                          // Derive a name from the first 60 chars of the user prompt, falling
                          // back to "Saved skill" so the modal always has a sensible default.
                          const suggestedName = prevUser?.content?.slice(0, 60).trim() || "Saved skill";
                          setSaveSkillDraft({
                            sourceMessageId: msg.id,
                            name: suggestedName,
                            description: prevUser?.content?.slice(0, 200) ?? "",
                            prompt: msg.content,
                          });
                        }}
                        className="p-1 rounded hover:bg-white/10 transition-colors"
                        title="Save as a reusable skill"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-muted-foreground hover:text-violet-400 transition-colors" />
                      </button>
                      {/* Quick emoji reactions */}
                      {msg.role === "assistant" && (
                        <div className="flex items-center gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {QUICK_EMOJI.map((emoji) => (
                            <button
                              key={emoji}
                              onClick={() => toggleReaction(msg.id, emoji)}
                              className={`text-[13px] px-0.5 rounded transition-all hover:scale-125 ${
                                reactions[msg.id]?.has(emoji) ? "opacity-100" : "opacity-40 hover:opacity-100"
                              }`}
                              title={`React with ${emoji}`}
                            >
                              {emoji}
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                </div>

                {/* Active reactions display */}
                {msg.role === "assistant" && reactions[msg.id] && reactions[msg.id].size > 0 && (
                  <div className="flex items-center gap-1 mt-1 flex-wrap">
                    {QUICK_EMOJI.filter((e) => reactions[msg.id]?.has(e)).map((emoji) => (
                      <button
                        key={emoji}
                        onClick={() => toggleReaction(msg.id, emoji)}
                        className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-xs bg-muted/60 border border-border/60 hover:bg-muted transition-colors"
                        title="Click to remove"
                      >
                        <span>{emoji}</span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Inline edit input */}
                {editingMessageId === msg.id && (
                  <div className="mt-2 space-y-1.5 w-full">
                    <Textarea
                      value={editInput}
                      onChange={(e) => setEditInput(e.target.value)}
                      className="text-xs bg-muted/50 border-white/10 resize-none min-h-[60px]"
                      autoFocus
                    />
                    <div className="flex gap-1.5">
                      <Button size="sm" className="h-6 text-xs px-2 bg-violet-600 hover:bg-violet-500 text-white" onClick={submitEditedMessage}>
                        Regenerate
                      </Button>
                      <Button size="sm" variant="ghost" className="h-6 text-xs px-2" onClick={() => setEditingMessageId(null)}>
                        Cancel
                      </Button>
                    </div>
                  </div>
                )}
                {/* Regenerate button — only on the last assistant message */}
                {msg.role === "assistant" && (() => {
                  const lastAsstId = [...messages].filter((m) => m.role === "assistant").pop()?.id;
                  return lastAsstId === msg.id && !streaming && !showBookmarks && !searchQuery;
                })() && (
                  <button
                    onClick={() => void handleRegenerate()}
                    className="flex items-center gap-1.5 mt-1 px-2.5 py-1 text-[11px] text-muted-foreground hover:text-foreground border border-border/40 hover:border-border rounded-full bg-muted/20 hover:bg-muted/40 transition-colors"
                    title="Regenerate response"
                  >
                    <RefreshCw className="w-3 h-3" />
                    Regenerate
                  </button>
                )}

                {/* Follow-up suggestion chips */}
                {msg.role === "assistant" && suggestions[msg.id] && suggestions[msg.id].length > 0 && !streaming && (
                  <AnimatePresence>
                    {/* Multi-role re-check chips — show when build touched 5+ files and project has multiple roles */}
                    {roleTestChips[msg.id] && roleTestChips[msg.id].length > 0 && (
                      <motion.div
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.1 }}
                        className="mt-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] px-2.5 py-2"
                      >
                        <div className="text-[10px] text-emerald-300 font-semibold mb-1.5 flex items-center gap-1">
                          <Sparkles className="w-2.5 h-2.5" />
                          Big change — re-test by role
                        </div>
                        <div className="flex flex-wrap gap-1.5">
                          {roleTestChips[msg.id].map((chip) => (
                            <button
                              key={chip}
                              onClick={() => {
                                setRoleTestChips((prev) => { const n = { ...prev }; delete n[msg.id]; return n; });
                                // Frame the message so the AI generates real test code targeting the named role
                                const role = chip.replace(/^Test the new changes as the\s+/i, "").replace(/\s+role$/i, "");
                                const framed = `Generate browser tests (Playwright-style) that validate the recent changes for the ${role} role specifically. Cover: 1) login/auth scenarios for ${role}, 2) which routes ${role} can/cannot reach, 3) UI elements that should be visible/hidden for ${role}, 4) any role-specific actions. After writing the tests, summarize what to run them against.`;
                                void sendMessage(framed);
                              }}
                              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-200 transition-colors"
                              title="Generates Playwright test code for this role, then opens the Browser Testing panel"
                            >
                              {chip}
                            </button>
                          ))}
                          <button
                            onClick={() => {
                              setRoleTestChips((prev) => { const n = { ...prev }; delete n[msg.id]; return n; });
                              onOpenPanel?.("testing");
                            }}
                            className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-emerald-500/20 bg-transparent hover:bg-emerald-500/5 text-emerald-300/70 hover:text-emerald-200 transition-colors"
                            title="Skip the chips — open the Browser Testing panel directly"
                          >
                            ↗ Open testing panel
                          </button>
                        </div>
                      </motion.div>
                    )}
                    <motion.div
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: 0.15 }}
                      className="flex flex-wrap gap-1.5 mt-2"
                    >
                      {suggestions[msg.id].map((chip) => (
                        <button
                          key={chip}
                          onClick={() => {
                            setSuggestions((prev) => { const n = { ...prev }; delete n[msg.id]; return n; });
                            void sendMessage(chip);
                          }}
                          className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-border bg-muted/40 hover:bg-muted hover:border-primary/30 text-muted-foreground hover:text-foreground transition-colors"
                        >
                          <Sparkles className="w-2.5 h-2.5 text-violet-400 flex-shrink-0" />
                          {chip}
                        </button>
                      ))}
                    </motion.div>
                  </AnimatePresence>
                )}
              </div>
            </motion.div>
                  </div>
                );
                })}
              </AnimatePresence>
            </div>
          );
        })}

        {/* Analyze-data result cards — render each completed /api/ai/analyze run */}
        {analyzeResults.map((r) => (
          <motion.div
            key={r.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex justify-start"
          >
            <div className="w-full max-w-full space-y-2 rounded-2xl border border-violet-500/20 bg-violet-500/5 p-3">
              <div className="flex items-center gap-2 text-[11px]">
                <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-400"><path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-5"/></svg>
                <span className="font-medium text-violet-300">Data analysis</span>
                <span className="text-muted-foreground">· {new Date(r.createdAt).toLocaleTimeString()}</span>
                <button
                  onClick={() => setAnalyzeResults((prev) => prev.filter((x) => x.id !== r.id))}
                  className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
                  title="Dismiss"
                >
                  Dismiss
                </button>
              </div>
              <p className="text-xs text-foreground/90 italic">&ldquo;{r.instruction}&rdquo;</p>
              {r.stdout && (
                <pre className="text-[11px] font-mono whitespace-pre-wrap bg-background/60 border border-border/40 rounded-lg p-2 max-h-32 overflow-y-auto">
                  {r.stdout}
                </pre>
              )}
              {r.stderr && (
                <details className="text-[10px]">
                  <summary className="cursor-pointer text-red-400 hover:text-red-300">View errors</summary>
                  <pre className="font-mono whitespace-pre-wrap bg-red-500/5 border border-red-500/20 rounded-lg p-2 mt-1 max-h-32 overflow-y-auto">
                    {r.stderr}
                  </pre>
                </details>
              )}
              {r.files.length > 0 && (
                <FileAttachmentList
                  files={r.files}
                  caption={`${r.files.length} file${r.files.length === 1 ? "" : "s"} generated`}
                  onSaveToProject={async (file) => {
                    try {
                      const res = await fetch(`/api/projects/${project.id}/files`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          path: `generated/${file.name}`,
                          // Binary files lose meaning as plain text; store base64 verbatim so
                          // a future file-render layer can decode it. This keeps the existing
                          // project_files schema (text-only) workable.
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
                  }}
                />
              )}
            </div>
          </motion.div>
        ))}

        {/* Streaming message — Lovable-style thought trace + prose + Working/Edited cards */}
        {streaming && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex justify-start">
            <div className="w-full space-y-2">
              {thoughtSeconds > 0 && !extractStreamingProse(streamingContent) && streamingFiles.length === 0 && (
                <p className="text-xs text-muted-foreground/70 px-1">
                  Thought for {thoughtSeconds}s
                </p>
              )}

              {pendingSkills.length > 0 && (
                <div className="flex flex-wrap items-center gap-1">
                  {pendingSkills.map((s) => (
                    <span
                      key={s.id}
                      className="text-[10px] px-2 py-0.5 rounded-full border border-violet-500/30 bg-violet-500/10 text-violet-300"
                      title={s.reason ? `Auto-attached skill — ${s.reason}` : "Auto-attached skill"}
                    >
                      ⚡ Using skill: {s.name}
                    </span>
                  ))}
                </div>
              )}
              {/* Agent task step visibility card */}
              <AnimatePresence>
                {agentSteps.length > 0 && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden mb-1">
                      <div className="flex items-center gap-2 px-3 py-1.5 border-b border-border/40 bg-muted/30">
                        <Loader2 className="w-3 h-3 animate-spin text-violet-400 shrink-0" />
                        <span className="text-[11px] font-semibold text-foreground">Agent working…</span>
                        <span className="ml-auto text-[10px] text-muted-foreground">
                          {agentSteps.filter((s) => s.status === "done").length}/{agentSteps.length} steps
                        </span>
                      </div>
                      <div className="px-3 py-2 space-y-1.5">
                        {agentSteps.map((step, i) => (
                          <div key={i} className="flex items-center gap-2 text-xs">
                            {step.status === "done"
                              ? <Check className="w-3 h-3 text-green-400 shrink-0" />
                              : <Loader2 className="w-3 h-3 animate-spin text-violet-400 shrink-0" />
                            }
                            <span className={step.status === "done" ? "text-muted-foreground" : "text-foreground"}>
                              {step.label}
                            </span>
                            {step.detail && (
                              <span className="ml-auto font-mono text-[10px] text-muted-foreground truncate max-w-[120px]">
                                {step.detail}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Subagent investigation card */}
              {subagentSteps.length > 0 && (
                <SubagentActivityCard steps={subagentSteps} />
              )}

              {/* Preview verification after build */}
              {previewVerify && (
                <div className={`rounded-xl border overflow-hidden mb-1 ${previewVerify.ok ? "border-green-500/30 bg-green-500/5" : "border-amber-500/30 bg-amber-500/5"}`}>
                  <div className="px-3 py-2 text-xs font-semibold">
                    {previewVerify.ok ? "Preview verified" : "Preview check — review suggested"}
                  </div>
                  <div className="px-3 pb-2 space-y-0.5">
                    {previewVerify.checks.map((c) => (
                      <div key={c.name} className="text-[10px] text-muted-foreground flex gap-1.5">
                        <span className={c.pass ? "text-green-400" : "text-amber-400"}>{c.pass ? "✓" : "!"}</span>
                        <span>{c.name}{c.detail ? ` — ${c.detail}` : ""}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Conversational intro — visible during build (Lovable shows prose before Working card) */}
              {extractStreamingProse(streamingContent) && (
                <p className="text-sm text-foreground/90 leading-relaxed px-1">
                  {extractStreamingProse(streamingContent)}
                </p>
              )}

              {/* Lovable-style build activity steps — real progress, not rotating placeholders */}
              {buildActivitySteps.length > 0 && (
                <BuildActivityCard steps={buildActivitySteps} />
              )}

              {/* Lovable-style per-file "Edited …" cards */}
              {streamingFiles.length > 0 && streamingFiles.map((path, idx) => {
                const fileName = path.split("/").pop() ?? path;
                return (
                  <div
                    key={`${path}-${idx}`}
                    className="rounded-xl border border-border/60 bg-muted/20 overflow-hidden mb-1"
                  >
                    <div className="px-3 py-2 border-b border-border/40 bg-muted/30">
                      <span className="text-sm font-semibold text-foreground">
                        Edited {fileName}
                      </span>
                    </div>
                  </div>
                );
              })}

              {/* Hide raw JSON stream in build mode — chat stays conversational like Lovable */}
              <div className="text-sm leading-relaxed py-0.5">
                {(mode === "build" || mode === "patch" || buildStatus) ? null : streamingContent ? (
                  <MessageContent content={streamingContent} mode={mode} />
                ) : (
                  <div className="flex items-center gap-1.5 py-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 typing-dot" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 typing-dot" />
                    <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground/50 typing-dot" />
                  </div>
                )}
              </div>
              {/* Real-time file generation progress (chat/agent modes) */}
              <AnimatePresence>
                {streamingFiles.length > 0 && agentSteps.length === 0 && mode !== "build" && mode !== "patch" && !buildStatus && (
                  <motion.div
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="px-2 py-1.5 rounded-lg bg-violet-500/10 border border-violet-500/20 font-mono text-[10px] space-y-0.5">
                      <div className="text-violet-400 flex items-center gap-1 mb-1">
                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                        Generating files…
                      </div>
                      {streamingFiles.map((path) => (
                        <div key={path} className="flex items-center gap-1 text-violet-300/70">
                          <span className="text-violet-500">+</span>
                          <span className="truncate">{path}</span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          </motion.div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Scroll-to-bottom floating button */}
      {!isAtBottom && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0, scale: 0.8 }}
          transition={{ duration: 0.15 }}
          onClick={() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })}
          className="absolute bottom-3 right-4 z-10 w-8 h-8 rounded-full bg-card border border-border shadow-md flex items-center justify-center hover:bg-accent transition-colors"
          title="Scroll to bottom"
        >
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </motion.button>
      )}
      </div>{/* end messages wrapper */}

      {/* Auto-fix banner */}
      {autoFixing && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-violet-500/10 border border-violet-500/20 flex items-center gap-2 text-xs text-violet-400">
          <Wand2 className="w-3.5 h-3.5 shrink-0 animate-pulse" />
          Auto-fixing preview error… (attempt {autoFixAttempts}/{MAX_AUTO_FIX_ATTEMPTS})
        </div>
      )}

      {/* Loop-detection nudge (when max attempts reached) — Lovable's recovery flow */}
      {previewError && !noCredits && autoFixAttempts >= MAX_AUTO_FIX_ATTEMPTS && !autoFixing && (
        <div className="mx-3 mb-2 px-3 py-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs">
          <div className="flex items-start gap-2 mb-2">
            <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-0.5 text-amber-400" />
            <div className="flex-1">
              <div className="font-semibold text-amber-200 mb-0.5">Looks like we're in a fix loop.</div>
              <div className="text-amber-200/70 leading-snug">
                Switch to Plan mode, share the error, and ask the AI to investigate without breaking other features.
              </div>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5 pl-5">
            <button
              onClick={() => {
                onModeChange?.("plan");
                setInput(`Please investigate this error without breaking other features. If needed, revert to the last working version and fix from there.\n\nError:\n${(previewError ?? "").slice(0, 600)}`);
                setTimeout(() => textareaRef.current?.focus(), 50);
                setAutoFixAttempts(0);
              }}
              className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-200 border border-amber-500/40 hover:bg-amber-500/30 transition-colors"
            >
              📋 Switch to Plan mode
            </button>
            <button
              onClick={() => onOpenPanel?.("history")}
              className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300/80 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
            >
              ⏪ Restore last snapshot
            </button>
            <button
              onClick={() => {
                setInput(`Suggest 3 ways to solve this without changing anything yet:\n\n${(previewError ?? "").slice(0, 600)}`);
                setTimeout(() => textareaRef.current?.focus(), 50);
                setAutoFixAttempts(0);
              }}
              className="text-[10px] px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-300/80 border border-amber-500/30 hover:bg-amber-500/20 transition-colors"
            >
              💡 Suggest 3 ways
            </button>
            <button
              onClick={() => setAutoFixAttempts(0)}
              className="text-[10px] px-2 py-0.5 rounded-full text-muted-foreground hover:text-foreground transition-colors"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {/* No credits warning */}
      {noCredits && (
        <div className="mx-3 mb-2 px-3 py-2 rounded-lg bg-destructive/10 border border-destructive/20 flex items-center gap-2 text-xs text-destructive">
          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
          No credits remaining. Upgrade your plan or wait until tomorrow.
        </div>
      )}

      {/* ── Prompt queue — shown above input when AI is busy ── */}
      <AnimatePresence>
        {/* ── Clarify Session Cards ── */}
        {activeClarifySession && (
          <div className="mx-3 mb-2 rounded-xl border border-violet-500/30 bg-violet-500/5 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-violet-500/20">
              <Brain className="w-3.5 h-3.5 text-violet-400" />
              <span className="text-xs font-medium text-violet-300">A few quick questions before building</span>
              <button
                onClick={() => setActiveClarifySession(null)}
                className="ml-auto text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="p-3 space-y-3">
              {activeClarifySession.questions.map((q, qi) => (
                <div key={q.id} className="space-y-1.5">
                  <label className="text-[11px] font-medium text-foreground/80">
                    {qi + 1}. {q.question}
                  </label>
                  {q.type === "choice" && q.options ? (
                    <div className="flex flex-wrap gap-1.5">
                      {q.options.map((opt) => (
                        <button
                          key={opt}
                          onClick={() => setActiveClarifySession((prev) =>
                            prev ? {
                              ...prev,
                              questions: prev.questions.map((cq) =>
                                cq.id === q.id ? { ...cq, answer: opt } : cq
                              ),
                            } : null
                          )}
                          className={`text-[10px] px-2 py-1 rounded-full border transition-colors ${
                            q.answer === opt
                              ? "border-violet-500 bg-violet-500/20 text-violet-300"
                              : "border-border text-muted-foreground hover:border-violet-500/50 hover:text-foreground"
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <input
                      type="text"
                      value={q.answer}
                      onChange={(e) => {
                        const val = e.target.value;
                        setActiveClarifySession((prev) =>
                          prev ? {
                            ...prev,
                            questions: prev.questions.map((cq) =>
                              cq.id === q.id ? { ...cq, answer: val } : cq
                            ),
                          } : null
                        );
                      }}
                      placeholder="Your answer…"
                      className="w-full text-xs bg-background border border-border rounded-md px-2.5 py-1.5 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-violet-500/50"
                    />
                  )}
                </div>
              ))}
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => {
                    if (!activeClarifySession) return;
                    const answersBlock = activeClarifySession.questions
                      .filter((q) => q.answer.trim())
                      .map((q) => `- ${q.question}: ${q.answer}`)
                      .join("\n");
                    const enrichedPrompt = answersBlock
                      ? activeClarifySession.originalPrompt + "\n\nAdditional context:\n" + answersBlock
                      : activeClarifySession.originalPrompt;
                    setActiveClarifySession(null);
                    setClarifyFirst(false);
                    void sendMessage(enrichedPrompt, "build");
                  }}
                  className="h-7 text-xs gap-1.5 bg-violet-600 hover:bg-violet-500 text-white"
                >
                  <Sparkles className="w-3 h-3" />
                  Build now
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    if (!activeClarifySession) return;
                    setActiveClarifySession(null);
                    setClarifyFirst(false);
                    void sendMessage(activeClarifySession.originalPrompt, "build");
                  }}
                  className="h-7 text-xs text-muted-foreground"
                >
                  Skip & build
                </Button>
              </div>
            </div>
          </div>
        )}

                {promptQueue.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="mx-3 mt-2 mb-1 rounded-xl border border-border bg-muted/10 overflow-hidden">
              {/* Queue header */}
              <div className="flex items-center gap-2 px-3 py-1.5 bg-muted/30 border-b border-border/50">
                <span className="text-[11px] font-semibold text-muted-foreground">
                  Queue · {promptQueue.length} waiting
                </span>
                {streaming && (
                  <span className="flex items-center gap-1 text-[10px] text-violet-400">
                    <Loader2 className="w-2.5 h-2.5 animate-spin" />
                    Processing…
                  </span>
                )}
                <div className="ml-auto flex items-center gap-1">
                  <button
                    onClick={() => setQueuePaused((v) => !v)}
                    className="flex items-center gap-1 h-5 px-2 rounded text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                    title={queuePaused ? "Resume queue" : "Pause queue"}
                  >
                    {queuePaused
                      ? <><Play className="w-2.5 h-2.5" />Resume</>
                      : <><Pause className="w-2.5 h-2.5" />Pause</>
                    }
                  </button>
                  <button
                    onClick={() => { setPromptQueue([]); setEditingQueueId(null); }}
                    className="h-5 px-2 rounded text-[10px] text-muted-foreground hover:text-destructive hover:bg-muted transition-colors"
                    title="Clear all queued prompts"
                  >
                    Clear all
                  </button>
                </div>
              </div>
              {/* Queue items */}
              <div className="divide-y divide-border/30 max-h-44 overflow-y-auto">
                {promptQueue.map((item, idx) => (
                  <div key={item.id} className="flex items-start gap-1.5 px-2 py-2 group">
                    {/* Reorder buttons */}
                    <div className="flex flex-col gap-0.5 mt-0.5 shrink-0">
                      <button
                        onClick={() => setPromptQueue((prev) => {
                          if (idx === 0) return prev;
                          const next = [...prev];
                          [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
                          return next;
                        })}
                        disabled={idx === 0}
                        className="p-0.5 rounded hover:bg-muted disabled:opacity-20 transition-colors"
                        title="Move up"
                      >
                        <ChevronUp className="w-2.5 h-2.5 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => setPromptQueue((prev) => {
                          if (idx === prev.length - 1) return prev;
                          const next = [...prev];
                          [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
                          return next;
                        })}
                        disabled={idx === promptQueue.length - 1}
                        className="p-0.5 rounded hover:bg-muted disabled:opacity-20 transition-colors"
                        title="Move down"
                      >
                        <ChevronDown className="w-2.5 h-2.5 text-muted-foreground" />
                      </button>
                    </div>

                    {/* Prompt text or inline editor */}
                    <div className="flex-1 min-w-0">
                      {editingQueueId === item.id ? (
                        <div className="space-y-1">
                          <Textarea
                            value={editingQueueText}
                            onChange={(e) => setEditingQueueText(e.target.value)}
                            className="text-xs bg-background border-border resize-none min-h-[40px] py-1 px-2"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === "Enter" && !e.shiftKey) {
                                e.preventDefault();
                                if (editingQueueText.trim()) {
                                  setPromptQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, text: editingQueueText.trim() } : q));
                                }
                                setEditingQueueId(null);
                              }
                              if (e.key === "Escape") setEditingQueueId(null);
                            }}
                          />
                          <div className="flex gap-1">
                            <Button size="sm" className="h-5 text-[10px] px-2 bg-violet-600 hover:bg-violet-500 text-white"
                              onClick={() => {
                                if (editingQueueText.trim()) {
                                  setPromptQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, text: editingQueueText.trim() } : q));
                                }
                                setEditingQueueId(null);
                              }}>
                              Save
                            </Button>
                            <Button size="sm" variant="ghost" className="h-5 text-[10px] px-2"
                              onClick={() => setEditingQueueId(null)}>
                              Cancel
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="flex items-start gap-1">
                          <span className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2 flex-1">{item.text}</span>
                          {item.repeat > 1 && (
                            <span className="shrink-0 text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-400 font-mono">
                              &times;{item.remaining}
                            </span>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Action buttons — visible on hover */}
                    <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity mt-0.5">
                      <button
                        onClick={() => { setEditingQueueId(item.id); setEditingQueueText(item.text); }}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title="Edit prompt"
                      >
                        <Pencil className="w-2.5 h-2.5 text-muted-foreground" />
                      </button>
                      {/* Repeat — cycle through 1→2→3→5→10 */}
                      <button
                        onClick={() => setPromptQueue((prev) => prev.map((q) => {
                          if (q.id !== item.id) return q;
                          const nextRepeat = q.repeat === 1 ? 2 : q.repeat === 2 ? 3 : q.repeat === 3 ? 5 : q.repeat === 5 ? 10 : 1;
                          return { ...q, repeat: nextRepeat, remaining: nextRepeat };
                        }))}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title={`Repeat: x${item.repeat} — click to cycle`}
                      >
                        <RefreshCw className={`w-2.5 h-2.5 ${item.repeat > 1 ? "text-violet-400" : "text-muted-foreground"}`} />
                      </button>
                      <button
                        onClick={() => void navigator.clipboard.writeText(item.text)}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title="Copy prompt"
                      >
                        <Copy className="w-2.5 h-2.5 text-muted-foreground" />
                      </button>
                      <button
                        onClick={() => setPromptQueue((prev) => prev.filter((q) => q.id !== item.id))}
                        className="p-1 rounded hover:bg-muted transition-colors"
                        title="Remove from queue"
                      >
                        <XCircle className="w-2.5 h-2.5 text-muted-foreground hover:text-destructive" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Quick prompt pills — shown above input when chat is empty ── */}
      {messages.length === 0 && !streaming && (
        <div className="px-3 pt-2 pb-1 flex gap-1.5 flex-wrap shrink-0">
          {contextualEmptyPrompts.slice(0, 4).map((label) => (
            <button
              key={label}
              onClick={() => { setInput(label); setTimeout(() => textareaRef.current?.focus(), 0); }}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-border/60 bg-muted/20 hover:bg-muted/60 hover:border-violet-500/40 text-muted-foreground hover:text-foreground transition-all"
            >
              <span>→</span>
              <span>{label.length > 28 ? `${label.slice(0, 28)}…` : label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Stuck? guarded-prompt chips — hidden when out of credits (can't run AI fixes) ── */}
      {!streaming && !noCredits && (
        <div className="px-3 pt-1 pb-1 flex gap-1.5 flex-wrap shrink-0">
          {[
            {
              label: "Investigate, don't code",
              icon: "🔍",
              prompt: "Investigate this without writing code yet. Walk me through what you find before suggesting changes.",
              tooltip: "Keeps the AI in read-only mode while you diagnose",
            },
            {
              label: "Suggest 3 ways",
              icon: "💡",
              prompt: "Suggest 3 ways to solve this without changing anything. Compare trade-offs for each.",
              tooltip: "Explore options before committing to one",
            },
            {
              label: "Revert + fix",
              icon: "↩️",
              prompt: "Please investigate this without breaking other features. If needed, revert to the last working version and fix from there.",
              tooltip: "Use after 2+ failed fix attempts",
            },
            {
              label: "Role-isolated",
              icon: "👤",
              prompt: "Implement this for the [ROLE] role only. Do not reuse shared components unless clearly scoped. Other roles must not be affected.",
              tooltip: "Replace [ROLE] with your role name (Admin, User, etc.)",
            },
            {
              label: "Break it down",
              icon: "🧩",
              prompt: `Break this feature into small, testable steps. Use this template:

1. Create the new page (route + skeleton)
2. Add UI layout (no logic yet)
3. Connect the data (queries/mutations)
4. Add logic + edge cases
5. Test per role

Feature: [DESCRIBE YOUR FEATURE HERE]

Please confirm the breakdown before implementing anything.`,
              tooltip: "Lovable feature-breakdown template — keeps the AI from doing everything at once",
            },
          ].map(({ label, icon, prompt, tooltip }) => (
            <button
              key={label}
              title={tooltip}
              onClick={() => {
                setInput(prompt);
                setTimeout(() => textareaRef.current?.focus(), 0);
              }}
              className="flex items-center gap-1 text-[11px] px-2.5 py-1 rounded-full border border-amber-500/25 bg-amber-500/[0.04] hover:bg-amber-500/10 hover:border-amber-500/40 text-amber-200/80 hover:text-amber-100 transition-all"
            >
              <span>{icon}</span>
              <span>{label}</span>
            </button>
          ))}
        </div>
      )}

      {/* ── Lovable-style input area ── */}
      <div
        className="px-3 pb-4 pt-2 border-t border-border/50 shrink-0 relative bg-background/50"
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={(e) => {
          if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDragging(false);
        }}
        onDrop={handleDrop}
      >
        {/* Drag-and-drop overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-20 flex items-center justify-center rounded-xl border-2 border-dashed border-violet-500 bg-violet-500/10 backdrop-blur-[1px] pointer-events-none">
            <div className="flex flex-col items-center gap-1.5 text-violet-400">
              <Wand2 className="w-6 h-6" />
              <span className="text-xs font-semibold">Drop mockup or file</span>
              <span className="text-[10px] text-violet-400/70">Image → AI generates matching UI</span>
            </div>
          </div>
        )}

        {/* Attached image preview — mockup-to-code panel */}
        {attachedImage && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="mb-2 rounded-xl border border-violet-500/30 bg-violet-500/5 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-violet-500/20 bg-violet-500/10">
              <div className="flex items-center gap-1.5">
                <Wand2 className="w-3 h-3 text-violet-400" />
                <span className="text-[11px] font-semibold text-violet-300">Mockup detected</span>
                {attachedImageName && (
                  <span className="text-[10px] text-violet-400/60 font-mono truncate max-w-[120px]">{attachedImageName}</span>
                )}
              </div>
              <button
                onClick={() => { setAttachedImage(null); setAttachedImageName(null); }}
                className="text-violet-400/60 hover:text-violet-300 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Body */}
            <div className="flex gap-3 p-2.5">
              {/* Thumbnail */}
              <div className="relative flex-shrink-0">
                <img
                  src={attachedImage}
                  alt="Mockup"
                  className="h-20 w-auto max-w-[120px] rounded-lg border border-violet-500/20 object-cover shadow-sm"
                />
              </div>
              {/* Actions */}
              <div className="flex flex-col justify-center gap-1.5 flex-1 min-w-0">
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  AI will recreate this UI as React + Tailwind code. You can add instructions below or send as-is.
                </p>
                <div className="flex flex-wrap gap-1">
                  <button
                    onClick={() => setChatAnnotateOpen(true)}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/30 hover:bg-rose-500/30 transition-colors"
                  >
                    ✏️ Draw on image
                  </button>
                  <button
                    onClick={() => {
                      setInput("Recreate this UI exactly. Match every layout detail, color, typography, spacing, and component.");
                      setTimeout(() => textareaRef.current?.focus(), 50);
                    }}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 transition-colors"
                  >
                    ✦ Clone exactly
                  </button>
                  <button
                    onClick={() => {
                      setInput("Recreate this design but make it mobile-responsive and accessible. Use shadcn/ui components where appropriate.");
                      setTimeout(() => textareaRef.current?.focus(), 50);
                    }}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
                  >
                    📱 Mobile-first
                  </button>
                  <button
                    onClick={() => {
                      setInput("Take inspiration from this design and create a modern, polished version with animations and dark mode support.");
                      setTimeout(() => textareaRef.current?.focus(), 50);
                    }}
                    className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
                  >
                    ✨ Modernize
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* Attached text/code file preview */}
        {attachedText && (
          <div className="mb-2 flex items-center gap-2 px-2.5 py-1.5 rounded-lg border border-border bg-muted/50 max-w-full">
            <FileCode className="w-3.5 h-3.5 text-blue-400 shrink-0" />
            <span className="text-xs text-foreground font-mono truncate flex-1">{attachedText.name}</span>
            <span className="text-[10px] text-muted-foreground shrink-0">
              {attachedText.content.split("\n").length} lines
            </span>
            <button
              onClick={() => setAttachedText(null)}
              className="shrink-0 text-muted-foreground hover:text-foreground transition-colors"
            >
              <XCircle className="w-3 h-3" />
            </button>
          </div>
        )}

        {/* URL scrape banner — shown when a URL is detected in the input */}
        {detectedUrl && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            className="mb-2 rounded-xl border border-blue-500/30 bg-blue-500/5 overflow-hidden"
          >
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-1.5 border-b border-blue-500/20 bg-blue-500/10">
              <div className="flex items-center gap-1.5">
                {isScraping ? (
                  <Loader2 className="w-3 h-3 text-blue-400 animate-spin" />
                ) : (
                  <Globe className="w-3 h-3 text-blue-400" />
                )}
                <span className="text-[11px] font-semibold text-blue-300">
                  {isScraping ? "Reading page…" : scrapedMeta ? "Page loaded" : "URL detected"}
                </span>
                <span className="text-[10px] text-blue-400/60 font-mono truncate max-w-[140px]">{detectedUrl}</span>
              </div>
              <button
                onClick={() => { setDetectedUrl(null); setScrapedMeta(null); setIsScraping(false); }}
                className="text-blue-400/60 hover:text-blue-300 transition-colors"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            {/* Body */}
            <div className="p-2.5 flex gap-3">
              {scrapedMeta?.ogImage && (
                <img
                  src={scrapedMeta.ogImage}
                  alt="Page preview"
                  className="h-14 w-auto max-w-[80px] rounded-lg border border-blue-500/20 object-cover shadow-sm flex-shrink-0"
                  onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
                />
              )}
              <div className="flex flex-col justify-center gap-1.5 flex-1 min-w-0">
                {scrapedMeta ? (
                  <>
                    {scrapedMeta.title && (
                      <p className="text-[11px] font-medium text-foreground truncate">{scrapedMeta.title}</p>
                    )}
                    {scrapedMeta.description && (
                      <p className="text-[10px] text-muted-foreground line-clamp-2 leading-relaxed">{scrapedMeta.description}</p>
                    )}
                  </>
                ) : isScraping ? (
                  <p className="text-[11px] text-muted-foreground">Fetching page content…</p>
                ) : (
                  <p className="text-[11px] text-muted-foreground">Add a prompt or use a quick action below.</p>
                )}
                {scrapedMeta && (
                  <div className="flex flex-wrap gap-1 mt-0.5">
                    <button
                      onClick={() => {
                        setInput(`Clone this website as a React + Tailwind app. Match the layout, design, colors, and content exactly: ${detectedUrl}`);
                        setTimeout(() => textareaRef.current?.focus(), 50);
                      }}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30 hover:bg-blue-500/30 transition-colors"
                    >
                      🌐 Clone page
                    </button>
                    <button
                      onClick={() => {
                        setInput(`Analyze the design and content of this page and build an improved, modern version with better UX: ${detectedUrl}`);
                        setTimeout(() => textareaRef.current?.focus(), 50);
                      }}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-violet-500/20 text-violet-300 border border-violet-500/30 hover:bg-violet-500/30 transition-colors"
                    >
                      ✨ Redesign
                    </button>
                    <button
                      onClick={() => {
                        setInput(`Based on this page, extract the key content and structure, then build a landing page for the same product/service: ${detectedUrl}`);
                        setTimeout(() => textareaRef.current?.focus(), 50);
                      }}
                      className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors"
                    >
                      📄 Landing page
                    </button>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}

        <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={handleImageAttach} />

        {/* Context file chips */}
        {contextFiles.length > 0 && (
          <div className="flex flex-wrap gap-1.5 px-3 pt-2">
            {contextFiles.map((f) => (
              <div key={f.id} className="flex items-center gap-1 bg-violet-500/10 border border-violet-500/20 text-violet-300 text-[10px] rounded-md px-2 py-0.5">
                <Paperclip className="w-2.5 h-2.5 shrink-0" />
                <span className="font-mono max-w-[120px] truncate">{f.path.split("/").pop()}</span>
                <button
                  onClick={() => setContextFiles((prev) => prev.filter((cf) => cf.id !== f.id))}
                  className="ml-0.5 text-violet-400/60 hover:text-violet-300 transition-colors"
                >
                  <X className="w-2.5 h-2.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Input box — Lovable style */}
        <div className="relative rounded-2xl border border-border/60 bg-card shadow-[0_1px_6px_rgba(0,0,0,0.08)] focus-within:border-border focus-within:shadow-[0_2px_12px_rgba(0,0,0,0.12)] transition-all duration-150">
          {/* @mention autocomplete — files + collaborators */}
          <AnimatePresence>
            {mentionQuery !== null && mentionItems.length > 0 && (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 4 }}
                className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-popover border border-border rounded-xl shadow-xl overflow-hidden"
              >
                <div className="px-2 py-1 border-b border-border">
                  <span className="text-[10px] text-muted-foreground font-mono">
                    {isCrossProjectQuery ? "@ reference from another project" : "@ mention file or collaborator"}
                  </span>
                </div>
                {mentionItems.map((item, idx) => (
                  <button
                    key={idx}
                    onMouseDown={(e) => { e.preventDefault(); insertMention(item); }}
                    className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                      idx === mentionCursor ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                    }`}
                  >
                    {item.kind === "file" ? (
                      <>
                        <span className="text-muted-foreground/50">📄</span>
                        <span className="font-mono truncate text-violet-400">{item.path}</span>
                      </>
                    ) : item.kind === "xproject" ? (
                      <>
                        <span className="text-muted-foreground/50">{item.filePath ? "📄" : "📁"}</span>
                        <span className="font-medium truncate text-amber-400">{item.projectName}</span>
                        {item.filePath && (
                          <span className="font-mono text-muted-foreground/70 text-[10px] truncate ml-auto">{item.filePath}</span>
                        )}
                        {!item.filePath && (
                          <span className="text-muted-foreground/50 text-[10px] ml-auto">click to browse files →</span>
                        )}
                      </>
                    ) : (
                      <>
                        <span className="text-muted-foreground/50">👤</span>
                        <span className="font-medium truncate">{item.display}</span>
                        <span className="text-muted-foreground/50 text-[10px] truncate ml-auto">{item.email}</span>
                      </>
                    )}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Prompt template picker (shown when "/" typed or toolbar button clicked) */}
          <AnimatePresence>
            {showTemplates && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-popover border border-border rounded-xl shadow-xl overflow-hidden"
              >
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
                  <span className="text-[11px] font-semibold text-muted-foreground">Prompt templates & skills</span>
                  <span className="text-[10px] text-muted-foreground/50">Type / to open · Esc to close</span>
                </div>
                <div className="max-h-72 overflow-y-auto">
                  {/* Skills section — shown when query matches a skill name */}
                  {(() => {
                    const slashQuery = input.startsWith("/") ? input.slice(1).toLowerCase().trim() : "";
                    const allSkills = [...(skills.custom ?? []), ...(skills.builtin ?? [])];
                    const matchedSkills = allSkills.filter((s) =>
                      !slashQuery ||
                      s.name.toLowerCase().includes(slashQuery) ||
                      (s.description ?? "").toLowerCase().includes(slashQuery) ||
                      (s.tags ?? []).some((t: string) => t.toLowerCase().includes(slashQuery))
                    );
                    if (matchedSkills.length === 0) return null;
                    return (
                      <div>
                        <div className="px-3 py-1 bg-violet-500/5 border-b border-border/40 flex items-center gap-1.5">
                          <Sparkles className="w-3 h-3 text-violet-400" />
                          <span className="text-[10px] font-semibold text-violet-400 uppercase tracking-wider">Skills</span>
                        </div>
                        {matchedSkills.slice(0, 8).map((skill) => (
                          <button
                            key={skill.id}
                            onMouseDown={(e) => { e.preventDefault(); applySkill(skill.prompt, skill.id); setShowTemplates(false); }}
                            className="w-full flex items-start gap-2.5 px-3 py-2 text-xs text-left hover:bg-accent hover:text-accent-foreground transition-colors"
                          >
                            <span className="text-lg leading-none shrink-0 mt-0.5">{skill.icon ?? "✨"}</span>
                            <div className="flex-1 min-w-0">
                              <div className="font-medium truncate">{skill.name}</div>
                              {skill.description && (
                                <div className="text-[10px] text-muted-foreground truncate mt-0.5">{skill.description}</div>
                              )}
                            </div>
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                  {/* Prompt templates */}
                  {input === "/" || !input.startsWith("/") ? (
                    PROMPT_TEMPLATES.map((group) => (
                      <div key={group.category}>
                        <div className="px-3 py-1 bg-muted/30 border-b border-border/40">
                          <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                            {group.category}
                          </span>
                        </div>
                        {group.prompts.map((prompt) => (
                          <button
                            key={prompt}
                            onMouseDown={(e) => { e.preventDefault(); insertTemplate(prompt); }}
                            className="w-full flex items-center gap-2 px-3 py-2 text-xs text-left hover:bg-accent hover:text-accent-foreground transition-colors"
                          >
                            <span className="text-muted-foreground/40 font-mono text-[10px] shrink-0">/</span>
                            <span className="truncate">{prompt}</span>
                          </button>
                        ))}
                      </div>
                    ))
                  ) : null}
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Snippet picker */}
          <AnimatePresence>
            {showSnippets && (
              <SnippetPicker
                currentUserId={currentUserId}
                onInsert={(content) => {
                  setInput((prev) => prev ? `${prev}\n${content}` : content);
                  setShowSnippets(false);
                  setTimeout(() => textareaRef.current?.focus(), 50);
                }}
                onClose={() => setShowSnippets(false)}
              />
            )}
          </AnimatePresence>

          {/* Analyze-data modal — instruction + optional file → POST /api/ai/analyze */}
          <AnimatePresence>
            {analyzeOpen && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                onClick={() => !analyzeRunning && setAnalyzeOpen(false)}
              >
                <motion.div
                  initial={{ scale: 0.95, y: 8 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.95, y: 8 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-lg rounded-2xl border border-border bg-background shadow-2xl overflow-hidden"
                >
                  <div className="px-5 pt-4 pb-3 border-b border-border/60">
                    <div className="flex items-center gap-2">
                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-violet-400"><path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-5"/></svg>
                      <h3 className="text-sm font-semibold">Analyze data</h3>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Drop a CSV / Excel / image / JSON file and tell the AI what to do. It writes a Python script, runs it in a sandbox, and returns the generated files (PDF, XLSX, charts, etc.).
                    </p>
                  </div>
                  <div className="px-5 py-3 space-y-3">
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Instruction</label>
                      <textarea
                        value={analyzeInstruction}
                        onChange={(e) => setAnalyzeInstruction(e.target.value)}
                        rows={3}
                        placeholder="e.g. Summarize this CSV, generate a bar chart of the top 10 rows by revenue, and produce a PDF report."
                        className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-muted/30 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
                        maxLength={2000}
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
                        Input file <span className="text-muted-foreground/50">(optional, ≤ 20 MB)</span>
                      </label>
                      {analyzeFile ? (
                        <div className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-muted/30 text-xs">
                          <span className="flex-1 truncate font-mono">{analyzeFile.name}</span>
                          <button
                            type="button"
                            onClick={() => setAnalyzeFile(null)}
                            className="text-muted-foreground hover:text-foreground text-[11px]"
                          >
                            Remove
                          </button>
                        </div>
                      ) : (
                        <input
                          type="file"
                          accept=".csv,.tsv,.json,.xlsx,.xls,.txt,.png,.jpg,.jpeg,.pdf"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            if (file.size > 20 * 1024 * 1024) {
                              toast({ title: "File too large (max 20 MB)", variant: "destructive" });
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = () => {
                              const result = reader.result as string;
                              // result is "data:<mime>;base64,<body>" — peel the prefix
                              const idx = result.indexOf(",");
                              const base64 = idx >= 0 ? result.slice(idx + 1) : result;
                              setAnalyzeFile({
                                name: file.name,
                                base64,
                                mimeType: file.type || "application/octet-stream",
                              });
                            };
                            reader.readAsDataURL(file);
                          }}
                          className="w-full text-xs text-muted-foreground file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border file:border-border file:bg-muted/30 file:text-xs file:cursor-pointer hover:file:bg-muted/50"
                        />
                      )}
                    </div>
                  </div>
                  <div className="px-5 py-3 border-t border-border/60 flex items-center justify-end gap-2 bg-muted/10">
                    <button
                      onClick={() => setAnalyzeOpen(false)}
                      disabled={analyzeRunning}
                      className="h-8 px-3 text-xs rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
                        if (!analyzeInstruction.trim() || analyzeRunning) return;
                        setAnalyzeRunning(true);
                        try {
                          const res = await fetch("/api/ai/analyze", {
                            method: "POST",
                            headers: { "Content-Type": "application/json" },
                            body: JSON.stringify({
                              instruction: analyzeInstruction.trim(),
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
                          };
                          if (!res.ok || !data.ok) {
                            throw new Error(data.error ?? data.stderr ?? "Analysis failed");
                          }
                          setAnalyzeResults((prev) => [
                            ...prev,
                            {
                              id: `analyze-${Date.now()}`,
                              instruction: analyzeInstruction.trim(),
                              stdout: data.stdout ?? "",
                              stderr: data.stderr ?? "",
                              files: data.files ?? [],
                              createdAt: Date.now(),
                            },
                          ]);
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
                      }}
                      disabled={!analyzeInstruction.trim() || analyzeRunning}
                      className="h-8 px-3 text-xs rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                    >
                      {analyzeRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : null}
                      {analyzeRunning ? "Running…" : "Analyze"}
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Save-as-skill modal — opens when user clicks ⚡ on an assistant message */}
          <AnimatePresence>
            {saveSkillDraft && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
                onClick={() => !savingSkill && setSaveSkillDraft(null)}
              >
                <motion.div
                  initial={{ scale: 0.95, y: 8 }}
                  animate={{ scale: 1, y: 0 }}
                  exit={{ scale: 0.95, y: 8 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-md rounded-2xl border border-border bg-background shadow-2xl overflow-hidden"
                >
                  <div className="px-5 pt-4 pb-3 border-b border-border/60">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-violet-400" />
                      <h3 className="text-sm font-semibold">Save as skill</h3>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-1">
                      Reuse this answer as a named playbook. It will be auto-attached when future prompts match its description.
                    </p>
                  </div>
                  <div className="px-5 py-3 space-y-3">
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Name</label>
                      <input
                        value={saveSkillDraft.name}
                        onChange={(e) => setSaveSkillDraft((d) => d ? { ...d, name: e.target.value } : d)}
                        placeholder="e.g. Add Stripe checkout"
                        className="w-full h-8 px-2.5 rounded-lg border border-border bg-muted/30 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/30"
                        maxLength={120}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground mb-1 block">
                        Description <span className="text-muted-foreground/50">(used for matching)</span>
                      </label>
                      <textarea
                        value={saveSkillDraft.description}
                        onChange={(e) => setSaveSkillDraft((d) => d ? { ...d, description: e.target.value } : d)}
                        rows={2}
                        placeholder="A short summary of when this skill applies"
                        className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-muted/30 text-xs focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
                        maxLength={500}
                      />
                    </div>
                    <div>
                      <label className="text-[11px] font-medium text-muted-foreground mb-1 block">Playbook body</label>
                      <textarea
                        value={saveSkillDraft.prompt}
                        onChange={(e) => setSaveSkillDraft((d) => d ? { ...d, prompt: e.target.value } : d)}
                        rows={8}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-border bg-muted/30 text-[11px] font-mono focus:outline-none focus:ring-2 focus:ring-violet-500/30 resize-none"
                      />
                      <p className="text-[10px] text-muted-foreground/70 mt-1">
                        This will be appended to the AI system prompt whenever the skill matches.
                      </p>
                    </div>
                  </div>
                  <div className="px-5 py-3 border-t border-border/60 flex items-center justify-end gap-2 bg-muted/10">
                    <button
                      onClick={() => setSaveSkillDraft(null)}
                      disabled={savingSkill}
                      className="h-8 px-3 text-xs rounded-lg border border-border/60 text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors disabled:opacity-40"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={async () => {
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
                      }}
                      disabled={savingSkill || !saveSkillDraft.name.trim() || !saveSkillDraft.prompt.trim()}
                      className="h-8 px-3 text-xs rounded-lg bg-violet-600 hover:bg-violet-500 text-white transition-colors disabled:opacity-40 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                    >
                      {savingSkill ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Save skill
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Context file picker popover */}
          <AnimatePresence>
            {showFilePicker && (
              <motion.div
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 6 }}
                className="absolute bottom-full left-0 right-0 mb-1 z-50 bg-popover border border-border rounded-xl shadow-xl overflow-hidden"
              >
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-border">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] font-semibold text-muted-foreground">Attach files as context</span>
                    <span className={`text-[10px] tabular-nums px-1.5 py-0.5 rounded-full font-medium ${
                      contextFiles.length >= MAX_CONTEXT_FILES
                        ? "bg-amber-500/15 text-amber-400"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {contextFiles.length}/{MAX_CONTEXT_FILES}
                    </span>
                  </div>
                  <button onClick={() => { setShowFilePicker(false); setFilePickerSearch(""); }} className="text-muted-foreground/50 hover:text-foreground">
                    <XCircle className="w-3.5 h-3.5" />
                  </button>
                </div>
                {/* Search input */}
                <div className="px-3 py-1.5 border-b border-border/60">
                  <input
                    autoFocus
                    value={filePickerSearch}
                    onChange={(e) => setFilePickerSearch(e.target.value)}
                    placeholder="Filter files…"
                    className="w-full bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 outline-none font-mono"
                  />
                </div>
                {contextFiles.length >= MAX_CONTEXT_FILES && (
                  <div className="px-3 py-1.5 text-[10px] text-amber-400 bg-amber-500/5 border-b border-border/40 flex items-center gap-1.5">
                    <Zap className="w-3 h-3 shrink-0" />
                    Max {MAX_CONTEXT_FILES} files — remove one to add another
                  </div>
                )}
                <div className="max-h-48 overflow-y-auto">
                  {files.length === 0 && (
                    <p className="text-xs text-muted-foreground px-3 py-3">No project files available</p>
                  )}
                  {files.length > 0 && files.filter((f) =>
                    !filePickerSearch || f.path.toLowerCase().includes(filePickerSearch.toLowerCase())
                  ).length === 0 && (
                    <p className="text-xs text-muted-foreground px-3 py-3">No files match &quot;{filePickerSearch}&quot;</p>
                  )}
                  {files.filter((f) =>
                    !filePickerSearch || f.path.toLowerCase().includes(filePickerSearch.toLowerCase())
                  ).map((f) => {
                    const attached = contextFiles.some((cf) => cf.id === f.id);
                    const atLimit = contextFiles.length >= MAX_CONTEXT_FILES && !attached;
                    return (
                      <button
                        key={f.id}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          if (atLimit) return;
                          setContextFiles((prev) =>
                            attached ? prev.filter((cf) => cf.id !== f.id) : [...prev, f]
                          );
                        }}
                        disabled={atLimit}
                        className={`w-full flex items-center gap-2 px-3 py-1.5 text-xs text-left transition-colors ${
                          attached
                            ? "bg-violet-500/10 text-violet-300"
                            : atLimit
                            ? "opacity-40 cursor-not-allowed"
                            : "hover:bg-muted text-foreground"
                        }`}
                      >
                        <FileCode2 className={`w-3 h-3 shrink-0 ${attached ? "text-violet-400" : "text-muted-foreground"}`} />
                        <span className="font-mono truncate flex-1">{f.path}</span>
                        {attached && <span className="text-[10px] text-violet-400 shrink-0">✓ attached</span>}
                      </button>
                    );
                  })}
                </div>
                {contextFiles.length > 0 && (
                  <div className="px-3 py-1.5 border-t border-border/60 flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">{contextFiles.length} file{contextFiles.length !== 1 ? "s" : ""} selected</span>
                    <button
                      onMouseDown={(e) => { e.preventDefault(); setContextFiles([]); }}
                      className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
                    >
                      Clear all
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Live environment lock banner */}
          {isLocked && (
            <div className="flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 border-t border-emerald-500/20">
              <Globe className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="text-[11px] text-emerald-300 leading-snug">
                <span className="font-semibold">Live environment</span> — AI edits are locked.
                Switch back to <span className="font-semibold">Test</span> in the top bar to make changes.
              </span>
            </div>
          )}

          {/* Textarea — not disabled while streaming so users can queue messages */}
          <Textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            placeholder={smartPlaceholder}
            className={`min-h-[60px] max-h-40 resize-none border-0 bg-transparent px-4 pt-4 pb-2 text-sm focus-visible:ring-0 placeholder:text-muted-foreground/40 ${input.length > 3800 ? "ring-1 ring-red-500/50 rounded" : ""}`}
            disabled={noCredits || isLocked}
          />

          {/* Character counter — shown when input has content */}
          {input.length > 0 && (
            <div className="flex items-center justify-between gap-3 px-4 pb-0.5">
              {/* Patience microcopy — gentle nudge to break long prompts into smaller blocks */}
              {input.length > 800 ? (
                <span className="text-[10px] text-amber-300/80 leading-snug">
                  Tip: break large requests into smaller, testable blocks — try Plan mode first.
                </span>
              ) : (
                <span />
              )}
              <span className={`text-[10px] tabular-nums transition-colors ${
                input.length > 3800 ? "text-red-400" :
                input.length > 3000 ? "text-amber-400" :
                "text-muted-foreground/40"
              }`}>
                {input.length} / 4000
              </span>
            </div>
          )}
          {/* ── Bottom action row — Lovable style ── */}
          <div className="flex items-center gap-1.5 px-3 pb-3 pt-1 safe-area-bottom safe-area-x">

            {/* + context menu — matches Lovable exactly */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center justify-center w-7 h-7 rounded-lg border border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex-shrink-0 text-base font-light"
                  title="Add context or attach"
                >
                  +
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" side="top" className="w-52 p-1">
                <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => onOpenPanel?.("settings")}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 0-14.14 0"/><path d="M4.93 19.07a10 10 0 0 0 14.14 0"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2"/></svg>
                  <span className="flex-1">Settings</span>
                  <span className="text-[10px] text-muted-foreground/60">Ctrl+.</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => onOpenPanel?.("history")}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                  <span>History</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => onOpenPanel?.("knowledge")}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                  <span>Knowledge</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => onOpenPanel?.("github")}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 3.165 19.489c-.501-.1-.687-.217-.687-.482v-1.69c0-.574-.192-1.004-.507-1.267 1.662-.184 3.408-.81 3.408-3.668 0-.812-.29-1.476-.764-1.993.077-.188.33-.944-.073-1.968 0 0-.623-.199-2.04.762A7.147 7.147 0 0 0 12 10.9a7.11 7.11 0 0 0-1.5.202c-1.415-.962-2.04-.762-2.04-.762-.4 1.024-.148 1.78-.072 1.968-.474.517-.764 1.181-.764 1.993 0 2.849 1.742 3.487 3.398 3.677-.213.187-.406.515-.473.997-.425.19-1.504.52-2.166-.62 0 0-.394-.714-1.14-.766 0 0-.726-.009-.05.452 0 0 .487.228.824 1.082 0 0 .436 1.325 2.503.876v1.208c0 .263-.183.38-.68.483A10 10 0 0 1 12 2z"/></svg>
                  <span>GitHub</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => onOpenPanel?.("connectors")}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l6.58-6.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>
                  <span className="flex-1">Connectors</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                </DropdownMenuItem>
                <div className="h-px bg-border/60 my-1" />
                <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => window.dispatchEvent(new CustomEvent("lifemark-request-screenshot", { detail: { messageId: "manual" } }))}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>
                  <span>Take a screenshot</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => setShowFilePicker((v) => !v)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <span>Add reference</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => setShowSnippets((v) => !v)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                  <span>Add skill</span>
                </DropdownMenuItem>
                {/* Analyze data — runs /api/ai/analyze in a Python sandbox and renders generated files inline */}
                <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => setAnalyzeOpen(true)}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18"/><path d="M7 14l3-3 3 3 5-5"/></svg>
                  <span>Analyze data</span>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2.5 py-2" onClick={() => fileInputRef.current?.click()}>
                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
                  <span>Attach</span>
                </DropdownMenuItem>
                {/* Matches Lovable's "Connectors have moved" footnote at the bottom of the + menu */}
                <div className="h-px bg-border/60 my-1" />
                <div className="px-2 py-2">
                  <p className="text-[10px] font-medium text-foreground/80">Connectors have moved</p>
                  <p className="text-[10px] text-muted-foreground leading-snug">
                    Find the new connector experience on the homepage.
                  </p>
                </div>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* @ Visual edits button — Lovable style */}
            <button
              className="flex items-center gap-1.5 h-7 px-2.5 rounded-lg border border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors text-xs flex-shrink-0"
              onClick={() => setShowTemplates((v) => !v)}
              title="Visual edits & prompt templates"
            >
              <span className="text-muted-foreground/60 font-medium">@</span>
              <span>Visual edits</span>
            </button>

            <div className="flex-1" />

            {/* Plan / Build toggle — Lovable primary modes */}
            <div className="flex items-center rounded-lg border border-border/70 overflow-hidden flex-shrink-0">
              <button
                type="button"
                onClick={() => onModeChange?.("plan")}
                className={`h-7 px-2.5 text-xs font-medium transition-colors ${
                  mode === "plan" || mode === "chat"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                Plan
              </button>
              <button
                type="button"
                onClick={() => onModeChange?.("build")}
                className={`h-7 px-2.5 text-xs font-medium transition-colors border-l border-border/70 ${
                  mode === "build" || mode === "agent" || mode === "patch"
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
              >
                Build
              </button>
            </div>

            {(mode === "build" || mode === "agent") && files.length === 0 && (
              <button
                type="button"
                onClick={() => setClarifyFirst((v) => !v)}
                className={`h-7 px-2.5 rounded-lg border text-xs font-medium transition-colors flex-shrink-0 ${
                  clarifyFirst
                    ? "border-violet-500/50 bg-violet-500/15 text-violet-300"
                    : "border-border/70 text-muted-foreground hover:text-foreground hover:bg-muted/40"
                }`}
                title="Ask clarifying questions before the first build"
              >
                Clarify
              </button>
            )}

            {/* More modes + model — Lovable style */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button className="flex items-center gap-1 h-7 px-2.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors flex-shrink-0 border border-border/70">
                  {/* Label must reflect the REAL mode — the old fallback showed
                      "Build" even in chat mode, so users believed they were
                      building while their messages went out as conversation. */}
                  {mode === "plan" ? "Plan" : mode === "agent" ? "Agent" : mode === "build" ? "Build" : mode === "patch" ? "Quick Edit" : mode === "chat" ? "Chat" : "Build"}
                  <ChevronDown className="w-3 h-3 opacity-60" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" side="top" className="w-52 p-1">
                <DropdownMenuItem className="text-xs gap-2 py-2.5" onClick={() => onModeChange?.("chat")}>
                  <div className="w-4 h-4 flex items-center justify-center">{mode === "chat" && <Check className="w-3 h-3" />}</div>
                  <div>
                    <p className="font-medium">Chat</p>
                    <p className="text-[10px] text-muted-foreground">Q&amp;A without code changes</p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2 py-2.5" onClick={() => onModeChange?.("build")}>
                  <div className="w-4 h-4 flex items-center justify-center">{mode === "build" && <Check className="w-3 h-3" />}</div>
                  <div>
                    <p className="font-medium">Build</p>
                    <p className="text-[10px] text-muted-foreground">Make changes directly</p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2 py-2.5" onClick={() => onModeChange?.("plan")}>
                  <div className="w-4 h-4 flex items-center justify-center">{mode === "plan" && <Check className="w-3 h-3" />}</div>
                  <div>
                    <p className="font-medium">Plan</p>
                    <p className="text-[10px] text-muted-foreground">Discuss before building</p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2 py-2.5" onClick={() => onModeChange?.("patch")}>
                  <div className="w-4 h-4 flex items-center justify-center">{mode === "patch" && <Check className="w-3 h-3" />}</div>
                  <div>
                    <p className="font-medium">Quick Edit</p>
                    <p className="text-[10px] text-muted-foreground">Small targeted patches</p>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem className="text-xs gap-2 py-2.5" onClick={() => onModeChange?.("agent")}>
                  <div className="w-4 h-4 flex items-center justify-center">{mode === "agent" && <Check className="w-3 h-3" />}</div>
                  <div>
                    <p className="font-medium">Agent</p>
                    <p className="text-[10px] text-muted-foreground">Autonomous AI agent</p>
                  </div>
                </DropdownMenuItem>
                {/* Matches Lovable's "Toggle with Alt P" hint below the mode list */}
                <div className="flex items-center justify-between px-2 py-1.5 text-[10px] text-muted-foreground">
                  <span>Toggle with</span>
                  <span className="flex items-center gap-1">
                    <kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 text-[10px] font-mono">Alt</kbd>
                    <kbd className="px-1.5 py-0.5 rounded border border-border/60 bg-muted/40 text-[10px] font-mono">P</kbd>
                  </span>
                </div>
                <div className="h-px bg-border/60 my-1" />
                {/* Model selector inline */}
                {AI_MODELS.map((model) => (
                  <DropdownMenuItem
                    key={model.id}
                    onClick={() => {
                      modelManuallySelectedRef.current = true;
                      setSelectedModel(model.id);
                      persistPreferredModel(model.id);
                      setModelManuallySelected(true);
                    }}
                    className={`text-xs gap-2 py-2 ${selectedModel === model.id ? "bg-muted" : ""}`}
                  >
                    <div className="w-4 h-4 flex items-center justify-center flex-shrink-0">
                      {selectedModel === model.id && <Check className="w-3 h-3 text-violet-400" />}
                    </div>
                    <span className="flex-1 font-medium">{model.label}</span>
                    <span className="text-[10px] text-muted-foreground/70 flex-shrink-0">{model.badge}</span>
                    {model.best && <span className="text-[9px] px-1 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex-shrink-0">Best</span>}
                    {model.fast && !model.best && <span className="text-[9px] px-1 py-0.5 rounded bg-blue-500/15 text-blue-400 border border-blue-500/25 flex-shrink-0">Fast</span>}
                    {model.new && <span className="text-[9px] px-1 py-0.5 rounded bg-emerald-500/15 text-emerald-400 border border-emerald-500/25 flex-shrink-0">New</span>}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Mic / voice mode */}
            <VoiceMode onTranscript={(t) => setInput((prev) => prev + (prev ? " " : "") + t)} />

            {/* Send / Stop — Lovable uses square stop while generating */}
            {streaming ? (
              <button
                type="button"
                onClick={stopGeneration}
                className="flex items-center justify-center w-7 h-7 rounded-lg bg-foreground text-background hover:bg-foreground/90 transition-all flex-shrink-0"
                title="Stop generation"
              >
                <Square className="w-3 h-3 fill-current" />
              </button>
            ) : (
              <button
                onClick={() => void handleSend()}
                disabled={(!input.trim() && !attachedImage) || noCredits || isLocked}
                className={`flex items-center justify-center w-7 h-7 rounded-lg transition-all flex-shrink-0 ${
                  (input.trim() || attachedImage) && !noCredits && !isLocked
                    ? "bg-foreground text-background hover:bg-foreground/90"
                    : "bg-muted/50 text-muted-foreground/40 cursor-not-allowed"
                }`}
                title="Send (Enter)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
              </button>
            )}
          </div>
        </div>
      </div>

      {chatAnnotateOpen && attachedImage && (
        <PreviewAnnotateModal
          screenshotDataUrl={attachedImage}
          onClose={() => setChatAnnotateOpen(false)}
          onSend={(annotated, note) => {
            setAttachedImage(annotated);
            if (note?.trim()) setInput(note);
            setChatAnnotateOpen(false);
          }}
        />
      )}
    </div>
  );
}
