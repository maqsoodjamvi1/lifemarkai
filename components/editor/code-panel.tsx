"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import dynamic from "next/dynamic";
import { importWithRetry } from "@/lib/import-with-retry";
import {
  X, Save, Loader2, FileCode, FilePlus, Copy, Check, Download,
  Maximize2, Minimize2, MessageSquare, Wand2, Sparkles,
  ChevronDown, ChevronUp, Palette, Settings2, Columns2, Clock, Search,
} from "lucide-react";
import { EDITOR_THEMES, DEFAULT_THEME_ID, THEME_STORAGE_KEY } from "@/lib/editor/themes";
import { loadEditorSettings, saveEditorSettings, DEFAULT_EDITOR_SETTINGS, type EditorSettings } from "@/lib/editor/settings";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { DEFAULT_CODING_MODEL } from "@/lib/ai/model-defaults";
import type { ProjectFile } from "@/types/database";
import { CollabCursors } from "./collab-cursors";
import { useYjsEditor, type Collaborator as YjsCollaborator } from "@/hooks/use-yjs-editor";
import { createClient } from "@/lib/supabase/client";
import { useConfirm } from "@/components/ui/confirm-dialog";
import type * as Monaco from "monaco-editor";
import { loader } from "@monaco-editor/react";

loader.config({
  paths: { vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.50.0/min/vs" },
});

const MonacoEditor = dynamic(importWithRetry(() => import("@monaco-editor/react")), {
  ssr: false,
  loading: () => (
    <div className="flex items-center justify-center h-full bg-[#1e1e2e]">
      <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
    </div>
  ),
});

interface CollabUserInfo {
  id: string;
  name: string;
  avatar?: string;
}

interface CodePanelProps {
  file: ProjectFile | null;
  files?: ProjectFile[];
  projectId?: string;
  onFileChange?: (file: ProjectFile) => void;
  onSave?: (content: string) => void;
  onChange?: (content: string) => void;
  collabUser?: CollabUserInfo;
  onCollaboratorsChange?: (collabs: YjsCollaborator[]) => void;
  onReferenceInChat?: (file: ProjectFile) => void;
}

interface InlineEditState {
  open: boolean;
  startLine: number;
  endLine: number;
  originalText: string;
  instruction: string;
  loading: boolean;
  result: string | null;
  accepted: boolean;
}

const LANG_MAP: Record<string, string> = {
  tsx: "typescript", ts: "typescript",
  jsx: "javascript",  js: "javascript",
  css: "css",         scss: "scss",
  html: "html",       json: "json",
  md: "markdown",     py: "python",
  sql: "sql",         sh: "shell",
  yaml: "yaml",       yml: "yaml",
};

function monacoLang(path: string): string {
  return LANG_MAP[path.split(".").pop()?.toLowerCase() ?? ""] ?? "plaintext";
}

function basename(path: string): string {
  return path.split("/").pop() ?? path;
}

const FILE_COLORS: Record<string, string> = {
  tsx: "#61dafb", ts: "#3b82f6", jsx: "#61dafb", js: "#f7df1e",
  css: "#38bdf8", html: "#f97316", json: "#a3e635", md: "#94a3b8",
};
function tabColor(path: string): string {
  return FILE_COLORS[path.split(".").pop()?.toLowerCase() ?? ""] ?? "#6b7280";
}

const EMPTY_INLINE: InlineEditState = {
  open: false, startLine: 0, endLine: 0, originalText: "",
  instruction: "", loading: false, result: null, accepted: false,
};

// ── Component ─────────────────────────────────────────────────────────────────

export function CodePanel({
  file, files, projectId, onFileChange, onSave, onChange,
  collabUser, onCollaboratorsChange, onReferenceInChat,
}: CodePanelProps) {
  const [openTabs, setOpenTabs] = useState<ProjectFile[]>(file ? [file] : []);
  const [activeTabId, setActiveTabId] = useState<string | null>(file?.id ?? null);
  const contentRef = useRef<Map<string, string>>(new Map());
  const dirtyRef = useRef<Set<string>>(new Set());
  const [, forceRender] = useState(0);
  const [saving, setSaving] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [showRecents, setShowRecents] = useState(false);
  const recentsKey = projectId ? `lifemark-recent-files-${projectId}` : null;
  const [recentFiles, setRecentFiles] = useState<{ id: string; path: string }[]>(() => {
    if (typeof window === "undefined" || !projectId) return [];
    try { return JSON.parse(localStorage.getItem(`lifemark-recent-files-${projectId}`) ?? "[]"); }
    catch { return []; }
  });
  const [inlineEdit, setInlineEdit] = useState<InlineEditState>(EMPTY_INLINE);
  const [themeId, setThemeId] = useState<string>(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem(THEME_STORAGE_KEY) ?? DEFAULT_THEME_ID;
    }
    return DEFAULT_THEME_ID;
  });
  const [showThemePicker, setShowThemePicker] = useState(false);
  const [showSettingsPopover, setShowSettingsPopover] = useState(false);
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(loadEditorSettings);
  const themesRegisteredRef = useRef(false);
  const completionsRegisteredRef = useRef(false);
  const [aiCompletions, setAiCompletions] = useState(true);
  const aiCompletionsRef = useRef(true);
  const activeTabRef = useRef<ProjectFile | null>(null);
  const [showDiff, setShowDiff] = useState(false);
  const [showProblems, setShowProblems] = useState(false);
  const [markers, setMarkers] = useState<Monaco.editor.IMarker[]>([]);
  const [aiExplainId, setAiExplainId] = useState<string | null>(null);
  const [aiExplainText, setAiExplainText] = useState<string | null>(null);
  const [aiExplainLoading, setAiExplainLoading] = useState(false);
  const [selBar, setSelBar] = useState<{ top: number; left: number; code: string; sel: Monaco.Selection } | null>(null);
  const [explainDrawer, setExplainDrawer] = useState<{ code: string; text: string; loading: boolean } | null>(null);
  const [explainCopied, setExplainCopied] = useState(false);
  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splitFileId, setSplitFileId] = useState<string | null>(null);
  const splitEditorRef = useRef<Monaco.editor.IStandaloneCodeEditor | null>(null);
  const [docGenLoading, setDocGenLoading] = useState(false);
  const [showRefactorMenu, setShowRefactorMenu] = useState(false);
  const [refactorLoading, setRefactorLoading] = useState(false);
  const [showQuickOpen, setShowQuickOpen] = useState(false);
  const [quickOpenQuery, setQuickOpenQuery] = useState("");
  const [quickOpenIdx, setQuickOpenIdx] = useState(0);
  const quickOpenInputRef = useRef<HTMLInputElement>(null);
  const [cursorPos, setCursorPos] = useState<{ line: number; col: number }>({ line: 1, col: 1 });
  const [fileStats, setFileStats] = useState<{ lines: number; chars: number; words: number }>({ lines: 0, chars: 0, words: 0 });
  const [selStats, setSelStats] = useState<{ chars: number; words: number } | null>(null);
  const [showGotoLine, setShowGotoLine] = useState(false);
  const [gotoLineValue, setGotoLineValue] = useState("");
  // Session timer
  const sessionStartRef = useRef<number>(Date.now());
  const [sessionMinutes, setSessionMinutes] = useState(0);
  useEffect(() => {
    const id = setInterval(() => {
      setSessionMinutes(Math.floor((Date.now() - sessionStartRef.current) / 60_000));
    }, 60_000);
    return () => clearInterval(id);
  }, []);
  const gotoLineInputRef = useRef<HTMLInputElement>(null);
  const [tabCtxMenu, setTabCtxMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);
  const closedTabsStack = useRef<ProjectFile[]>([]);
  const pinnedTabsRef = useRef<Set<string>>(new Set());
  const [, forceTabRender] = useState(0);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const inlineInputRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const editorInstancesRef = useRef<Map<string, Monaco.editor.IStandaloneCodeEditor>>(new Map());
  const viewStateRef = useRef<Map<string, Monaco.editor.ICodeEditorViewState | null>>(new Map());
  const prevActiveTabIdRef = useRef<string | null>(null);
  const supabaseRef = useRef(createClient());
  const confirm = useConfirm();

  const activeTab = openTabs.find((t) => t.id === activeTabId) ?? null;
  // Keep refs in sync so provider callbacks can read current values
  activeTabRef.current = activeTab;
  aiCompletionsRef.current = aiCompletions;

  const { bind: yjsBind, collaborators: yjsCollaborators } = useYjsEditor({
    projectId: projectId ?? "local",
    filePath:  activeTab?.path ?? "",
    initialContent: activeTab
      ? (contentRef.current.get(activeTab.id) ?? activeTab.content ?? "")
      : "",
    user: collabUser ?? { id: "anon", name: "Anonymous" },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    supabase: supabaseRef.current as any,
    enabled: !!collabUser && !!projectId,
  });

  useEffect(() => {
    onCollaboratorsChange?.(yjsCollaborators);
  }, [yjsCollaborators, onCollaboratorsChange]);

  useEffect(() => {
    if (!collabUser || !projectId || !activeTabId) return;
    const editor = editorInstancesRef.current.get(activeTabId);
    if (editor) yjsBind(editor);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId, collabUser, projectId]);

  // ── View-state save/restore on tab switch ───────────────────────────────
  useEffect(() => {
    const prevId = prevActiveTabIdRef.current;
    // Save departing tab view state
    if (prevId && prevId !== activeTabId) {
      const prevEditor = editorInstancesRef.current.get(prevId);
      if (prevEditor) {
        viewStateRef.current.set(prevId, prevEditor.saveViewState());
      }
    }
    // Restore arriving tab view state
    if (activeTabId) {
      const editor = editorInstancesRef.current.get(activeTabId);
      const saved = viewStateRef.current.get(activeTabId);
      if (editor && saved) {
        editor.restoreViewState(saved);
      }
    }
    prevActiveTabIdRef.current = activeTabId;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

    // ── Outline reveal-line listener ──────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { line } = (e as CustomEvent<{ line: number }>).detail;
      if (!activeTabId) return;
      const editor = editorInstancesRef.current.get(activeTabId);
      if (!editor) return;
      editor.revealLineInCenter(line);
      editor.setPosition({ lineNumber: line, column: 1 });
      editor.focus();
    };
    window.addEventListener("monaco-reveal-line", handler);
    return () => window.removeEventListener("monaco-reveal-line", handler);
  }, [activeTabId]);

  // ── Insert code from chat listener ────────────────────────────────────────
  useEffect(() => {
    const handler = (e: Event) => {
      const { code } = (e as CustomEvent<{ code: string; language: string }>).detail;
      if (!activeTabId) return;
      const editor = editorInstancesRef.current.get(activeTabId);
      if (!editor) return;
      const pos = editor.getPosition();
      if (!pos) return;
      editor.executeEdits("insert-from-chat", [{
        range: {
          startLineNumber: pos.lineNumber,
          startColumn: pos.column,
          endLineNumber: pos.lineNumber,
          endColumn: pos.column,
        },
        text: code,
      }]);
      editor.focus();
      toast({ description: "Code inserted ✓" });
    };
    window.addEventListener("monaco-insert-code", handler);
    return () => window.removeEventListener("monaco-insert-code", handler);
  }, [activeTabId, toast]);

  // ── Markers / Problems listener ───────────────────────────────────────────
  useEffect(() => {
    if (!activeTab) { setMarkers([]); return; }
    let dispose: (() => void) | undefined;
    // Poll until Monaco is available in the window scope
    const poll = setInterval(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const monacoApi = (window as any).monaco as typeof Monaco | undefined;
      if (!monacoApi) return;
      clearInterval(poll);
      const refresh = () => {
        const editor = editorInstancesRef.current.get(activeTab.id);
        if (!editor) { setMarkers([]); return; }
        const model = editor.getModel();
        if (!model) { setMarkers([]); return; }
        const m = monacoApi.editor.getModelMarkers({ resource: model.uri });
        setMarkers(m);
        window.dispatchEvent(new CustomEvent("monaco-markers-change", {
          detail: { markers: m, filePath: activeTab?.path ?? "" },
        }));
      };
      refresh();
      const sub = monacoApi.editor.onDidChangeMarkers(() => refresh());
      dispose = () => sub.dispose();
    }, 300);
    return () => { clearInterval(poll); dispose?.(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab?.id]);

  // ── Inline edit helpers ────────────────────────────────────────────────────

  function openInlineEdit() {
    if (!activeTab || !activeTabId) return;
    const editor = editorInstancesRef.current.get(activeTabId);
    if (!editor) return;
    const selection = editor.getSelection();
    if (!selection) return;
    const model = editor.getModel();
    if (!model) return;

    const startLine = selection.startLineNumber;
    const endLine = selection.endLineNumber;
    const originalText = model.getLinesContent().slice(startLine - 1, endLine).join("\n");

    setInlineEdit({
      open: true,
      startLine,
      endLine,
      originalText,
      instruction: "",
      loading: false,
      result: null,
      accepted: false,
    });
    setShowDiff(false);
    setTimeout(() => inlineInputRef.current?.focus(), 80);
  }

  async function generateDocs() {
    if (!activeTab || !activeTabId) return;
    const editor = editorInstancesRef.current.get(activeTabId);
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    const selection = editor.getSelection();
    let code: string;
    let insertLine: number;

    if (selection && !(selection.startLineNumber === selection.endLineNumber && selection.startColumn === selection.endColumn)) {
      // Use selected text
      code = model.getValueInRange(selection);
      insertLine = selection.startLineNumber;
    } else {
      // No selection — grab the full function/class block at cursor using a heuristic:
      // expand upward to find the function/class/const declaration line, then grab ~40 lines
      const pos = editor.getPosition();
      if (!pos) return;
      const totalLines = model.getLineCount();
      const start = Math.max(1, pos.lineNumber - 2);
      const end = Math.min(totalLines, pos.lineNumber + 40);
      code = model.getLinesContent().slice(start - 1, end).join("\n");
      insertLine = start;
    }

    if (!code.trim()) return;
    setDocGenLoading(true);

    try {
      const res = await fetch("/api/ai/docgen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code,
          filename: activeTab.path,
          language: activeTab.language ?? monacoLang(activeTab.path),
        }),
      });

      if (!res.ok) throw new Error("Doc generation failed");
      const { docs } = await res.json() as { docs: string };
      if (!docs?.trim()) throw new Error("Empty response");

      // Detect indentation of the target line
      const targetLineContent = model.getLineContent(insertLine);
      const indent = targetLineContent.match(/^(\s*)/)?.[1] ?? "";

      // Indent every line of the JSDoc block to match
      const indentedDocs = docs
        .split("\n")
        .map((l) => indent + l)
        .join("\n");

      // Insert above the target line
      editor.executeEdits("docgen", [{
        range: {
          startLineNumber: insertLine,
          startColumn: 1,
          endLineNumber: insertLine,
          endColumn: 1,
        },
        text: indentedDocs + "\n",
      }]);

      // Trigger save
      const updated = model.getValue();
      contentRef.current.set(activeTab.id, updated);
      onChange?.(updated);

      toast({ title: "Docs generated", description: `JSDoc added above line ${insertLine}` });
    } catch {
      toast({ title: "Doc generation failed", variant: "destructive" });
    } finally {
      setDocGenLoading(false);
    }
  }

  async function explainCode() {
    if (!activeTabId) return;
    const editor = editorInstancesRef.current.get(activeTabId);
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;
    const selection = editor.getSelection();
    let code: string;
    if (
      selection &&
      !(
        selection.startLineNumber === selection.endLineNumber &&
        selection.startColumn === selection.endColumn
      )
    ) {
      code = model.getValueInRange(selection);
    } else {
      const pos = editor.getPosition();
      if (!pos) return;
      const totalLines = model.getLineCount();
      const start = Math.max(1, pos.lineNumber - 5);
      const end = Math.min(totalLines, pos.lineNumber + 30);
      code = model.getLinesContent().slice(start - 1, end).join("\n");
    }
    if (!code.trim()) return;
    setExplainDrawer({ code, text: "", loading: true });
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content:
                "Explain this code clearly and concisely in plain English:\n\n```\n" +
                code +
                "\n```",
            },
          ],
          model: DEFAULT_CODING_MODEL,
          system:
            "You are an expert code explainer. Explain what the given code does " +
            "step by step in plain English. Be concise but thorough. Use markdown.",
          projectId: projectId ?? "",
        }),
      });
      if (!res.ok || !res.body) throw new Error("Explain failed");
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let full = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = dec.decode(value, { stream: true });
        const lines = chunk.split("\n");
        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const raw = line.slice(6).trim();
            if (raw === "[DONE]") break;
            try {
              const parsed = JSON.parse(raw);
              const delta =
                parsed.choices?.[0]?.delta?.content ??
                parsed.delta?.text ??
                "";
              if (delta) {
                full += delta;
                setExplainDrawer((prev) =>
                  prev ? { ...prev, text: full } : prev
                );
              }
            } catch {}
          }
        }
      }
      setExplainDrawer((prev) =>
        prev ? { ...prev, loading: false } : prev
      );
    } catch {
      setExplainDrawer((prev) =>
        prev
          ? {
              ...prev,
              text: "Failed to explain code. Please try again.",
              loading: false,
            }
          : prev
      );
    }
  }

  async function applyRefactor(refactorType: string) {
    if (!activeTab || !activeTabId || !selBar) return;
    const editor = editorInstancesRef.current.get(activeTabId);
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    setRefactorLoading(true);
    setShowRefactorMenu(false);

    // Get surrounding context (±30 lines)
    const totalLines = model.getLineCount();
    const selStart = selBar.sel.startLineNumber;
    const selEnd = selBar.sel.endLineNumber;
    const ctxStart = Math.max(1, selStart - 30);
    const ctxEnd = Math.min(totalLines, selEnd + 30);
    const contextLines = model.getLinesContent().slice(ctxStart - 1, ctxEnd);
    const context = contextLines.join("\n");

    try {
      const res = await fetch("/api/ai/refactor", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: selBar.code,
          refactorType,
          filename: activeTab.path,
          language: activeTab.language ?? monacoLang(activeTab.path),
          context,
        }),
      });

      if (!res.ok) throw new Error("Refactor failed");
      const { refactored } = await res.json() as { refactored: string };
      if (!refactored?.trim()) throw new Error("Empty response");

      // Replace the selection with the refactored code
      editor.executeEdits("refactor", [{
        range: selBar.sel,
        text: refactored,
      }]);

      // Mark dirty and propagate change
      if (activeTab) {
        const updated = model.getValue();
        contentRef.current.set(activeTab.id, updated);
        dirtyRef.current.add(activeTab.id);
        forceRender((n) => n + 1);
        onChange?.(updated);
      }

      toast({ title: "Refactor applied", description: refactorType.replace(/-/g, " ") });
    } catch {
      toast({ title: "Refactor failed", variant: "destructive" });
    } finally {
      setRefactorLoading(false);
      setSelBar(null);
    }
  }

  async function runInlineEdit() {
    if (!activeTab || !inlineEdit.instruction.trim()) return;
    setInlineEdit((s) => ({ ...s, loading: true }));

    try {
      const content = contentRef.current.get(activeTab.id) ?? activeTab.content ?? "";
      const res = await fetch("/api/ai/inline-edit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filePath: activeTab.path,
          fileContent: content,
          selection: { startLine: inlineEdit.startLine, endLine: inlineEdit.endLine },
          instruction: inlineEdit.instruction,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error ?? "AI failed");
      }
      const { replacement } = await res.json();
      setInlineEdit((s) => ({ ...s, loading: false, result: replacement }));
      setShowDiff(true);
    } catch (err) {
      toast({ title: "Inline edit failed", description: String(err), variant: "destructive" });
      setInlineEdit((s) => ({ ...s, loading: false }));
    }
  }

  function acceptInlineEdit() {
    if (!activeTab || !activeTabId || !inlineEdit.result) return;
    const editor = editorInstancesRef.current.get(activeTabId);
    if (!editor) return;
    const model = editor.getModel();
    if (!model) return;

    const { startLine, endLine, result } = inlineEdit;
    const startCol = 1;
    const endCol = model.getLineMaxColumn(endLine);

    editor.executeEdits("inline-ai", [{
      range: { startLineNumber: startLine, startColumn: startCol, endLineNumber: endLine, endColumn: endCol },
      text: result,
    }]);

    // Update content ref
    const newContent = model.getValue();
    contentRef.current.set(activeTab.id, newContent);
    dirtyRef.current.add(activeTab.id);
    forceRender((n) => n + 1);
    onChange?.(newContent);

    setInlineEdit(EMPTY_INLINE);
    toast({ title: "Changes applied", description: `Lines ${startLine}–${endLine} updated` });
  }

  function cancelInlineEdit() {
    setInlineEdit(EMPTY_INLINE);
  }

  // ── Standard helpers ───────────────────────────────────────────────────────

  function copyActiveCode() {
    if (!activeTab) return;
    const content = contentRef.current.get(activeTab.id) ?? activeTab.content ?? "";
    void navigator.clipboard.writeText(content).then(() => {
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    });
  }

  function downloadActiveFile() {
    if (!activeTab) return;
    const content = contentRef.current.get(activeTab.id) ?? activeTab.content ?? "";
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = activeTab.path.split("/").pop() ?? "file";
    a.click();
    URL.revokeObjectURL(url);
  }

  function formatActiveFile() {
    if (!activeTabId) return;
    const editor = editorInstancesRef.current.get(activeTabId);
    if (!editor) return;
    void editor.getAction("editor.action.formatDocument")?.run();
  }

  function referenceInChat() {
    if (!activeTab) return;
    onReferenceInChat?.(activeTab);
  }

  // ── Tab session key ───────────────────────────────────────────────────────
  const sessionKey = projectId ? `lifemark-tabs-${projectId}` : null;

  // Restore open tabs from localStorage when files become available
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || !sessionKey || !files?.length) return;
    restoredRef.current = true;
    try {
      const saved = localStorage.getItem(sessionKey);
      if (!saved) return;
      const { tabIds, activeTabId: savedActiveId } = JSON.parse(saved) as {
        tabIds: string[];
        activeTabId: string | null;
      };
      const restoredTabs = tabIds
        .map((id) => files.find((f) => f.id === id))
        .filter(Boolean) as typeof files;
      if (restoredTabs.length === 0) return;
      setOpenTabs(restoredTabs);
      const activeExists = restoredTabs.find((t) => t.id === savedActiveId);
      setActiveTabId(activeExists ? savedActiveId : restoredTabs[0].id);
    } catch {
      // Ignore corrupt session data
    }
  }, [sessionKey, files]); // eslint-disable-line react-hooks/exhaustive-deps

  // Persist open tabs whenever they change
  useEffect(() => {
    if (!sessionKey) return;
    try {
      localStorage.setItem(
        sessionKey,
        JSON.stringify({ tabIds: openTabs.map((t) => t.id), activeTabId })
      );
    } catch {
      // localStorage quota exceeded — ignore
    }
  }, [openTabs, activeTabId, sessionKey]);

  // ── Track recent files ────────────────────────────────────────────────────
  useEffect(() => {
    if (!activeTabId || !recentsKey) return;
    const activeTab = openTabs.find((t) => t.id === activeTabId);
    if (!activeTab) return;
    setRecentFiles((prev) => {
      const entry = { id: activeTab.id, path: activeTab.path };
      const next = [entry, ...prev.filter((r) => r.id !== activeTab.id)].slice(0, 10);
      try { localStorage.setItem(recentsKey, JSON.stringify(next)); } catch { /* quota */ }
      return next;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTabId]);

  // ── Quick open focus ──────────────────────────────────────────────────────
  useEffect(() => {
    if (showQuickOpen) {
      setTimeout(() => quickOpenInputRef.current?.focus(), 0);
    }
  }, [showQuickOpen]);

  // ── Go to line focus ──────────────────────────────────────────────────────
  useEffect(() => {
    if (showGotoLine) {
      setTimeout(() => gotoLineInputRef.current?.focus(), 0);
    }
  }, [showGotoLine]);

  function commitGotoLine() {
    const n = parseInt(gotoLineValue, 10);
    if (!isNaN(n) && n > 0 && activeTabId) {
      const editor = editorInstancesRef.current.get(activeTabId);
      if (editor) {
        const total = editor.getModel()?.getLineCount() ?? 1;
        const target = Math.min(n, total);
        editor.revealLineInCenter(target);
        editor.setPosition({ lineNumber: target, column: 1 });
        editor.focus();
      }
    }
    setShowGotoLine(false);
  }

  // ── File / files sync ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!file) return;
    setOpenTabs((prev) => {
      if (prev.find((t) => t.id === file.id)) return prev;
      return [...prev, file];
    });
    setActiveTabId(file.id);
  }, [file?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!files) return;
    setOpenTabs((prev) =>
      prev.map((tab) => {
        const updated = files.find((f) => f.id === tab.id);
        if (!updated || dirtyRef.current.has(tab.id)) return tab;
        contentRef.current.set(tab.id, updated.content ?? "");
        return updated;
      })
    );
  }, [files]);

  const activeContent = activeTab
    ? (contentRef.current.get(activeTab.id) ?? activeTab.content ?? "")
    : "";

  async function closeTab(id: string, e: React.MouseEvent) {
    e.stopPropagation();
    if (dirtyRef.current.has(id)) {
      const ok = await confirm({
        title: "Unsaved changes",
        description: "This file has unsaved changes. Close it anyway?",
        confirmLabel: "Close without saving",
        variant: "destructive",
      });
      if (!ok) return;
    }
    // Push to restore stack before removing
    const closingTab = openTabs.find((t) => t.id === id);
    if (closingTab) closedTabsStack.current.push(closingTab);
    dirtyRef.current.delete(id);
    contentRef.current.delete(id);
    setOpenTabs((prev) => {
      const next = prev.filter((t) => t.id !== id);
      if (activeTabId === id) {
        const idx = prev.findIndex((t) => t.id === id);
        const fallback = next[Math.max(0, idx - 1)];
        setActiveTabId(fallback?.id ?? null);
      }
      return next;
    });
  }

  const handleChange = useCallback((value: string | undefined) => {
    const v = value ?? "";
    if (!activeTab) return;
    contentRef.current.set(activeTab.id, v);
    if (v !== (activeTab.content ?? "")) {
      dirtyRef.current.add(activeTab.id);
    } else {
      dirtyRef.current.delete(activeTab.id);
    }
    forceRender((n) => n + 1);
    onChange?.(v);
  }, [activeTab, onChange]);

  async function saveTab(tabId?: string) {
    const target = openTabs.find((t) => t.id === (tabId ?? activeTabId));
    if (!target) return;

    // Format before save if enabled and this is the active tab
    if (editorSettings.formatOnSave && target.id === activeTabId) {
      await (editorInstancesRef.current.get(activeTabId ?? "")
        ?.getAction("editor.action.formatDocument")
        ?.run() ?? Promise.resolve());
    }

    const content = contentRef.current.get(target.id) ?? target.content ?? "";
    if (!dirtyRef.current.has(target.id)) return;

    setSaving(true);
    try {
      if (onSave && target.id === activeTabId) {
        await onSave(content);
      } else if (projectId) {
        const res = await fetch(`/api/projects/${projectId}/files`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fileId: target.id, content }),
        });
        if (!res.ok) throw new Error("Failed to save");
      }
      dirtyRef.current.delete(target.id);
      forceRender((n) => n + 1);
      setOpenTabs((prev) =>
        prev.map((t) => t.id === target.id ? { ...t, content } : t)
      );
      onFileChange?.({ ...target, content });
      toast({ title: "Saved", description: target.path });
    } catch {
      toast({ title: "Save failed", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  }

  async function saveAll() {
    const dirtyTabs = openTabs.filter((t) => dirtyRef.current.has(t.id));
    if (!dirtyTabs.length) return;
    setSaving(true);
    let saved = 0;
    await Promise.allSettled(
      dirtyTabs.map(async (target) => {
        const content = contentRef.current.get(target.id) ?? target.content ?? "";
        try {
          if (onSave && target.id === activeTabId) {
            await onSave(content);
          } else if (projectId) {
            const res = await fetch(`/api/projects/${projectId}/files`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ fileId: target.id, content }),
            });
            if (!res.ok) throw new Error("Failed");
          }
          dirtyRef.current.delete(target.id);
          setOpenTabs((prev) =>
            prev.map((t) => t.id === target.id ? { ...t, content } : t)
          );
          onFileChange?.({ ...target, content });
          saved++;
        } catch { /* individual tab save failure — continue */ }
      })
    );
    setSaving(false);
    forceRender((n) => n + 1);
    if (saved > 0) toast({ description: saved + " file" + (saved !== 1 ? "s" : "") + " saved ✓" });
  }

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;

      if (e.key === "s" && !e.shiftKey) { e.preventDefault(); saveTab(); return; }
      if (e.key === "s" && e.shiftKey) { e.preventDefault(); void saveAll(); return; }

      if (e.key === "p" && !e.shiftKey) {
        e.preventDefault();
        setQuickOpenQuery("");
        setQuickOpenIdx(0);
        setShowQuickOpen(true);
        return;
      }

      if (e.key === "g" && !e.shiftKey) {
        e.preventDefault();
        setGotoLineValue("");
        setShowGotoLine(true);
        return;
      }

      // Font zoom: ⌘+  ⌘-  ⌘0
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setEditorSettings((s) => {
          const next = { ...s, fontSize: Math.min(24, s.fontSize + 1) };
          saveEditorSettings(next);
          return next;
        });
        return;
      }
      if (e.key === "-") {
        e.preventDefault();
        setEditorSettings((s) => {
          const next = { ...s, fontSize: Math.max(10, s.fontSize - 1) };
          saveEditorSettings(next);
          return next;
        });
        return;
      }
      if (e.key === "0") {
        e.preventDefault();
        setEditorSettings((s) => {
          const next = { ...s, fontSize: DEFAULT_EDITOR_SETTINGS.fontSize };
          saveEditorSettings(next);
          return next;
        });
        return;
      }

      if ((e.key === "t" || e.key === "T") && e.shiftKey) {
        e.preventDefault();
        const last = closedTabsStack.current.pop();
        if (last) {
          setOpenTabs((prev) => (prev.find((t) => t.id === last.id) ? prev : [...prev, last]));
          setActiveTabId(last.id);
          toast({ description: `Reopened ${basename(last.path)}` });
        }
        return;
      }

      if (e.key === "w") {
        e.preventDefault();
        if (!activeTabId) return;
        void closeTab(activeTabId, { stopPropagation: () => {} } as React.MouseEvent);
        return;
      }

      if (e.shiftKey && (e.key === "[" || e.key === "]")) {
        e.preventDefault();
        setOpenTabs((tabs) => {
          if (tabs.length < 2) return tabs;
          const idx = tabs.findIndex((t) => t.id === activeTabId);
          const next = e.key === "]" ? (idx + 1) % tabs.length : (idx - 1 + tabs.length) % tabs.length;
          setActiveTabId(tabs[next].id);
          return tabs;
        });
      }

      // Cmd+\ — toggle split pane
      if (e.key === "\\" && !e.shiftKey) {
        e.preventDefault();
        setSplitEnabled((v) => !v);
        return;
      }

      // Cmd+K — open inline edit
      if (e.key === "k" && !e.shiftKey) {
        const active = document.activeElement;
        // Only trigger when Monaco has focus
        if (active && (active.classList.contains("inputarea") || active.closest(".monaco-editor"))) {
          e.preventDefault();
          openInlineEdit();
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }); // no deps

  // ── Quick open helpers ────────────────────────────────────────────────────
  const quickOpenFiles = (() => {
    const all = files ?? [];
    if (!quickOpenQuery.trim()) return all.slice(0, 20);
    const q = quickOpenQuery.toLowerCase();
    return all
      .filter((f) => f.path.toLowerCase().includes(q))
      .sort((a, b) => {
        // Exact basename match ranks higher
        const aBase = a.path.split("/").pop()?.toLowerCase() ?? "";
        const bBase = b.path.split("/").pop()?.toLowerCase() ?? "";
        const aExact = aBase.startsWith(q) ? 0 : 1;
        const bExact = bBase.startsWith(q) ? 0 : 1;
        return aExact - bExact;
      })
      .slice(0, 20);
  })();

  function openQuickFile(f: ProjectFile) {
    setOpenTabs((prev) => (prev.find((t) => t.id === f.id) ? prev : [...prev, f]));
    setActiveTabId(f.id);
    setShowQuickOpen(false);
  }

  // ── Tab context menu actions ──────────────────────────────────────────────
  function ctxClose(tabId: string) {
    void closeTab(tabId, { stopPropagation: () => {} } as React.MouseEvent);
    setTabCtxMenu(null);
  }
  function ctxCloseOthers(tabId: string) {
    setOpenTabs((prev) => prev.filter((t) => t.id === tabId));
    setActiveTabId(tabId);
    setTabCtxMenu(null);
  }
  function ctxCloseRight(tabId: string) {
    setOpenTabs((prev) => {
      const idx = prev.findIndex((t) => t.id === tabId);
      return idx === -1 ? prev : prev.slice(0, idx + 1);
    });
    setTabCtxMenu(null);
  }
  function ctxTogglePin(tabId: string) {
    if (pinnedTabsRef.current.has(tabId)) {
      pinnedTabsRef.current.delete(tabId);
    } else {
      pinnedTabsRef.current.add(tabId);
      // Move pinned tab to front
      setOpenTabs((prev) => {
        const tab = prev.find((t) => t.id === tabId);
        if (!tab) return prev;
        return [tab, ...prev.filter((t) => t.id !== tabId)];
      });
    }
    forceTabRender((n) => n + 1);
    setTabCtxMenu(null);
  }
  function ctxCopyPath(tabId: string) {
    const tab = openTabs.find((t) => t.id === tabId);
    if (tab) navigator.clipboard.writeText(tab.path).catch(() => {});
    setTabCtxMenu(null);
  }
  function ctxReveal(tabId: string) {
    const tab = openTabs.find((t) => t.id === tabId);
    if (tab) window.dispatchEvent(new CustomEvent("reveal-in-tree", { detail: { path: tab.path } }));
    setTabCtxMenu(null);
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div className={`flex flex-col bg-[#1e1e2e] ${expanded ? "fixed inset-0 z-50" : "h-full"}`}>
      {/* Tab bar */}
      <div className="flex items-center overflow-x-auto bg-[#181825] border-b border-[#1e1e2e] shrink-0 scrollbar-none">
        {openTabs.map((tab) => {
          const isActive = tab.id === activeTabId;
          const isDirty = dirtyRef.current.has(tab.id);
          const isPinned = pinnedTabsRef.current.has(tab.id);
          const color = tabColor(tab.path);
          return (
            <div
              key={tab.id}
              onClick={() => setActiveTabId(tab.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                setTabCtxMenu({ x: e.clientX, y: e.clientY, tabId: tab.id });
              }}
              className={`group flex items-center gap-2 px-3 py-2 cursor-pointer border-r border-[#1e1e2e] text-xs font-mono shrink-0 max-w-[180px] transition-colors ${
                isActive
                  ? "bg-[#1e1e2e] text-[#cdd6f4] border-t-2"
                  : "text-[#585b70] hover:text-[#a6adc8] hover:bg-[#1e1e2e]/50"
              }`}
              style={isActive ? { borderTopColor: color } : {}}
            >
              {isPinned ? (
                /* Pin indicator — replaces dirty dot for pinned tabs */
                <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-[#89b4fa]" title="Pinned" />
              ) : (
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${isDirty ? "bg-[#fab387]" : "bg-transparent group-hover:bg-[#585b70]/50"}`} />
              )}
              <span className="truncate">{basename(tab.path)}</span>
              {isPinned ? (
                /* Pinned tabs show no close button — use right-click to unpin */
                null
              ) : (
                <button onClick={(e) => closeTab(tab.id, e)} className="shrink-0 opacity-0 group-hover:opacity-100 hover:text-white transition-opacity">
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          );
        })}
        {openTabs.length === 0 && (
          <div className="px-3 py-2 text-xs text-[#45475a]">No files open</div>
        )}

        <div className="flex-1" />

        <div className="flex items-center gap-0.5 px-2 py-1 shrink-0 border-l border-[#313244]/50">
          {activeTab && dirtyRef.current.has(activeTab.id) && (
            <>
              <span className="text-[10px] text-[#fab387] mr-1">Unsaved</span>
              <Button size="sm" variant="ghost" className="h-6 px-2 text-xs gap-1 text-[#cdd6f4] hover:bg-[#313244]" onClick={() => saveTab()} disabled={saving} title="Save (⌘S)">
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
              </Button>
            </>
          )}
          {/* Save All button — only shown when multiple dirty tabs exist */}
          {(() => {
            const dirtyCount = openTabs.filter((t) => dirtyRef.current.has(t.id)).length;
            return dirtyCount > 1 ? (
              <Button
                size="sm"
                variant="ghost"
                className="h-6 px-2 text-xs gap-1 text-[#fab387] hover:bg-[#313244] hover:text-[#f9e2af] relative"
                onClick={() => void saveAll()}
                disabled={saving}
                title="Save All (⌘⇧S)"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                <span>All</span>
                <span className="absolute -top-1 -right-1 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-[#fab387] text-[#1e1e2e] text-[8px] font-bold leading-none">
                  {dirtyCount}
                </span>
              </Button>
            ) : null;
          })()}
          {/* AI completions toggle */}
          {projectId && (
            <Button
              size="sm"
              variant="ghost"
              className={`h-6 px-2 hover:bg-[#313244] text-[11px] gap-1 ${aiCompletions ? "text-[#a6e3a1]" : "text-[#585b70]"}`}
              onClick={() => setAiCompletions((v) => !v)}
              title={aiCompletions ? "AI completions ON (click to disable)" : "AI completions OFF (click to enable)"}
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">AI</span>
            </Button>
          )}
          {/* Cmd+K inline edit button */}
          {activeTab && (
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-[#585b70] hover:text-[#cba6f7] hover:bg-[#313244] text-[11px] gap-1"
              onClick={openInlineEdit}
              title="Inline AI edit (⌘K)"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>Edit</span>
              <span className="text-[10px] opacity-50">⌘K</span>
            </Button>
          )}
          {onReferenceInChat && activeTab && (
            <Button size="sm" variant="ghost" className="h-6 px-2 text-[#585b70] hover:text-[#a6e3a1] hover:bg-[#313244] text-[11px] gap-1" onClick={referenceInChat} title="Reference this file in chat">
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Ask AI</span>
            </Button>
          )}
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-[#585b70] hover:text-[#cdd6f4] hover:bg-[#313244]" onClick={formatActiveFile} disabled={!activeTab} title="Format document (⇧⌥F)">
            <Wand2 className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-[#585b70] hover:text-[#cdd6f4] hover:bg-[#313244]" onClick={copyActiveCode} disabled={!activeTab} title="Copy code">
            {codeCopied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
          </Button>
          <Button size="sm" variant="ghost" className="h-6 px-2 text-[#585b70] hover:text-[#cdd6f4] hover:bg-[#313244] text-[11px] gap-1" onClick={downloadActiveFile} disabled={!activeTab} title="Download file">
            <Download className="w-3.5 h-3.5" />
            <span>Download</span>
          </Button>
          {/* Theme picker */}
          <div className="relative">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-[#585b70] hover:text-[#cdd6f4] hover:bg-[#313244]"
              onClick={() => setShowThemePicker((v) => !v)}
              title="Editor theme"
            >
              <Palette className="w-3.5 h-3.5" />
            </Button>
            {showThemePicker && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowThemePicker(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-[#181825] border border-[#313244] rounded-lg shadow-xl p-1.5 min-w-[160px]">
                  {EDITOR_THEMES.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => {
                        setThemeId(t.id);
                        localStorage.setItem(THEME_STORAGE_KEY, t.id);
                        setShowThemePicker(false);
                      }}
                      className={`flex items-center gap-2 w-full px-2 py-1.5 rounded text-xs text-left transition-colors ${
                        t.id === themeId
                          ? "bg-[#313244] text-[#cdd6f4]"
                          : "text-[#a6adc8] hover:bg-[#313244]/60 hover:text-[#cdd6f4]"
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full shrink-0 border border-white/10"
                        style={{ backgroundColor: t.swatch }}
                      />
                      {t.label}
                      {t.id === themeId && <Check className="w-3 h-3 ml-auto text-[#a6e3a1]" />}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
          {/* Editor settings */}
          <div className="relative">
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0 text-[#585b70] hover:text-[#cdd6f4] hover:bg-[#313244]"
              onClick={() => setShowSettingsPopover((v) => !v)}
              title="Editor settings"
            >
              <Settings2 className="w-3.5 h-3.5" />
            </Button>
            {showSettingsPopover && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowSettingsPopover(false)} />
                <div className="absolute right-0 top-full mt-1 z-50 bg-[#181825] border border-[#313244] rounded-lg shadow-xl p-3 w-56 space-y-3">
                  <p className="text-[10px] font-semibold text-[#585b70] uppercase tracking-wider">Editor Settings</p>
                  {/* Font size */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-[#a6adc8]">Font size</label>
                      <span className="text-xs text-[#cdd6f4] tabular-nums">{editorSettings.fontSize}px</span>
                    </div>
                    <input
                      type="range" min={11} max={20} step={1}
                      value={editorSettings.fontSize}
                      onChange={(e) => {
                        const s = { ...editorSettings, fontSize: Number(e.target.value) };
                        setEditorSettings(s); saveEditorSettings(s);
                      }}
                      className="w-full h-1 accent-violet-500"
                    />
                  </div>
                  {/* Line height */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center">
                      <label className="text-xs text-[#a6adc8]">Line height</label>
                      <span className="text-xs text-[#cdd6f4] tabular-nums">{editorSettings.lineHeight.toFixed(1)}</span>
                    </div>
                    <input
                      type="range" min={1.4} max={2.0} step={0.1}
                      value={editorSettings.lineHeight}
                      onChange={(e) => {
                        const s = { ...editorSettings, lineHeight: Number(e.target.value) };
                        setEditorSettings(s); saveEditorSettings(s);
                      }}
                      className="w-full h-1 accent-violet-500"
                    />
                  </div>
                  {/* Tab size */}
                  <div className="flex items-center justify-between">
                    <label className="text-xs text-[#a6adc8]">Tab size</label>
                    <div className="flex gap-1">
                      {[2, 4].map((n) => (
                        <button
                          key={n}
                          onClick={() => { const s = { ...editorSettings, tabSize: n }; setEditorSettings(s); saveEditorSettings(s); }}
                          className={`px-2 py-0.5 rounded text-xs transition-colors ${editorSettings.tabSize === n ? "bg-violet-500/30 text-violet-300" : "text-[#585b70] hover:bg-[#313244]"}`}
                        >
                          {n}
                        </button>
                      ))}
                    </div>
                  </div>
                  {/* Toggles */}
                  {([
                    ["wordWrap", "Word wrap"],
                    ["minimap", "Minimap"],
                    ["lineNumbers", "Line numbers"],
                    ["fontLigatures", "Font ligatures"],
                    ["formatOnSave", "Format on save"],
                    ["stickyScroll", "Sticky scroll"],
                  ] as const).map(([key, label]) => (
                    <div key={key} className="flex items-center justify-between">
                      <label className="text-xs text-[#a6adc8]">{label}</label>
                      <button
                        onClick={() => {
                          const s = { ...editorSettings, [key]: !editorSettings[key] };
                          setEditorSettings(s); saveEditorSettings(s);
                        }}
                        className={`w-8 h-4 rounded-full transition-colors relative ${editorSettings[key] ? "bg-violet-500" : "bg-[#45475a]"}`}
                      >
                        <span className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${editorSettings[key] ? "left-4.5" : "left-0.5"}`} />
                      </button>
                    </div>
                  ))}
                  {/* Reset */}
                  <button
                    onClick={() => { setEditorSettings(DEFAULT_EDITOR_SETTINGS); saveEditorSettings(DEFAULT_EDITOR_SETTINGS); }}
                    className="w-full text-xs text-[#585b70] hover:text-[#a6adc8] py-1 border border-[#313244] rounded hover:bg-[#313244]/50 transition-colors"
                  >
                    Reset to defaults
                  </button>
                </div>
              </>
            )}
          </div>
          {/* Recent files dropdown */}
          <div className="relative">
            <Button
              size="sm" variant="ghost"
              className={`h-6 w-6 p-0 hover:bg-[#313244] transition-colors ${showRecents ? "text-[#cdd6f4]" : "text-[#585b70] hover:text-[#cdd6f4]"}`}
              onClick={() => setShowRecents((v) => !v)}
              title="Recent files"
            >
              <Clock className="w-3.5 h-3.5" />
            </Button>
            {showRecents && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setShowRecents(false)} />
                <div className="absolute right-0 top-7 z-50 w-72 rounded-lg border border-[#313244] bg-[#181825] shadow-xl overflow-hidden">
                  <div className="px-3 py-2 border-b border-[#313244] flex items-center justify-between">
                    <span className="text-[10px] font-medium text-[#585b70] uppercase tracking-wider">Recent files</span>
                    {recentFiles.length > 0 && (
                      <button
                        onClick={() => {
                          setRecentFiles([]);
                          if (recentsKey) localStorage.removeItem(recentsKey);
                        }}
                        className="text-[10px] text-[#585b70] hover:text-[#f38ba8] transition-colors"
                      >
                        Clear
                      </button>
                    )}
                  </div>
                  {recentFiles.length === 0 ? (
                    <div className="px-3 py-4 text-[11px] text-[#585b70] text-center">No recent files yet</div>
                  ) : (
                    <div className="max-h-64 overflow-y-auto">
                      {recentFiles.map((rf) => {
                        const filename = rf.path.split("/").pop() ?? rf.path;
                        const dir = rf.path.includes("/") ? rf.path.split("/").slice(0, -1).join("/") : "";
                        const isActive = rf.id === activeTabId;
                        return (
                          <button
                            key={rf.id}
                            onClick={() => {
                              const target = files?.find((f) => f.id === rf.id);
                              if (target) onFileChange?.(target);
                              setShowRecents(false);
                            }}
                            className={`w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-[#313244] transition-colors ${isActive ? "bg-[#313244]/60" : ""}`}
                          >
                            <FileCode className="w-3.5 h-3.5 shrink-0 text-[#89b4fa]" />
                            <div className="min-w-0">
                              <div className={`text-[11px] font-mono truncate ${isActive ? "text-[#cdd6f4]" : "text-[#a6adc8]"}`}>{filename}</div>
                              {dir && <div className="text-[10px] text-[#585b70] font-mono truncate">{dir}</div>}
                            </div>
                            {isActive && <div className="ml-auto w-1.5 h-1.5 rounded-full bg-[#89b4fa] shrink-0" />}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
          <Button
            size="sm" variant="ghost"
            className="h-6 w-6 p-0 text-[#585b70] hover:text-[#cdd6f4] hover:bg-[#313244] transition-colors"
            onClick={() => window.dispatchEvent(new Event("new-file-from-tabbar"))}
            title="New file"
          >
            <FilePlus className="w-3.5 h-3.5" />
          </Button>
          <Button
            size="sm" variant="ghost"
            className={`h-6 w-6 p-0 hover:bg-[#313244] transition-colors ${splitEnabled ? "text-[#89b4fa]" : "text-[#585b70] hover:text-[#cdd6f4]"}`}
            onClick={() => setSplitEnabled((v) => !v)}
            title={splitEnabled ? "Close split (⌘\\)" : "Split editor (⌘\\)"}
          >
            <Columns2 className="w-3.5 h-3.5" />
          </Button>
          <Button size="sm" variant="ghost" className="h-6 w-6 p-0 text-[#585b70] hover:text-[#cdd6f4] hover:bg-[#313244]" onClick={() => setExpanded((v) => !v)} title={expanded ? "Exit fullscreen" : "Fullscreen editor"}>
            {expanded ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
          </Button>
          {/* Focus mode — dispatches event to editor-layout */}
          <Button
            size="sm"
            variant="ghost"
            className="h-6 w-6 p-0 text-[#585b70] hover:text-[#cdd6f4] hover:bg-[#313244]"
            onClick={() => window.dispatchEvent(new Event("toggle-focus-mode"))}
            title="Toggle focus mode (hides sidebar + top bar)"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/>
              <path d="M3 16v3a2 2 0 0 0 2 2h3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/>
            </svg>
          </Button>
        </div>
      </div>

      {/* Breadcrumb */}
      {activeTab && (
        <div className="flex items-center gap-0 px-3 py-[3px] border-b border-[#313244]/40 bg-[#181825] shrink-0 overflow-x-auto scrollbar-none">
          {activeTab.path.split("/").map((segment, i, arr) => {
            const isFile = i === arr.length - 1;
            const dirPrefix = arr.slice(0, i + 1).join("/");
            return (
              <span key={i} className="flex items-center gap-0 shrink-0">
                {i > 0 && (
                  <svg className="w-3 h-3 text-[#313244] mx-0.5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 18l6-6-6-6" />
                  </svg>
                )}
                <button
                  className={`text-[10px] font-mono px-1 py-0.5 rounded transition-colors ${
                    isFile
                      ? "text-[#cdd6f4] cursor-default"
                      : "text-[#6c7086] hover:text-[#a6adc8] hover:bg-[#313244]/60 cursor-pointer"
                  }`}
                  onClick={() => {
                    if (isFile) return;
                    setQuickOpenQuery(dirPrefix + "/");
                    setQuickOpenIdx(0);
                    setShowQuickOpen(true);
                  }}
                  disabled={isFile}
                >
                  {segment}
                </button>
              </span>
            );
          })}
        </div>
      )}

      {/* ── Inline AI Edit overlay ─────────────────────────────────────────── */}
      {inlineEdit.open && (
        <div className="border-b border-[#cba6f7]/30 bg-[#1e1a2e] px-4 py-3 shrink-0">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-[#cba6f7]" />
            <span className="text-xs font-semibold text-[#cba6f7]">
              AI Edit — lines {inlineEdit.startLine}–{inlineEdit.endLine}
            </span>
            <button onClick={cancelInlineEdit} className="ml-auto text-[#585b70] hover:text-[#cdd6f4]">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Instruction input */}
          {!inlineEdit.result && (
            <div className="flex gap-2">
              <Textarea
                ref={inlineInputRef}
                value={inlineEdit.instruction}
                onChange={(e) => setInlineEdit((s) => ({ ...s, instruction: e.target.value }))}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); runInlineEdit(); }
                  if (e.key === "Escape") cancelInlineEdit();
                }}
                placeholder="Describe your change… (Enter to apply, Shift+Enter for newline)"
                className="flex-1 min-h-[36px] max-h-[120px] text-xs bg-[#181825] border-[#313244] text-[#cdd6f4] placeholder:text-[#45475a] resize-none"
                rows={1}
              />
              <Button
                size="sm"
                onClick={runInlineEdit}
                disabled={inlineEdit.loading || !inlineEdit.instruction.trim()}
                className="shrink-0 h-8 gap-1.5 bg-violet-600 hover:bg-violet-700 text-white"
              >
                {inlineEdit.loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Wand2 className="w-3.5 h-3.5" />}
                Apply
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setInlineEdit(EMPTY_INLINE)} className="shrink-0 h-8 text-[#585b70] hover:text-[#cdd6f4]">
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}
        </div>
      )}

      {/* Editor area */}
      {openTabs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center bg-[#0d0d14] text-[#45475a] text-sm select-none">
          <div className="flex flex-col items-center gap-2">
            <FileCode className="w-10 h-10 opacity-30" />
            <span>No file open</span>
          </div>
        </div>
      ) : (
        <div ref={editorContainerRef} className={`flex-1 overflow-hidden ${splitEnabled ? "flex" : "relative"}`}>
          {/* Selection action bar */}
          {selBar && (
            <div
              className="absolute z-50 flex items-center gap-0.5 bg-[#181825] border border-[#45475a] rounded-lg shadow-xl px-1 py-0.5"
              style={{ top: Math.max(4, selBar.top), left: Math.min(selBar.left, 400) }}
            >
              <button
                onClick={() => {
                  const filename = activeTabRef.current?.path ?? "";
                  window.dispatchEvent(new CustomEvent("monaco-ask-snippet", {
                    detail: { code: selBar.code, filename, instruction: "" },
                  }));
                  setSelBar(null);
                }}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-[#cba6f7] hover:bg-[#313244] rounded transition-colors"
                title="Ask AI about this selection"
              >
                <MessageSquare className="w-3 h-3" />
                Ask AI
              </button>
              <button
                onClick={() => { explainCode(); setSelBar(null); }}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-[#89b4fa] hover:bg-[#313244] rounded transition-colors"
                title="Explain this code (⌘E)"
              >
                <Sparkles className="w-3 h-3" />
                Explain
              </button>
              <button
                onClick={() => { generateDocs(); setSelBar(null); }}
                className="flex items-center gap-1 px-2 py-1 text-[10px] text-[#a6e3a1] hover:bg-[#313244] rounded transition-colors"
                title="Generate JSDoc (⌘⇧D)"
              >
                <Wand2 className="w-3 h-3" />
                Docs
              </button>
              <div className="relative">
                <button
                  onClick={() => setShowRefactorMenu((v) => !v)}
                  className={`flex items-center gap-1 px-2 py-1 text-[10px] hover:bg-[#313244] rounded transition-colors ${showRefactorMenu ? "text-[#fab387] bg-[#313244]" : "text-[#fab387]"}`}
                  title="Refactor"
                  disabled={refactorLoading}
                >
                  {refactorLoading
                    ? <Loader2 className="w-3 h-3 animate-spin" />
                    : <Settings2 className="w-3 h-3" />}
                  Refactor
                </button>
                {showRefactorMenu && (
                  <div className="absolute top-full left-0 mt-1 z-50 bg-[#181825] border border-[#45475a] rounded-lg shadow-xl py-1 min-w-[170px]">
                    {([
                      ["extract-function", "Extract Function"],
                      ["add-types",        "Add TypeScript Types"],
                      ["simplify",         "Simplify"],
                      ["add-error-handling","Add Error Handling"],
                      ["add-comments",     "Add Comments"],
                      ["convert-async",    "Convert to async/await"],
                    ] as const).map(([type, label]) => (
                      <button
                        key={type}
                        onClick={() => applyRefactor(type)}
                        className="w-full text-left px-3 py-1.5 text-[11px] text-[#cdd6f4] hover:bg-[#313244] transition-colors"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {docGenLoading && (
            <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/20 pointer-events-none">
              <div className="flex items-center gap-2 bg-[#181825] border border-[#45475a] rounded-lg px-3 py-2 text-xs text-[#a6e3a1] shadow-xl">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Generating JSDoc…
              </div>
            </div>
          )}
          {/* Left pane wrapper — takes full width or 50% in split mode */}
          <div className={splitEnabled ? "flex-1 overflow-hidden relative" : "h-full relative"}>
          {openTabs.map((tab) => (
            <div key={tab.id} className={`h-full ${tab.id === activeTabId ? "block" : "hidden"}`}>
              <MonacoEditor
                height="100%"
                language={monacoLang(tab.path)}
                value={contentRef.current.get(tab.id) ?? tab.content ?? ""}
                onChange={tab.id === activeTabId ? handleChange : undefined}
                theme={themeId}
                onMount={(editor, monaco) => {
                  editorInstancesRef.current.set(tab.id, editor as unknown as Monaco.editor.IStandaloneCodeEditor);
                  // Register duplicate-line actions so they appear in command palette
                  editor.addAction({
                    id: "lifemarkai.duplicateLineDown",
                    label: "Duplicate Line Down",
                    keybindings: [monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.DownArrow],
                    run(ed) {
                      ed.getAction("editor.action.copyLinesDownAction")?.run();
                    },
                  });
                  editor.addAction({
                    id: "lifemarkai.duplicateLineUp",
                    label: "Duplicate Line Up",
                    keybindings: [monaco.KeyMod.Alt | monaco.KeyMod.Shift | monaco.KeyCode.UpArrow],
                    run(ed) {
                      ed.getAction("editor.action.copyLinesUpAction")?.run();
                    },
                  });
                  editor.addAction({
                    id: "lifemarkai.moveLineDown",
                    label: "Move Line Down",
                    keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.DownArrow],
                    run(ed) {
                      ed.getAction("editor.action.moveLinesDownAction")?.run();
                    },
                  });
                  editor.addAction({
                    id: "lifemarkai.moveLineUp",
                    label: "Move Line Up",
                    keybindings: [monaco.KeyMod.Alt | monaco.KeyCode.UpArrow],
                    run(ed) {
                      ed.getAction("editor.action.moveLinesUpAction")?.run();
                    },
                  });
                  editor.addAction({
                    id: "lifemarkai.toggleComment",
                    label: "Toggle Line Comment",
                    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.Slash],
                    run(ed) {
                      ed.getAction("editor.action.commentLine")?.run();
                    },
                  });
                  editor.addAction({
                    id: "lifemarkai.toggleBlockComment",
                    label: "Toggle Block Comment",
                    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Slash],
                    run(ed) {
                      ed.getAction("editor.action.blockComment")?.run();
                    },
                  });
                  if (tab.id === activeTabId && collabUser && projectId) {
                    yjsBind(editor as unknown as Monaco.editor.IStandaloneCodeEditor);
                  }
                  if (!themesRegisteredRef.current) {
                    themesRegisteredRef.current = true;
                    EDITOR_THEMES.forEach((t) => {
                      if (t.id !== "vs-dark") {
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        (monaco as any).editor.defineTheme(t.id, t.data);
                      }
                    });
                    const stored = typeof window !== "undefined"
                      ? localStorage.getItem(THEME_STORAGE_KEY) ?? DEFAULT_THEME_ID
                      : DEFAULT_THEME_ID;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (monaco as any).editor.setTheme(stored);
                  }
                  (editor as unknown as Monaco.editor.IStandaloneCodeEditor).addAction({
                    id: "lifemark.inlineEdit",
                    label: "AI: Inline Edit (⌘K)",
                    keybindings: [2048 | 41],
                    run: () => openInlineEdit(),
                  });
                  (editor as unknown as Monaco.editor.IStandaloneCodeEditor).addAction({
                    id: "lifemark.generateDocs",
                    label: "AI: Generate JSDoc (⌘⇧D)",
                    // Ctrl/Cmd + Shift + D  =  2048 (Ctrl) | 1024 (Shift) | 32 (D)
                    keybindings: [2048 | 1024 | 32],
                    contextMenuGroupId: "1_modification",
                    contextMenuOrder: 2,
                    run: () => generateDocs(),
                  });
                  (editor as unknown as Monaco.editor.IStandaloneCodeEditor).addAction({
                    id: "lifemark.formatDocument",
                    label: "Format Document (⇧⌥F)",
                    // Shift + Alt + F = 1024 (Shift) | 512 (Alt) | 33 (F)
                    keybindings: [1024 | 512 | 33],
                    contextMenuGroupId: "1_modification",
                    contextMenuOrder: 1,
                    run: () => formatActiveFile(),
                  });
                  (editor as unknown as Monaco.editor.IStandaloneCodeEditor).addAction({
                    id: "lifemark.explainCode",
                    label: "AI: Explain Code (⌘E)",
                    // Cmd+E = 2048 | 14
                    keybindings: [2048 | 14],
                    contextMenuGroupId: "1_modification",
                    contextMenuOrder: 3,
                    run: () => explainCode(),
                  });
                  // Go to definition — F12
                  (editor as unknown as Monaco.editor.IStandaloneCodeEditor).addAction({
                    id: "lifemark.goToDefinition",
                    label: "Go to Definition (F12)",
                    keybindings: [monaco.KeyCode.F12],
                    contextMenuGroupId: "navigation",
                    contextMenuOrder: 1,
                    run(ed) {
                      (ed as unknown as Monaco.editor.IStandaloneCodeEditor)
                        .getAction("editor.action.revealDefinition")
                        ?.run();
                    },
                  });
                  // Format selection — ⌘K ⌘F
                  (editor as unknown as Monaco.editor.IStandaloneCodeEditor).addAction({
                    id: "lifemark.formatSelection",
                    label: "Format Selection",
                    keybindings: [
                      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyK,
                      monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyF,
                    ],
                    contextMenuGroupId: "1_modification",
                    contextMenuOrder: 1.5,
                    run(ed) {
                      (ed as unknown as Monaco.editor.IStandaloneCodeEditor)
                        .getAction("editor.action.formatSelection")
                        ?.run();
                    },
                  });
                  // Wrap selection with element/tag
                  (editor as unknown as Monaco.editor.IStandaloneCodeEditor).addAction({
                    id: "lifemark.wrapSelection",
                    label: "Wrap Selection with Element…",
                    contextMenuGroupId: "1_modification",
                    contextMenuOrder: 2,
                    run(ed) {
                      const typedEd = ed as unknown as Monaco.editor.IStandaloneCodeEditor;
                      const model = typedEd.getModel();
                      const sel = typedEd.getSelection();
                      if (!model || !sel || sel.isEmpty()) return;
                      const tag = window.prompt("Wrap with element (tag name):", "div");
                      if (!tag) return;
                      const selectedText = model.getValueInRange(sel);
                      const wrapped = `<${tag}>${selectedText}</${tag}>`;
                      typedEd.executeEdits("lifemark.wrapSelection", [{
                        range: sel,
                        text: wrapped,
                        forceMoveMarkers: true,
                      }]);
                    },
                  });
                  // Copy line — ⌘⇧C (when no selection)
                  (editor as unknown as Monaco.editor.IStandaloneCodeEditor).addAction({
                    id: "lifemark.copyLine",
                    label: "Copy Line",
                    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyC],
                    contextMenuGroupId: "9_cutcopypaste",
                    contextMenuOrder: 20,
                    run(ed) {
                      const typedEd = ed as unknown as Monaco.editor.IStandaloneCodeEditor;
                      const model = typedEd.getModel();
                      const sel = typedEd.getSelection();
                      if (!model || !sel) return;
                      const hasSelection = !sel.isEmpty();
                      if (hasSelection) {
                        // fallback: let browser copy handle it
                        document.execCommand("copy");
                        return;
                      }
                      const line = model.getLineContent(sel.startLineNumber);
                      navigator.clipboard.writeText(line).catch(() => {});
                    },
                  });
                  // Rename symbol — F2
                  (editor as unknown as Monaco.editor.IStandaloneCodeEditor).addAction({
                    id: "lifemark.renameSymbol",
                    label: "Rename Symbol (F2)",
                    keybindings: [monaco.KeyCode.F2],
                    contextMenuGroupId: "navigation",
                    contextMenuOrder: 2,
                    run(ed) {
                      (ed as unknown as Monaco.editor.IStandaloneCodeEditor)
                        .getAction("editor.action.rename")
                        ?.run();
                    },
                  });
                  // Select all occurrences — ⌘⇧L
                  (editor as unknown as Monaco.editor.IStandaloneCodeEditor).addAction({
                    id: "lifemark.selectAllOccurrences",
                    label: "Select All Occurrences",
                    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyL],
                    contextMenuGroupId: "2_selection",
                    contextMenuOrder: 1,
                    run(ed) {
                      (ed as unknown as Monaco.editor.IStandaloneCodeEditor)
                        .getAction("editor.action.selectHighlights")
                        ?.run();
                    },
                  });
                  // Delete line — ⌘⇧K
                  (editor as unknown as Monaco.editor.IStandaloneCodeEditor).addAction({
                    id: "lifemark.deleteLine",
                    label: "Delete Line",
                    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyK],
                    contextMenuGroupId: "1_modification",
                    contextMenuOrder: 3,
                    run(ed) {
                      (ed as unknown as Monaco.editor.IStandaloneCodeEditor)
                        .getAction("editor.action.deleteLines")
                        ?.run();
                    },
                  });
                  // Expand selection — ⌘⇧E
                  (editor as unknown as Monaco.editor.IStandaloneCodeEditor).addAction({
                    id: "lifemark.expandSelection",
                    label: "Expand Selection",
                    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyE],
                    contextMenuGroupId: "2_selection",
                    contextMenuOrder: 2,
                    run(ed) {
                      (ed as unknown as Monaco.editor.IStandaloneCodeEditor)
                        .getAction("editor.action.smartSelect.expand")
                        ?.run();
                    },
                  });
                  // Next/prev error — F8 / ⇧F8
                  (editor as unknown as Monaco.editor.IStandaloneCodeEditor).addAction({
                    id: "lifemark.nextError",
                    label: "Go to Next Error",
                    keybindings: [monaco.KeyCode.F8],
                    contextMenuGroupId: "navigation",
                    contextMenuOrder: 3,
                    run(ed) {
                      (ed as unknown as Monaco.editor.IStandaloneCodeEditor)
                        .getAction("editor.action.marker.next")
                        ?.run();
                    },
                  });
                  (editor as unknown as Monaco.editor.IStandaloneCodeEditor).addAction({
                    id: "lifemark.prevError",
                    label: "Go to Previous Error",
                    keybindings: [monaco.KeyMod.Shift | monaco.KeyCode.F8],
                    contextMenuGroupId: "navigation",
                    contextMenuOrder: 4,
                    run(ed) {
                      (ed as unknown as Monaco.editor.IStandaloneCodeEditor)
                        .getAction("editor.action.marker.prev")
                        ?.run();
                    },
                  });
                  // Block comment — ⌘⇧/
                  (editor as unknown as Monaco.editor.IStandaloneCodeEditor).addAction({
                    id: "lifemark.blockComment",
                    label: "Toggle Block Comment",
                    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.Slash],
                    contextMenuGroupId: "1_modification",
                    contextMenuOrder: 4,
                    run(ed) {
                      (ed as unknown as Monaco.editor.IStandaloneCodeEditor)
                        .getAction("editor.action.blockComment")
                        ?.run();
                    },
                  });
                  // Selection floating action bar + selection stats
                  (editor as unknown as Monaco.editor.IStandaloneCodeEditor).onDidChangeCursorSelection((e) => {
                    const sel = e.selection;
                    const isEmpty =
                      sel.startLineNumber === sel.endLineNumber &&
                      sel.startColumn === sel.endColumn;
                    if (isEmpty) { setSelBar(null); setSelStats(null); return; }
                    const typedEditor = editor as unknown as Monaco.editor.IStandaloneCodeEditor;
                    const model = typedEditor.getModel();
                    if (!model) { setSelBar(null); setSelStats(null); return; }
                    const selectedText = model.getValueInRange(sel);
                    if (!selectedText.trim()) { setSelBar(null); setSelStats(null); return; }
                    // Selection stats for status bar
                    const wordCount = selectedText.trim().split(/\s+/).filter(Boolean).length;
                    setSelStats({ chars: selectedText.length, words: wordCount });
                    // Position bar above the selection start
                    const pos = typedEditor.getScrolledVisiblePosition({
                      lineNumber: sel.startLineNumber,
                      column: sel.startColumn,
                    });
                    if (!pos || !editorContainerRef.current) { setSelBar(null); return; }
                    setSelBar({ top: pos.top - 36, left: Math.max(0, pos.left), code: selectedText, sel: sel as unknown as Monaco.Selection });
                  });
                  // Cursor position + file stats for status bar
                  const updateStats = () => {
                    const typedEd = editor as unknown as Monaco.editor.IStandaloneCodeEditor;
                    const pos2 = typedEd.getPosition();
                    if (pos2) setCursorPos({ line: pos2.lineNumber, col: pos2.column });
                    const m = typedEd.getModel();
                    if (m) { const val = m.getValue(); setFileStats({ lines: m.getLineCount(), chars: val.length, words: val.trim().split(/\s+/).filter(Boolean).length }); }
                  };
                  (editor as unknown as Monaco.editor.IStandaloneCodeEditor).onDidChangeCursorPosition(updateStats);
                  (editor as unknown as Monaco.editor.IStandaloneCodeEditor).onDidChangeModelContent(updateStats);
                  updateStats();
                  // Register inline completions provider once per session
                  if (!completionsRegisteredRef.current && projectId) {
                    completionsRegisteredRef.current = true;
                    // eslint-disable-next-line @typescript-eslint/no-explicit-any
                    (monaco as any).languages.registerInlineCompletionsProvider(
                      { pattern: "**" },
                      {
                        provideInlineCompletions: async (
                          model: Monaco.editor.ITextModel,
                          position: Monaco.Position,
                          _context: unknown,
                          token: { isCancellationRequested: boolean },
                        ) => {
                          if (!aiCompletionsRef.current) return { items: [] };
                          const offset = model.getOffsetAt(position);
                          const fullText = model.getValue();
                          const prefix = fullText.slice(0, offset);
                          const suffix = fullText.slice(offset);
                          if (prefix.trimEnd().length < 15) return { items: [] };
                          await new Promise((r) => setTimeout(r, 650));
                          if (token.isCancellationRequested) return { items: [] };
                          try {
                            const res = await fetch("/api/ai/complete", {
                              method: "POST",
                              headers: { "Content-Type": "application/json" },
                              body: JSON.stringify({
                                projectId,
                                prefix,
                                suffix,
                                language: model.getLanguageId(),
                                filename: activeTabRef.current?.path ?? "",
                              }),
                            });
                            if (!res.ok || token.isCancellationRequested) return { items: [] };
                            const data2 = await res.json();
                            const completion: string = data2.completion ?? "";
                            if (!completion || token.isCancellationRequested) return { items: [] };
                            return {
                              items: [{
                                insertText: completion,
                                range: {
                                  startLineNumber: position.lineNumber,
                                  startColumn: position.column,
                                  endLineNumber: position.lineNumber,
                                  endColumn: position.column,
                                },
                              }],
                            };
                          } catch {
                            return { items: [] };
                          }
                        },
                        freeInlineCompletions: () => {},
                      }
                    );
                  }
                }}
                options={{
                  fontSize: editorSettings.fontSize,
                  tabSize: editorSettings.tabSize,
                  wordWrap: editorSettings.wordWrap ? "on" : "off",
                  lineHeight: editorSettings.lineHeight,
                  minimap: { enabled: editorSettings.minimap },
                  scrollBeyondLastLine: false,
                  automaticLayout: true,
                  padding: { top: 12 },
                  lineNumbers: editorSettings.lineNumbers ? "on" : "off",
                  fontLigatures: editorSettings.fontLigatures,
                  suggestOnTriggerCharacters: true,
                  quickSuggestions: true,
                  parameterHints: { enabled: true },
                  formatOnPaste: true,
                  formatOnType: editorSettings.formatOnSave,
                  stickyScroll: { enabled: editorSettings.stickyScroll },
                }}
              />
            </div>
          ))}
          </div>{/* end left pane */}

          {/* Right split pane */}
          {splitEnabled && (
            <div className="flex-1 overflow-hidden flex flex-col border-l border-[#313244]">
              {/* Split pane file selector header */}
              <div className="flex items-center gap-2 px-2 py-1 bg-[#181825] border-b border-[#1e1e2e] shrink-0">
                <Columns2 className="w-3 h-3 text-[#585b70] shrink-0" />
                <select
                  value={splitFileId ?? ""}
                  onChange={(e) => setSplitFileId(e.target.value || null)}
                  className="flex-1 bg-transparent text-[11px] text-[#a6adc8] font-mono outline-none cursor-pointer"
                >
                  <option value="">— pick a file —</option>
                  {(files ?? openTabs).map((f) => (
                    <option key={f.id} value={f.id}>{f.path}</option>
                  ))}
                </select>
                <button
                  onClick={() => setSplitEnabled(false)}
                  className="text-[#585b70] hover:text-[#cdd6f4] transition-colors"
                  title="Close split"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
              {/* Split pane Monaco editor */}
              <div className="flex-1 overflow-hidden">
                {splitFileId ? (() => {
                  const sf = (files ?? openTabs).find((f) => f.id === splitFileId);
                  if (!sf) return null;
                  return (
                    <MonacoEditor
                      height="100%"
                      language={monacoLang(sf.path)}
                      value={contentRef.current.get(sf.id) ?? sf.content ?? ""}
                      theme={themeId}
                      onMount={(editor) => {
                        splitEditorRef.current = editor as unknown as Monaco.editor.IStandaloneCodeEditor;
                      }}
                      options={{
                        fontSize: editorSettings.fontSize,
                        tabSize: editorSettings.tabSize,
                        wordWrap: editorSettings.wordWrap ? "on" : "off",
                        lineHeight: editorSettings.lineHeight,
                        minimap: { enabled: false },
                        scrollBeyondLastLine: false,
                        automaticLayout: true,
                        padding: { top: 12 },
                        lineNumbers: editorSettings.lineNumbers ? "on" : "off",
                        readOnly: false,
                        stickyScroll: { enabled: editorSettings.stickyScroll },
                      }}
                    />
                  );
                })() : (
                  <div className="h-full flex flex-col items-center justify-center gap-2 text-center px-6">
                    <Columns2 className="w-8 h-8 text-[#313244]" />
                    <p className="text-xs text-[#585b70]">Select a file to view it side by side</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Explain Code side drawer */}
          {explainDrawer && (
            <div className="absolute top-0 right-0 h-full w-[340px] z-50 flex flex-col bg-[#181825] border-l border-[#313244] shadow-2xl">
              {/* Drawer header */}
              <div className="flex items-center justify-between px-4 py-2.5 border-b border-[#313244] shrink-0">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-3.5 h-3.5 text-[#cba6f7]" />
                  <span className="text-xs font-semibold text-[#cdd6f4]">
                    Explain Code
                  </span>
                  {explainDrawer.loading && (
                    <Loader2 className="w-3 h-3 text-[#6c7086] animate-spin" />
                  )}
                </div>
                <div className="flex items-center gap-1">
                  {explainDrawer.text && !explainDrawer.loading && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(explainDrawer.text);
                        setExplainCopied(true);
                        setTimeout(() => setExplainCopied(false), 1500);
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-[10px] text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#313244] rounded transition-colors"
                      title="Copy explanation"
                    >
                      {explainCopied
                        ? <Check className="w-3 h-3 text-emerald-400" />
                        : <Copy className="w-3 h-3" />}
                    </button>
                  )}
                  <button
                    onClick={() => setExplainDrawer(null)}
                    className="p-1 text-[#6c7086] hover:text-[#cdd6f4] hover:bg-[#313244] rounded transition-colors"
                    title="Close"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Code snippet preview */}
              <div className="px-3 py-2 border-b border-[#313244] shrink-0 max-h-[100px] overflow-y-auto">
                <pre className="text-[10px] text-[#6c7086] font-mono whitespace-pre-wrap break-all leading-relaxed">
                  {explainDrawer.code.slice(0, 300)}
                  {explainDrawer.code.length > 300 ? "…" : ""}
                </pre>
              </div>

              {/* Explanation text */}
              <div className="flex-1 overflow-y-auto px-4 py-3">
                {explainDrawer.loading && !explainDrawer.text ? (
                  <div className="space-y-2">
                    {[80, 95, 70, 85, 60].map((w, i) => (
                      <div
                        key={i}
                        className="h-2.5 rounded bg-[#313244] animate-pulse"
                        style={{ width: `${w}%` }}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="text-xs text-[#cdd6f4] leading-relaxed whitespace-pre-wrap">
                    {explainDrawer.text || "No explanation available."}
                  </div>
                )}
              </div>

              {/* Footer */}
              {!explainDrawer.loading && (
                <div className="px-4 py-2.5 border-t border-[#313244] shrink-0">
                  <button
                    onClick={() => {
                      if (!explainDrawer) return;
                      window.dispatchEvent(
                        new CustomEvent("monaco-ask-snippet", {
                          detail: {
                            code: explainDrawer.code,
                            filename: activeTab?.path ?? "",
                            instruction: "Explain this code in more detail.",
                          },
                        })
                      );
                      setExplainDrawer(null);
                    }}
                    className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 text-[11px] text-[#cba6f7] bg-[#313244] hover:bg-[#45475a] rounded transition-colors"
                  >
                    <MessageSquare className="w-3 h-3" />
                    Ask follow-up in chat
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Status bar ──────────────────────────────────────────────────────── */}
      {activeTab && (
        <div className="flex items-center justify-between px-3 h-6 bg-[#11111b] border-t border-[#1e1e2e] shrink-0 select-none">
          {/* Left: cursor / selection stats */}
          <div className="flex items-center gap-3">
            {selStats ? (
              <span className="text-[10px] text-[#6c7086] font-mono">
                {selStats.chars} chars · {selStats.words} words selected
              </span>
            ) : (
              <button
                onClick={() => setShowGotoLine(true)}
                className="text-[10px] text-[#6c7086] font-mono hover:text-[#cdd6f4] transition-colors"
                title="Go to line (⌘G)"
              >
                Ln {cursorPos.line}, Col {cursorPos.col}
              </button>
            )}
            <span className="text-[10px] text-[#45475a] font-mono">
              {fileStats.lines} lines · {fileStats.chars} chars
              {activeTab && (activeTab.path.endsWith(".md") || activeTab.path.endsWith(".mdx")) && fileStats.words > 0 && (
                <> · {fileStats.words} words · {Math.max(1, Math.round(fileStats.words / 200))} min read</>
              )}
            </span>
          </div>

          {/* Right: toggles + language */}
          <div className="flex items-center gap-2">
            {/* Minimap toggle */}
            <button
              onClick={() => {
                const next = {
                  ...editorSettings,
                  minimap: !editorSettings.minimap,
                };
                setEditorSettings(next);
                saveEditorSettings(next);
                if (activeTabId) {
                  const ed = editorInstancesRef.current.get(activeTabId);
                  ed?.updateOptions({ minimap: { enabled: next.minimap } });
                }
              }}
              className={`flex items-center gap-1 text-[10px] font-mono px-1 py-0.5 rounded transition-colors ${
                editorSettings.minimap
                  ? "text-[#89b4fa] hover:bg-[#313244]"
                  : "text-[#45475a] hover:text-[#6c7086] hover:bg-[#313244]"
              }`}
              title={editorSettings.minimap ? "Hide minimap" : "Show minimap"}
            >
              <svg
                className="w-3 h-3"
                viewBox="0 0 12 12"
                fill="currentColor"
              >
                <rect x="0" y="0" width="3" height="12" opacity="0.6" />
                <rect x="4" y="2" width="8" height="1" />
                <rect x="4" y="4" width="6" height="1" />
                <rect x="4" y="6" width="7" height="1" />
                <rect x="4" y="8" width="5" height="1" />
                <rect x="4" y="10" width="6" height="1" />
              </svg>
            </button>

            {/* Word-wrap toggle */}
            <button
              onClick={() => {
                const next = {
                  ...editorSettings,
                  wordWrap: !editorSettings.wordWrap,
                };
                setEditorSettings(next);
                saveEditorSettings(next);
                if (activeTabId) {
                  const ed = editorInstancesRef.current.get(activeTabId);
                  ed?.updateOptions({ wordWrap: next.wordWrap ? "on" : "off" });
                }
              }}
              className={`flex items-center gap-1 text-[10px] font-mono px-1 py-0.5 rounded transition-colors ${
                editorSettings.wordWrap
                  ? "text-[#89b4fa] hover:bg-[#313244]"
                  : "text-[#45475a] hover:text-[#6c7086] hover:bg-[#313244]"
              }`}
              title={editorSettings.wordWrap ? "Disable word wrap" : "Enable word wrap"}
            >
              ↵
            </button>

            {/* Session timer — hidden for first 2 minutes */}
            {sessionMinutes >= 2 && (
              <span
                className="text-[10px] text-[#45475a] font-mono"
                title="Time in current session"
              >
                ⏱ {sessionMinutes >= 60
                  ? `${Math.floor(sessionMinutes / 60)}h ${sessionMinutes % 60}m`
                  : `${sessionMinutes}m`}
              </span>
            )}

            {/* Language indicator */}
            <span className="text-[10px] text-[#6c7086] font-mono uppercase tracking-wide">
              {monacoLang(activeTab.path)}
            </span>
            <span className="text-[10px] text-[#45475a] font-mono">UTF-8</span>

            {/* Problems count */}
            {markers.length > 0 && (
              <button
                onClick={() => setShowProblems((v) => !v)}
                className={`flex items-center gap-1 text-[10px] font-mono px-1 py-0.5 rounded transition-colors ${
                  showProblems
                    ? "text-red-400 bg-red-500/10"
                    : "text-red-400/70 hover:text-red-400 hover:bg-[#313244]"
                }`}
                title="Toggle problems panel"
              >
                ⚠ {markers.length}
              </button>
            )}
          </div>
        </div>
      )}

      {/* ── Quick Open palette (⌘P / Ctrl+P) ───────────────────────────────── */}
      {showQuickOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm"
            onClick={() => setShowQuickOpen(false)}
          />
          {/* Modal */}
          <div className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] pointer-events-none">
            <div
              className="w-full max-w-lg bg-[#1e1e2e] border border-[#313244] rounded-xl shadow-2xl overflow-hidden pointer-events-auto"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Search input row */}
              <div className="flex items-center gap-2 px-4 py-3 border-b border-[#313244]">
                <Search className="w-4 h-4 text-[#585b70] shrink-0" />
                <input
                  ref={quickOpenInputRef}
                  value={quickOpenQuery}
                  onChange={(e) => {
                    setQuickOpenQuery(e.target.value);
                    setQuickOpenIdx(0);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape") { e.preventDefault(); setShowQuickOpen(false); return; }
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setQuickOpenIdx((i) => Math.min(i + 1, quickOpenFiles.length - 1));
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setQuickOpenIdx((i) => Math.max(i - 1, 0));
                      return;
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      const f = quickOpenFiles[quickOpenIdx];
                      if (f) openQuickFile(f);
                    }
                  }}
                  placeholder="Search files…"
                  className="flex-1 bg-transparent text-sm text-[#cdd6f4] placeholder-[#45475a] outline-none"
                  spellCheck={false}
                />
                {quickOpenQuery && (
                  <button
                    onClick={() => { setQuickOpenQuery(""); setQuickOpenIdx(0); }}
                    className="text-[#585b70] hover:text-[#cdd6f4] transition-colors"
                    title="Clear"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
                <kbd className="text-[10px] text-[#45475a] border border-[#313244] rounded px-1 py-0.5 font-mono ml-1">esc</kbd>
              </div>

              {/* Results list */}
              <div className="max-h-72 overflow-y-auto py-1">
                {quickOpenFiles.length === 0 ? (
                  <div className="px-4 py-6 text-center text-xs text-[#45475a]">
                    {quickOpenQuery ? "No files match your search" : "No files in this project"}
                  </div>
                ) : (
                  quickOpenFiles.map((f, idx) => {
                    const isActive = idx === quickOpenIdx;
                    const isOpen = openTabs.some((t) => t.id === f.id);
                    const name = basename(f.path);
                    const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : "";
                    const q = quickOpenQuery.toLowerCase();
                    const nameIdx = q ? name.toLowerCase().indexOf(q) : -1;
                    return (
                      <button
                        key={f.id}
                        onClick={() => openQuickFile(f)}
                        className={`w-full flex items-center gap-3 px-4 py-2 text-left transition-colors ${
                          isActive
                            ? "bg-[#313244] text-[#cdd6f4]"
                            : "text-[#a6adc8] hover:bg-[#313244]/60 hover:text-[#cdd6f4]"
                        }`}
                      >
                        <FileCode
                          className="w-3.5 h-3.5 shrink-0"
                          style={{ color: tabColor(f.path) }}
                        />
                        <span className="flex-1 min-w-0 flex items-baseline gap-2 overflow-hidden">
                          <span className="text-sm font-mono shrink-0">
                            {q && nameIdx !== -1 ? (
                              <>
                                {name.slice(0, nameIdx)}
                                <mark className="bg-[#f38ba8]/20 text-[#f38ba8] rounded-sm not-italic">
                                  {name.slice(nameIdx, nameIdx + q.length)}
                                </mark>
                                {name.slice(nameIdx + q.length)}
                              </>
                            ) : name}
                          </span>
                          {dir && (
                            <span className="text-[10px] text-[#585b70] font-mono truncate">
                              {dir}
                            </span>
                          )}
                        </span>
                        {isOpen && (
                          <span className="text-[10px] text-[#89b4fa] shrink-0 ml-auto">open</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>

              {/* Footer hints */}
              <div className="flex items-center gap-4 px-4 py-2 border-t border-[#313244] bg-[#181825]">
                <span className="text-[10px] text-[#45475a]">
                  <kbd className="font-mono border border-[#313244] rounded px-1 py-0.5 mr-1">↑↓</kbd>navigate
                </span>
                <span className="text-[10px] text-[#45475a]">
                  <kbd className="font-mono border border-[#313244] rounded px-1 py-0.5 mr-1">↵</kbd>open
                </span>
                <span className="text-[10px] text-[#45475a]">
                  <kbd className="font-mono border border-[#313244] rounded px-1 py-0.5 mr-1">esc</kbd>close
                </span>
                <span className="text-[10px] text-[#45475a] ml-auto tabular-nums">
                  {quickOpenFiles.length} file{quickOpenFiles.length !== 1 ? "s" : ""}
                </span>
              </div>
            </div>
          </div>
        </>
      )}

      {/* ── Problems panel ──────────────────────────────────────────────────── */}
      {showProblems && markers.length > 0 && (
        <div className="border-t border-[#313244] bg-[#181825] max-h-40 overflow-y-auto shrink-0">
          <div className="px-3 py-1.5 border-b border-[#313244]/40 flex items-center justify-between">
            <span className="text-[10px] text-[#6c7086] font-semibold uppercase tracking-wide">
              Problems ({markers.length})
            </span>
            <button
              onClick={() => setShowProblems(false)}
              className="text-[#6c7086] hover:text-[#cdd6f4]"
            >
              <X className="w-3 h-3" />
            </button>
          </div>
          {markers.map((m, i) => (
            <div
              key={i}
              className="flex items-start gap-2 px-3 py-1 hover:bg-[#313244]/40 cursor-pointer"
              onClick={() => {
                if (!activeTabId) return;
                const ed = editorInstancesRef.current.get(activeTabId);
                if (ed) {
                  ed.revealLineInCenter(m.startLineNumber);
                  ed.setPosition({
                    lineNumber: m.startLineNumber,
                    column: m.startColumn,
                  });
                  ed.focus();
                }
              }}
            >
              <span
                className={`text-[10px] shrink-0 mt-0.5 ${
                  m.severity === 8
                    ? "text-red-400"
                    : m.severity === 4
                    ? "text-amber-400"
                    : "text-blue-400"
                }`}
              >
                {m.severity === 8 ? "✖" : m.severity === 4 ? "⚠" : "ℹ"}
              </span>
              <span className="text-[10px] text-[#a6adc8] font-mono leading-relaxed flex-1 min-w-0">
                {m.message}
              </span>
              <span className="text-[10px] text-[#45475a] font-mono shrink-0">
                {m.startLineNumber}:{m.startColumn}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
