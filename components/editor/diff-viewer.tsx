"use client";

import { useMemo } from "react";
import { Plus, Minus, FileCode, CheckCircle2, RotateCcw, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface DiffLine {
  type: "added" | "removed" | "unchanged";
  content: string;
  lineNumber: { old: number | null; new: number | null };
}

interface FileDiff {
  path: string;
  oldContent: string;
  newContent: string;
  lines: DiffLine[];
  additions: number;
  deletions: number;
}

export type FileState = "accepted" | "reverted" | "pending";

interface DiffViewerProps {
  diffs: FileDiff[];
  compact?: boolean;
  fileStates?: Record<string, FileState>;
  onAccept?: (path: string) => void;
  onRevert?: (path: string, oldContent: string) => void;
  onReApply?: (path: string, newContent: string) => void;
}

function computeDiff(oldText: string, newText: string): DiffLine[] {
  const oldLines = oldText.split("\n");
  const newLines = newText.split("\n");

  // Simple LCS-based diff
  const m = oldLines.length;
  const n = newLines.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      if (oldLines[i] === newLines[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: DiffLine[] = [];
  let i = 0, j = 0;
  let oldNum = 1, newNum = 1;

  while (i < m || j < n) {
    if (i < m && j < n && oldLines[i] === newLines[j]) {
      result.push({ type: "unchanged", content: oldLines[i], lineNumber: { old: oldNum++, new: newNum++ } });
      i++; j++;
    } else if (j < n && (i >= m || dp[i][j + 1] >= dp[i + 1][j])) {
      result.push({ type: "added", content: newLines[j], lineNumber: { old: null, new: newNum++ } });
      j++;
    } else {
      result.push({ type: "removed", content: oldLines[i], lineNumber: { old: oldNum++, new: null } });
      i++;
    }
  }

  return result;
}

export function computeFileDiff(path: string, oldContent: string, newContent: string): FileDiff {
  const lines = computeDiff(oldContent, newContent);
  const additions = lines.filter((l) => l.type === "added").length;
  const deletions = lines.filter((l) => l.type === "removed").length;
  return { path, oldContent, newContent, lines, additions, deletions };
}

function getContextLines(lines: DiffLine[], contextSize = 3): DiffLine[][] {
  const changed = new Set<number>();
  lines.forEach((l, i) => { if (l.type !== "unchanged") changed.add(i); });

  const visible = new Set<number>();
  changed.forEach((idx) => {
    for (let k = Math.max(0, idx - contextSize); k <= Math.min(lines.length - 1, idx + contextSize); k++) {
      visible.add(k);
    }
  });

  const chunks: DiffLine[][] = [];
  let current: DiffLine[] = [];
  let lastVisible = -1;

  lines.forEach((line, i) => {
    if (!visible.has(i)) {
      if (current.length > 0) { chunks.push(current); current = []; }
      lastVisible = -1;
      return;
    }
    if (lastVisible >= 0 && i > lastVisible + 1) {
      chunks.push(current); current = [];
    }
    current.push(line);
    lastVisible = i;
  });

  if (current.length > 0) chunks.push(current);
  return chunks;
}

export function DiffViewer({ diffs, compact = false, fileStates, onAccept, onRevert, onReApply }: DiffViewerProps) {
  if (diffs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <FileCode className="h-8 w-8 mb-2 opacity-30" />
        <p className="text-sm">No changes to display</p>
      </div>
    );
  }

  // Summary row — show only when action callbacks are provided
  const showActions = !!(onAccept || onRevert || onReApply);
  const allAccepted = showActions && diffs.every((d) => (fileStates?.[d.path] ?? "accepted") === "accepted");
  const allReverted = showActions && diffs.every((d) => (fileStates?.[d.path] ?? "accepted") === "reverted");

  return (
    <div className="space-y-2 font-mono text-xs">
      {/* Bulk actions */}
      {showActions && diffs.length > 1 && (
        <div className="flex items-center gap-2 pb-1">
          <span className="text-[10px] text-muted-foreground">{diffs.length} files changed</span>
          <div className="flex-1" />
          {!allAccepted && (
            <button
              onClick={() => diffs.forEach((d) => onAccept?.(d.path))}
              className="flex items-center gap-1 text-[10px] text-green-400 hover:text-green-300 transition-colors"
            >
              <CheckCircle2 className="w-3 h-3" /> Accept all
            </button>
          )}
          {!allReverted && (
            <button
              onClick={() => diffs.forEach((d) => onRevert?.(d.path, d.oldContent))}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              <RotateCcw className="w-3 h-3" /> Revert all
            </button>
          )}
        </div>
      )}
      {diffs.map((diff) => (
        <FileDiffBlock
          key={diff.path}
          diff={diff}
          compact={compact}
          fileState={fileStates?.[diff.path] ?? "accepted"}
          onAccept={onAccept ? () => onAccept(diff.path) : undefined}
          onRevert={onRevert ? () => onRevert(diff.path, diff.oldContent) : undefined}
          onReApply={onReApply ? () => onReApply(diff.path, diff.newContent) : undefined}
        />
      ))}
    </div>
  );
}

function FileDiffBlock({
  diff, compact, fileState, onAccept, onRevert, onReApply,
}: {
  diff: FileDiff;
  compact: boolean;
  fileState?: FileState;
  onAccept?: () => void;
  onRevert?: () => void;
  onReApply?: () => void;
}) {
  const chunks = useMemo(() => getContextLines(diff.lines, compact ? 2 : 3), [diff.lines, compact]);

  const isReverted = fileState === "reverted";

  return (
    <div className={`border rounded-lg overflow-hidden transition-colors ${
      isReverted ? "border-orange-500/30 opacity-60" : "border-border"
    }`}>
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2 bg-muted/50 border-b border-border text-xs">
        <FileCode className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <span className="text-foreground font-medium flex-1 truncate min-w-0">{diff.path}</span>
        {/* +/- counts */}
        <div className="flex items-center gap-1.5 shrink-0">
          {diff.additions > 0 && (
            <span className="text-green-500 flex items-center gap-0.5">
              <Plus className="h-3 w-3" />{diff.additions}
            </span>
          )}
          {diff.deletions > 0 && (
            <span className="text-red-500 flex items-center gap-0.5">
              <Minus className="h-3 w-3" />{diff.deletions}
            </span>
          )}
        </div>
        {/* Accept / Revert buttons */}
        {(onAccept || onRevert || onReApply) && (
          <div className="flex items-center gap-1 shrink-0 ml-1">
            {isReverted ? (
              <>
                <span className="text-orange-400 flex items-center gap-1">
                  <RotateCcw className="w-3 h-3" /> Reverted
                </span>
                {onReApply && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 px-1.5 text-[10px] text-green-400 hover:text-green-300 hover:bg-green-500/10"
                    onClick={onReApply}
                  >
                    <RefreshCw className="w-2.5 h-2.5 mr-0.5" /> Re-apply
                  </Button>
                )}
              </>
            ) : (
              <>
                <span className="text-green-400 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" />
                </span>
                {onRevert && (
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-5 px-1.5 text-[10px] text-muted-foreground hover:text-foreground hover:bg-muted"
                    onClick={onRevert}
                  >
                    <RotateCcw className="w-2.5 h-2.5 mr-0.5" /> Revert
                  </Button>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Diff lines */}
      <div className="overflow-x-auto bg-[#1e1e2e]">
        {chunks.length === 0 ? (
          <div className="px-4 py-2 text-muted-foreground text-xs">File unchanged</div>
        ) : (
          chunks.map((chunk, ci) => (
            <div key={ci}>
              {ci > 0 && (
                <div className="px-4 py-0.5 bg-blue-500/10 text-blue-400 text-xs border-y border-blue-500/20">
                  @@ ... @@
                </div>
              )}
              {chunk.map((line, li) => (
                <div
                  key={li}
                  className={`flex min-w-0 ${
                    line.type === "added"
                      ? "bg-green-500/10"
                      : line.type === "removed"
                      ? "bg-red-500/10"
                      : ""
                  }`}
                >
                  {/* Line numbers */}
                  <div className="flex-shrink-0 w-16 flex select-none">
                    <span className="w-8 px-1 py-0.5 text-right text-muted-foreground/40 border-r border-border/30">
                      {line.lineNumber.old ?? ""}
                    </span>
                    <span className="w-8 px-1 py-0.5 text-right text-muted-foreground/40 border-r border-border/30">
                      {line.lineNumber.new ?? ""}
                    </span>
                  </div>
                  {/* Sign */}
                  <span className={`flex-shrink-0 w-5 py-0.5 text-center select-none ${
                    line.type === "added" ? "text-green-400" : line.type === "removed" ? "text-red-400" : "text-muted-foreground/20"
                  }`}>
                    {line.type === "added" ? "+" : line.type === "removed" ? "-" : " "}
                  </span>
                  {/* Content */}
                  <span className={`flex-1 py-0.5 px-2 whitespace-pre overflow-hidden ${
                    line.type === "added"
                      ? "text-green-300"
                      : line.type === "removed"
                      ? "text-red-300 line-through opacity-70"
                      : "text-slate-300"
                  }`}>
                    {line.content || " "}
                  </span>
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
