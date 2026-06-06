"use client";

import { useState, useMemo } from "react";
import { Map, Bot, User, FileCode, RefreshCw, ChevronDown, ChevronRight, Search, SlidersHorizontal, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CodeOwnershipPanelProps {
  projectId: string;
  files: { path: string; content: string }[];
}

type OwnershipType = "ai" | "human" | "mixed" | "unknown";

interface FileOwnership {
  path: string;
  type: OwnershipType;
  aiScore: number;       // 0-100: likelihood AI-written
  lines: number;
  size: number;
  reasons: string[];
}

const OWNERSHIP_CONFIG: Record<OwnershipType, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  ai:      { label: "AI Generated",  color: "text-violet-400", bg: "bg-violet-500/10 border-violet-500/20", icon: Bot },
  human:   { label: "Human Written", color: "text-emerald-400", bg: "bg-emerald-500/10 border-emerald-500/20", icon: User },
  mixed:   { label: "Mixed",         color: "text-yellow-400",  bg: "bg-yellow-500/10 border-yellow-500/20",  icon: FileCode },
  unknown: { label: "Unknown",       color: "text-slate-400",   bg: "bg-slate-500/10 border-slate-500/20",    icon: FileCode },
};

// Heuristic analysis of file content to estimate if AI-generated
function analyzeOwnership(path: string, content: string): FileOwnership {
  const lines = content.split("\n").length;
  const size = content.length;
  const reasons: string[] = [];
  let score = 50; // start neutral

  // --- AI indicators (push score up) ---
  // Highly structured JSDoc comments
  const jsdocCount = (content.match(/\/\*\*[\s\S]*?\*\//g) ?? []).length;
  if (jsdocCount > 2) { score += 10; reasons.push("Extensive JSDoc comments"); }

  // Consistent import ordering
  const imports = content.match(/^import .+/gm) ?? [];
  if (imports.length > 5) { score += 5; reasons.push("Organised import block"); }

  // Very even indentation (no mixed tabs/spaces)
  const tabLines = (content.match(/^\t/gm) ?? []).length;
  const spaceLines = (content.match(/^  /gm) ?? []).length;
  if (tabLines > 0 && spaceLines > 0) { score -= 10; reasons.push("Mixed indentation (human trait)"); }
  else if (lines > 20) { score += 5; reasons.push("Consistent indentation"); }

  // Comprehensive error handling
  const tryCatchCount = (content.match(/try\s*\{/g) ?? []).length;
  if (tryCatchCount > 2) { score += 8; reasons.push("Thorough error handling"); }

  // TypeScript generics and interfaces
  const interfaceCount = (content.match(/\binterface\b/g) ?? []).length;
  if (interfaceCount > 3) { score += 8; reasons.push("Rich type annotations"); }

  // Aria labels and accessibility
  if (content.includes("aria-label") || content.includes("role=")) { score += 5; reasons.push("Accessibility attributes present"); }

  // TODO/FIXME comments (human trait)
  const todoCount = (content.match(/\b(TODO|FIXME|HACK|XXX)\b/g) ?? []).length;
  if (todoCount > 0) { score -= 15 * Math.min(todoCount, 3); reasons.push(`${todoCount} TODO/FIXME comment(s) (human trait)`); }

  // Commented-out code blocks
  const commentedCode = (content.match(/\/\/.*[;{}=]/g) ?? []).length;
  if (commentedCode > 3) { score -= 10; reasons.push("Commented-out code (human trait)"); }

  // Console.log statements
  const consoleLogs = (content.match(/console\.log/g) ?? []).length;
  if (consoleLogs > 1) { score -= 12; reasons.push("Debug console.log statements"); }

  // Magic numbers
  const magicNums = (content.match(/\b\d{3,}\b/g) ?? []).length;
  if (magicNums > 5) { score -= 8; reasons.push("Magic numbers in code"); }

  // Uniform naming conventions
  const camelCase = (content.match(/\b[a-z][a-zA-Z0-9]+[A-Z][a-zA-Z0-9]*\b/g) ?? []).length;
  if (camelCase > 10) { score += 5; reasons.push("Consistent camelCase naming"); }

  // File-level patterns: generated files often have complete structure
  if (content.startsWith('"use client"') || content.startsWith("'use client'")) { score += 3; reasons.push('"use client" directive'); }
  if (path.includes(".generated.") || path.includes("_generated")) { score += 30; reasons.push("Filename suggests generated file"); }
  if (path.includes("migration") || path.endsWith(".sql")) { score += 20; reasons.push("SQL/migration file (usually AI)"); }

  // Small files are often human-written configs
  if (lines < 15 && !path.endsWith(".sql")) { score -= 15; reasons.push("Very short file"); }

  // Very large uniform files
  if (lines > 200 && tryCatchCount > 2) { score += 10; reasons.push("Large, well-structured file"); }

  // Clamp
  score = Math.max(0, Math.min(100, score));

  let type: OwnershipType;
  if (score >= 70) type = "ai";
  else if (score <= 35) type = "human";
  else type = "mixed";

  return { path, type, aiScore: score, lines, size, reasons };
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  return `${(bytes / 1024).toFixed(1)}KB`;
}

export function CodeOwnershipPanel({ files }: CodeOwnershipPanelProps) {
  const [search, setSearch] = useState("");
  const [filterType, setFilterType] = useState<OwnershipType | "all">("all");
  const [expandedPath, setExpandedPath] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"path" | "score" | "lines">("score");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [showFilters, setShowFilters] = useState(false);

  const ownership = useMemo<FileOwnership[]>(() => {
    return files
      .filter((f) => /\.(ts|tsx|js|jsx|css|sql|json|md)$/.test(f.path))
      .map((f) => analyzeOwnership(f.path, f.content));
  }, [files]);

  const stats = useMemo(() => {
    const ai = ownership.filter((f) => f.type === "ai").length;
    const human = ownership.filter((f) => f.type === "human").length;
    const mixed = ownership.filter((f) => f.type === "mixed").length;
    const totalLines = ownership.reduce((s, f) => s + f.lines, 0);
    const avgScore = ownership.length ? Math.round(ownership.reduce((s, f) => s + f.aiScore, 0) / ownership.length) : 0;
    return { ai, human, mixed, total: ownership.length, totalLines, avgScore };
  }, [ownership]);

  const filtered = useMemo(() => {
    let result = ownership;
    if (search) result = result.filter((f) => f.path.toLowerCase().includes(search.toLowerCase()));
    if (filterType !== "all") result = result.filter((f) => f.type === filterType);
    result = [...result].sort((a, b) => {
      let va = 0, vb = 0;
      if (sortBy === "score") { va = a.aiScore; vb = b.aiScore; }
      else if (sortBy === "lines") { va = a.lines; vb = b.lines; }
      else { va = a.path.charCodeAt(0); vb = b.path.charCodeAt(0); }
      return sortDir === "desc" ? vb - va : va - vb;
    });
    return result;
  }, [ownership, search, filterType, sortBy, sortDir]);

  function toggleSort(field: "path" | "score" | "lines") {
    if (sortBy === field) setSortDir((d) => d === "desc" ? "asc" : "desc");
    else { setSortBy(field); setSortDir("desc"); }
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Map className="w-4 h-4 text-indigo-400" />
          <h2 className="font-semibold text-foreground">Code Ownership</h2>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-border text-muted-foreground">
            {stats.total} files
          </Badge>
        </div>
        <p className="text-xs text-muted-foreground">Heuristic classification: AI-generated vs human-written code</p>
      </div>

      {/* Stats bar */}
      <div className="grid grid-cols-3 divide-x divide-border border-b border-border">
        {[
          { label: "AI", value: stats.ai, type: "ai" as OwnershipType },
          { label: "Human", value: stats.human, type: "human" as OwnershipType },
          { label: "Mixed", value: stats.mixed, type: "mixed" as OwnershipType },
        ].map(({ label, value, type }) => {
          const cfg = OWNERSHIP_CONFIG[type];
          return (
            <button
              key={label}
              onClick={() => setFilterType(filterType === type ? "all" : type)}
              className={`flex flex-col items-center py-2.5 transition-colors hover:bg-muted/20 ${filterType === type ? cfg.bg : ""}`}
            >
              <span className={`text-base font-bold ${cfg.color}`}>{value}</span>
              <span className="text-[10px] text-muted-foreground">{label}</span>
            </button>
          );
        })}
      </div>

      {/* AI score bar */}
      <div className="px-3 py-2 border-b border-border">
        <div className="flex items-center justify-between text-[10px] text-muted-foreground mb-1">
          <span>Overall AI score</span>
          <span className="font-semibold text-foreground">{stats.avgScore}/100</span>
        </div>
        <div className="h-1.5 rounded-full bg-muted/40 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-yellow-500 to-violet-500 transition-all"
            style={{ width: `${stats.avgScore}%` }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground mt-0.5">
          <span>Human</span>
          <span>{stats.totalLines.toLocaleString()} total lines</span>
          <span>AI</span>
        </div>
      </div>

      {/* Search + filters */}
      <div className="p-2 border-b border-border space-y-1.5">
        <div className="flex gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search files…"
              className="h-7 text-xs pl-7 bg-muted/20 border-border"
            />
          </div>
          <button
            onClick={() => setShowFilters((v) => !v)}
            className={`p-1.5 rounded-md border border-border text-muted-foreground hover:text-foreground transition-colors ${showFilters ? "bg-muted text-foreground" : ""}`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
          </button>
        </div>
        {showFilters && (
          <div className="flex gap-1 flex-wrap text-[10px]">
            <span className="text-muted-foreground self-center">Sort:</span>
            {(["score", "path", "lines"] as const).map((field) => (
              <button
                key={field}
                onClick={() => toggleSort(field)}
                className={`px-2 py-0.5 rounded border capitalize transition-colors ${
                  sortBy === field ? "border-indigo-500/40 text-indigo-400 bg-indigo-500/10" : "border-border text-muted-foreground"
                }`}
              >
                {field} {sortBy === field ? (sortDir === "desc" ? "↓" : "↑") : ""}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Map className="w-7 h-7 text-muted-foreground/30" />
            <p className="text-xs text-muted-foreground">No files match your filter</p>
          </div>
        ) : filtered.map((file) => {
          const cfg = OWNERSHIP_CONFIG[file.type];
          const Icon = cfg.icon;
          const isExpanded = expandedPath === file.path;

          return (
            <div key={file.path} className={`rounded-lg border overflow-hidden ${file.type !== "unknown" ? cfg.bg : "border-border bg-muted/5"}`}>
              <button
                className="w-full flex items-center gap-2 px-2.5 py-2 hover:bg-black/5 transition-colors"
                onClick={() => setExpandedPath(isExpanded ? null : file.path)}
              >
                <Icon className={`w-3.5 h-3.5 shrink-0 ${cfg.color}`} />
                <span className="flex-1 text-xs font-medium text-foreground truncate text-left">{file.path}</span>
                {/* Score pill */}
                <div className="flex items-center gap-1.5 shrink-0">
                  <div className="w-12 h-1.5 rounded-full bg-black/20 overflow-hidden">
                    <div
                      className={`h-full rounded-full ${file.aiScore >= 70 ? "bg-violet-400" : file.aiScore <= 35 ? "bg-emerald-400" : "bg-yellow-400"}`}
                      style={{ width: `${file.aiScore}%` }}
                    />
                  </div>
                  <span className={`text-[10px] font-mono ${cfg.color}`}>{file.aiScore}</span>
                  {isExpanded ? <ChevronDown className="w-3 h-3 text-muted-foreground" /> : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                </div>
              </button>

              {isExpanded && (
                <div className="border-t border-black/10 px-2.5 py-2 space-y-2">
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <Badge variant="outline" className={`text-[9px] h-4 px-1.5 ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </Badge>
                    <span>{file.lines} lines</span>
                    <span>{formatBytes(file.size)}</span>
                    <span>AI score: {file.aiScore}/100</span>
                  </div>
                  {file.reasons.length > 0 && (
                    <div className="space-y-0.5">
                      <p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">Signals</p>
                      <ul className="space-y-0.5">
                        {file.reasons.map((r, i) => (
                          <li key={i} className="text-[10px] text-foreground/70 flex items-start gap-1">
                            <span className="text-muted-foreground mt-0.5">·</span>{r}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="p-3 border-t border-border">
        <p className="text-[10px] text-muted-foreground">
          Score 0–35 = likely human · 36–69 = mixed · 70–100 = likely AI-generated. Heuristic only — not a guarantee.
        </p>
      </div>
    </div>
  );
}
