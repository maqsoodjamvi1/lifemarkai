"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import {
   ChevronLeft, ChevronRight, Check, X, Loader2,
  RefreshCw, FileDiff, ChevronDown, Eye, Minus, Plus,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import dynamic from "next/dynamic";

const MonacoDiffEditor = dynamic(
  () => import("@monaco-editor/react").then((m) => m.DiffEditor),
  { ssr: false, loading: () => <div className="flex-1 flex items-center justify-center"><Loader2 className="w-5 h-5 animate-spin text-muted-foreground" /></div> }
);

interface DiffFile {
  path: string;
  before: string;
  after: string;
  language: string;
  hunks: number; // estimated diff hunks
}

interface DiffViewerPanelProps {
  projectId: string;
  diffs?: DiffFile[]; // injected from editor-layout after AI generation
}

const LANG_MAP: Record<string, string> = {
  ts: "typescript", tsx: "typescript", js: "javascript", jsx: "javascript",
  css: "css", json: "json", md: "markdown", html: "html", sql: "sql",
  py: "python", sh: "shell",
};

function getLang(path: string): string {
  const ext = path.split(".").pop() ?? "";
  return LANG_MAP[ext] ?? "plaintext";
}

function countDiffLines(before: string, after: string): { added: number; removed: number } {
  const beforeLines = new Set(before.split("\n"));
  const afterLines = after.split("\n");
  let added = 0;
  let removed = 0;
  for (const line of afterLines) {
    if (!beforeLines.has(line)) added++;
  }
  const afterSet = new Set(after.split("\n"));
  for (const line of before.split("\n")) {
    if (!afterSet.has(line)) removed++;
  }
  return { added, removed };
}

// Generate a demo diff from snapshots
function useDiffs(projectId: string, externalDiffs?: DiffFile[]) {
  const [diffs, setDiffs] = useState<DiffFile[]>(externalDiffs ?? []);
  const [loading, setLoading] = useState(!externalDiffs);
  const [snapshotLabel, setSnapshotLabel] = useState("Last generation");

  const load = useCallback(async () => {
    if (externalDiffs) { setDiffs(externalDiffs); return; }
    setLoading(true);
    try {
      // Fetch last two snapshots
      const res = await fetch(`/api/projects/${projectId}/snapshots?limit=2`);
      if (!res.ok) throw new Error();
      const data = await res.json() as { snapshots: { id: string; created_at: string; files_snapshot: { path: string; content: string }[] }[] };
      const snapshots = data.snapshots ?? [];
      if (snapshots.length < 2) {
        setDiffs([]);
        return;
      }
      const [latest, prev] = snapshots;
      setSnapshotLabel(new Date(latest.created_at).toLocaleString());

      const prevMap = new Map((prev.files_snapshot ?? []).map((f: { path: string; content: string }) => [f.path, f.content]));
      const latestFiles: { path: string; content: string }[] = latest.files_snapshot ?? [];

      const changed: DiffFile[] = [];
      for (const file of latestFiles) {
        const prevContent = prevMap.get(file.path) ?? "";
        if (prevContent !== file.content) {
          const { added, removed } = countDiffLines(prevContent, file.content);
          changed.push({
            path: file.path,
            before: prevContent,
            after: file.content,
            language: getLang(file.path),
            hunks: Math.max(1, Math.round((added + removed) / 8)),
          });
        }
      }
      setDiffs(changed.sort((a, b) => (b.hunks - a.hunks)));
    } catch { setDiffs([]); }
    finally { setLoading(false); }
  }, [projectId, externalDiffs]);

  useEffect(() => { load(); }, [load]);
  return { diffs, loading, snapshotLabel, reload: load };
}

export function DiffViewerPanel({ projectId, diffs: externalDiffs }: DiffViewerPanelProps) {
  const { diffs: defaultDiffs, loading: defaultLoading, snapshotLabel, reload } = useDiffs(projectId, externalDiffs);
  // Snapshot-pair mode (driven by "lifemark-open-diff" event from the History panel)
  const [pairDiffs, setPairDiffs] = useState<DiffFile[] | null>(null);
  const [pairLoading, setPairLoading] = useState(false);
  const [pairSummary, setPairSummary] = useState<string>("");
  const [pairLabel, setPairLabel] = useState<string>("");

  // Active source — pair-mode trumps default-mode
  const diffs = pairDiffs ?? defaultDiffs;
  const loading = pairLoading || (pairDiffs === null && defaultLoading);

  useEffect(() => {
    function handleOpenDiff(e: Event) {
      const detail = (e as CustomEvent).detail as {
        oldSnapshotId: string;
        newSnapshotId: string;
        projectId?: string;
      };
      if (!detail?.oldSnapshotId || !detail?.newSnapshotId) return;
      void (async () => {
        setPairLoading(true);
        setPairSummary("");
        try {
          const res = await fetch("/api/projects/snapshots/compare", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              oldSnapshotId: detail.oldSnapshotId,
              newSnapshotId: detail.newSnapshotId,
            }),
          });
          if (!res.ok) {
            setPairDiffs([]);
            return;
          }
          const data = await res.json() as {
            diffs: Array<{ path: string; before: string; after: string; language: string }>;
            summary: string;
            oldLabel: string;
            newLabel: string;
          };
          const enriched: DiffFile[] = data.diffs.map((d) => {
            const { added, removed } = countDiffLines(d.before, d.after);
            return {
              path: d.path,
              before: d.before,
              after: d.after,
              language: d.language ?? getLang(d.path),
              hunks: Math.max(1, Math.round((added + removed) / 8)),
            };
          });
          setPairDiffs(enriched);
          setPairSummary(data.summary ?? "");
          setPairLabel(`${data.oldLabel} → ${data.newLabel}`);
        } finally {
          setPairLoading(false);
        }
      })();
    }
    window.addEventListener("lifemark-open-diff", handleOpenDiff as EventListener);
    return () => window.removeEventListener("lifemark-open-diff", handleOpenDiff as EventListener);
  }, []);

  const [selectedIdx, setSelectedIdx] = useState(0);
  const [accepted, setAccepted] = useState<Set<string>>(new Set());
  const [rejected, setRejected] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<"split" | "inline">("split");
  const editorRef = useRef<unknown>(null);

  const selected = diffs[selectedIdx];

  const total = diffs.length;
  const acceptedCount = accepted.size;
  const rejectedCount = rejected.size;
  const pendingCount = total - acceptedCount - rejectedCount;

  function acceptFile(path: string) {
    setAccepted((prev) => new Set([...prev, path]));
    setRejected((prev) => { const s = new Set(prev); s.delete(path); return s; });
  }

  function rejectFile(path: string) {
    setRejected((prev) => new Set([...prev, path]));
    setAccepted((prev) => { const s = new Set(prev); s.delete(path); return s; });
  }

  function getFileStatus(path: string): "accepted" | "rejected" | "pending" {
    if (accepted.has(path)) return "accepted";
    if (rejected.has(path)) return "rejected";
    return "pending";
  }

  function navigateHunk(direction: "next" | "prev") {
    // Monaco diff editor action
    const editor = (editorRef.current as any);
    if (!editor) return;
    if (direction === "next") editor.getModifiedEditor?.()?.getAction?.("editor.action.diffReview.next")?.run?.();
    else editor.getModifiedEditor?.()?.getAction?.("editor.action.diffReview.prev")?.run?.();
  }

  const allResolved = total > 0 && pendingCount === 0;

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border shrink-0">
        <div className="flex items-center gap-2 mb-1">
          <FileDiff className="w-4 h-4 text-blue-400" />
          <h2 className="font-semibold text-foreground">Diff Viewer</h2>
          {total > 0 && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-border text-muted-foreground">
              {total} file{total !== 1 ? "s" : ""} changed
            </Badge>
          )}
        </div>
        <p className="text-[10px] text-muted-foreground truncate">vs. {pairDiffs ? pairLabel : snapshotLabel}</p>
      </div>

      {/* AI summary of what changed — only shown in snapshot-pair mode */}
      {pairDiffs && (pairSummary || pairLoading) && (
        <div className="px-3 py-2 border-b border-border bg-violet-500/5 shrink-0">
          <div className="flex items-start gap-2">
            <Sparkles className="w-3 h-3 text-violet-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <div className="text-[10px] font-semibold text-violet-300 mb-0.5">What changed (AI summary)</div>
              {pairLoading && !pairSummary ? (
                <div className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Loader2 className="w-2.5 h-2.5 animate-spin" />
                  Analyzing the diff…
                </div>
              ) : (
                <p className="text-[11px] text-foreground/85 leading-relaxed whitespace-pre-wrap">
                  {pairSummary}
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Status bar */}
      {total > 0 && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/10 text-[10px] shrink-0">
          <span className="flex items-center gap-1 text-emerald-400">
            <Check className="w-3 h-3" />{acceptedCount} accepted
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="flex items-center gap-1 text-red-400">
            <X className="w-3 h-3" />{rejectedCount} rejected
          </span>
          <span className="text-muted-foreground/40">·</span>
          <span className="flex items-center gap-1 text-muted-foreground">
            <FileDiff className="w-3 h-3" />{pendingCount} pending
          </span>
          <div className="flex-1" />
          <button
            onClick={() => setViewMode((v) => v === "split" ? "inline" : "split")}
            className="text-muted-foreground hover:text-foreground px-1.5 py-0.5 rounded border border-border"
          >
            {viewMode === "split" ? "Inline" : "Split"}
          </button>
          <button onClick={reload} className="text-muted-foreground hover:text-foreground p-0.5 rounded">
            <RefreshCw className="w-3 h-3" />
          </button>
        </div>
      )}

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
            <p className="text-xs text-muted-foreground">Loading diff…</p>
          </div>
        </div>
      ) : total === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="flex flex-col items-center gap-3 text-center px-6">
            <FileDiff className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-sm font-medium text-foreground">No changes to show</p>
            <p className="text-xs text-muted-foreground">
              Diffs appear here after each AI generation. Trigger a generation to see changes.
            </p>
          </div>
        </div>
      ) : (
        <div className="flex flex-col flex-1 min-h-0">
          {/* File list */}
          <div className="border-b border-border shrink-0 max-h-36 overflow-y-auto">
            {diffs.map((file, idx) => {
              const status = getFileStatus(file.path);
              const { added, removed } = countDiffLines(file.before, file.after);
              return (
                <button
                  key={file.path}
                  onClick={() => setSelectedIdx(idx)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left border-b border-border/50 last:border-0 hover:bg-muted/20 transition-colors ${
                    idx === selectedIdx ? "bg-muted/30" : ""
                  }`}
                >
                  <div className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                    status === "accepted" ? "bg-emerald-400" :
                    status === "rejected" ? "bg-red-400" : "bg-blue-400"
                  }`} />
                  <span className="flex-1 text-xs font-mono text-foreground truncate">{file.path}</span>
                  <span className="text-[10px] text-emerald-400 font-mono shrink-0">+{added}</span>
                  <span className="text-[10px] text-red-400 font-mono shrink-0">-{removed}</span>
                  {idx === selectedIdx ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" /> : null}
                </button>
              );
            })}
          </div>

          {/* Monaco diff editor */}
          {selected && (
            <div className="flex flex-col flex-1 min-h-0">
              {/* File header */}
              <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/5 shrink-0">
                <span className="text-[10px] font-mono text-foreground flex-1 truncate">{selected.path}</span>
                <button onClick={() => navigateHunk("prev")} className="p-0.5 text-muted-foreground hover:text-foreground rounded">
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="text-[10px] text-muted-foreground">{selected.hunks} hunk{selected.hunks !== 1 ? "s" : ""}</span>
                <button onClick={() => navigateHunk("next")} className="p-0.5 text-muted-foreground hover:text-foreground rounded">
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="flex-1 min-h-0 overflow-hidden">
                <MonacoDiffEditor
                  original={selected.before}
                  modified={selected.after}
                  language={selected.language}
                  theme="vs-dark"
                  options={{
                    renderSideBySide: viewMode === "split",
                    readOnly: true,
                    minimap: { enabled: false },
                    scrollBeyondLastLine: false,
                    fontSize: 11,
                    lineNumbers: "on",
                    folding: false,
                    wordWrap: "on",
                    diffWordWrap: "on",
                  }}
                  onMount={(editor) => { editorRef.current = editor; }}
                />
              </div>

              {/* Accept / Reject buttons */}
              <div className="shrink-0 flex gap-2 p-2 border-t border-border bg-background">
                <Button
                  size="sm"
                  variant="outline"
                  className={`flex-1 gap-1.5 text-xs h-8 ${getFileStatus(selected.path) === "rejected" ? "border-red-500/40 text-red-400 bg-red-500/10" : ""}`}
                  onClick={() => rejectFile(selected.path)}
                >
                  <Minus className="w-3 h-3" /> Revert
                </Button>
                <Button
                  size="sm"
                  className={`flex-1 gap-1.5 text-xs h-8 ${getFileStatus(selected.path) === "accepted" ? "bg-emerald-600 hover:bg-emerald-700" : ""}`}
                  onClick={() => acceptFile(selected.path)}
                >
                  <Plus className="w-3 h-3" /> Keep
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* All resolved banner */}
      {allResolved && (
        <div className="shrink-0 px-3 py-2 bg-emerald-500/10 border-t border-emerald-500/20 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-400" />
          <p className="text-xs text-emerald-300 font-medium">All {total} files reviewed</p>
          <div className="flex-1" />
          <button onClick={() => { setAccepted(new Set()); setRejected(new Set()); }} className="text-[10px] text-emerald-400/70 hover:text-emerald-300">
            Reset
          </button>
        </div>
      )}

      {/* Legend */}
      <div className="shrink-0 px-3 py-2 border-t border-border flex items-center gap-3 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><Eye className="w-2.5 h-2.5" /> J/K to jump hunks</span>
        <span>·</span>
        <span className="flex items-center gap-1 text-emerald-400"><Plus className="w-2.5 h-2.5" /> Keep = accept change</span>
        <span>·</span>
        <span className="flex items-center gap-1 text-red-400"><Minus className="w-2.5 h-2.5" /> Revert = discard</span>
      </div>
    </div>
  );
}
