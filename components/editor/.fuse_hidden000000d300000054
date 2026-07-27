"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, FileCode2, X, ChevronDown, ChevronRight, Loader2, Replace, ReplaceAll } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { ProjectFile } from "@/types/database";

interface SearchMatch {
  line: number;
  col: number;
  text: string;          // full line text
  highlight: [number, number]; // [start, end] of match within line
}

interface FileResult {
  file: ProjectFile;
  matches: SearchMatch[];
  expanded: boolean;
}

interface SearchPanelProps {
  files: ProjectFile[];
  projectId: string;
  onFileSelect: (file: ProjectFile, line?: number) => void;
  onFilesUpdate: (files: ProjectFile[]) => void;
}

function escapeRegex(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function highlight(text: string, start: number, end: number) {
  return (
    <>
      <span className="text-muted-foreground">{text.slice(0, start)}</span>
      <mark className="bg-yellow-400/30 text-yellow-300 rounded-sm px-0.5">{text.slice(start, end)}</mark>
      <span className="text-muted-foreground">{text.slice(end)}</span>
    </>
  );
}

export function SearchPanel({ files, projectId, onFileSelect, onFilesUpdate }: SearchPanelProps) {
  const [query, setQuery] = useState("");
  const [replaceValue, setReplaceValue] = useState("");
  const [showReplace, setShowReplace] = useState(false);
  const [caseSensitive, setCaseSensitive] = useState(false);
  const [useRegex, setUseRegex] = useState(false);
  const [results, setResults] = useState<FileResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [totalMatches, setTotalMatches] = useState(0);
  const [replacing, setReplacing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const buildRegex = useCallback(
    (q: string) => {
      if (!q.trim()) return null;
      try {
        return useRegex
          ? new RegExp(q, caseSensitive ? "g" : "gi")
          : new RegExp(escapeRegex(q), caseSensitive ? "g" : "gi");
      } catch {
        return null;
      }
    },
    [useRegex, caseSensitive]
  );

  const runSearch = useCallback(
    (q: string) => {
      if (!q.trim()) {
        setResults([]);
        setTotalMatches(0);
        return;
      }

      setSearching(true);
      // Defer to avoid blocking the render
      setTimeout(() => {
        try {
          const regex = buildRegex(q);
          if (!regex) { setResults([]); setTotalMatches(0); setSearching(false); return; }

          let total = 0;
          const found: FileResult[] = [];

          for (const file of files) {
            const lines = (file.content ?? "").split("\n");
            const matches: SearchMatch[] = [];

            for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
              const line = lines[lineIdx];
              regex.lastIndex = 0;
              let m: RegExpExecArray | null;
              while ((m = regex.exec(line)) !== null) {
                matches.push({
                  line: lineIdx + 1,
                  col: m.index + 1,
                  text: line.length > 120 ? line.slice(0, 120) + "…" : line,
                  highlight: [m.index, m.index + m[0].length],
                });
                // Prevent infinite loop on zero-length match
                if (m[0].length === 0) regex.lastIndex++;
              }
            }

            if (matches.length > 0) {
              total += matches.length;
              found.push({ file, matches: matches.slice(0, 50), expanded: true });
            }
          }

          setResults(found);
          setTotalMatches(total);
        } catch {
          // Invalid regex — clear
          setResults([]);
          setTotalMatches(0);
        } finally {
          setSearching(false);
        }
      }, 50);
    },
    [files, buildRegex]
  );

  useEffect(() => {
    const t = setTimeout(() => runSearch(query), 180);
    return () => clearTimeout(t);
  }, [query, runSearch]);

  function toggleExpand(fileId: string) {
    setResults((prev) =>
      prev.map((r) => (r.file.id === fileId ? { ...r, expanded: !r.expanded } : r))
    );
  }

  function fileIcon(path: string) {
    const ext = path.split(".").pop() ?? "";
    const colors: Record<string, string> = {
      tsx: "text-cyan-400", ts: "text-blue-400", jsx: "text-cyan-300",
      js: "text-yellow-400", css: "text-pink-400", json: "text-orange-400",
      html: "text-orange-300", md: "text-slate-400",
    };
    return colors[ext] ?? "text-slate-500";
  }

  async function persistFile(updated: ProjectFile) {
    await fetch(`/api/projects/${projectId}/files`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        path: updated.path,
        content: updated.content,
        language: updated.language,
      }),
    });
  }

  async function replaceInFile(result: FileResult) {
    if (!query.trim()) return;
    const regex = buildRegex(query);
    if (!regex) return;

    const newContent = (result.file.content ?? "").replace(regex, replaceValue);
    if (newContent === result.file.content) return;

    const updated: ProjectFile = { ...result.file, content: newContent, updated_at: new Date().toISOString() };

    setReplacing(true);
    try {
      await persistFile(updated);
      onFilesUpdate(
        files.map((f) => (f.id === updated.id ? updated : f))
      );
      toast({
        title: "Replaced in file",
        description: `Replaced matches in ${result.file.path.split("/").pop()}`,
      });
      // Re-run search to refresh results
      setTimeout(() => runSearch(query), 100);
    } catch {
      toast({ title: "Replace failed", variant: "destructive" });
    } finally {
      setReplacing(false);
    }
  }

  async function replaceAll() {
    if (!query.trim() || results.length === 0) return;
    const regex = buildRegex(query);
    if (!regex) return;

    setReplacing(true);
    let replacedFiles = 0;
    const updatedFiles = [...files];

    try {
      for (const result of results) {
        // Re-create regex for each file (reset lastIndex)
        const r = buildRegex(query)!;
        const newContent = (result.file.content ?? "").replace(r, replaceValue);
        if (newContent === result.file.content) continue;

        const updated: ProjectFile = { ...result.file, content: newContent, updated_at: new Date().toISOString() };
        await persistFile(updated);
        const idx = updatedFiles.findIndex((f) => f.id === updated.id);
        if (idx !== -1) updatedFiles[idx] = updated;
        replacedFiles++;
      }

      if (replacedFiles > 0) {
        onFilesUpdate(updatedFiles);
        toast({
          title: "Replace All complete",
          description: `Updated ${replacedFiles} file${replacedFiles !== 1 ? "s" : ""}`,
        });
        setTimeout(() => runSearch(query), 100);
      } else {
        toast({ title: "Nothing to replace" });
      }
    } catch {
      toast({ title: "Replace All failed", variant: "destructive" });
    } finally {
      setReplacing(false);
    }
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Search / Replace input area */}
      <div className="p-3 space-y-2 border-b border-border/50">
        {/* Search row */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search files…"
            className="pl-8 pr-8 h-8 text-xs bg-muted/30 border-white/10 focus-visible:ring-1 focus-visible:ring-primary/50"
            autoFocus
          />
          {query && (
            <button
              onClick={() => { setQuery(""); setResults([]); setTotalMatches(0); }}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Replace row */}
        <AnimatePresence initial={false}>
          {showReplace && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="overflow-hidden"
            >
              <div className="relative">
                <Replace className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <Input
                  value={replaceValue}
                  onChange={(e) => setReplaceValue(e.target.value)}
                  placeholder="Replace with…"
                  className="pl-8 pr-3 h-8 text-xs bg-muted/30 border-white/10 focus-visible:ring-1 focus-visible:ring-primary/50"
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Options row */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setCaseSensitive((v) => !v)}
            title="Match case"
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
              caseSensitive
                ? "bg-primary/20 border-primary/40 text-primary"
                : "border-border/50 text-muted-foreground hover:border-border"
            }`}
          >
            Aa
          </button>
          <button
            onClick={() => setUseRegex((v) => !v)}
            title="Use regex"
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
              useRegex
                ? "bg-primary/20 border-primary/40 text-primary"
                : "border-border/50 text-muted-foreground hover:border-border"
            }`}
          >
            .*
          </button>
          <button
            onClick={() => setShowReplace((v) => !v)}
            title="Toggle replace"
            className={`px-1.5 py-0.5 rounded text-[10px] font-mono border transition-colors ${
              showReplace
                ? "bg-primary/20 border-primary/40 text-primary"
                : "border-border/50 text-muted-foreground hover:border-border"
            }`}
          >
            abâ
          </button>
          {totalMatches > 0 && (
            <span className="ml-auto text-[10px] text-muted-foreground">
              {totalMatches > 999 ? "999+" : totalMatches} match{totalMatches !== 1 ? "es" : ""}
            </span>
          )}
          {searching && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground ml-auto" />}
        </div>

        {/* Replace All button */}
        {showReplace && results.length > 0 && (
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-[11px] gap-1.5"
            onClick={replaceAll}
            disabled={replacing || !query.trim()}
          >
            {replacing ? <Loader2 className="w-3 h-3 animate-spin" /> : <ReplaceAll className="w-3 h-3" />}
            Replace All ({totalMatches > 999 ? "999+" : totalMatches})
          </Button>
        )}
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!query.trim() && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <Search className="w-8 h-8 opacity-20" />
            <p className="text-xs">Search across all project files</p>
          </div>
        )}

        {query.trim() && results.length === 0 && !searching && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <p className="text-xs">No results for <span className="text-foreground font-mono">&quot;{query}&quot;</span></p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {results.map((result) => (
            <motion.div
              key={result.file.id}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* File header */}
              <div className="w-full flex items-center gap-1.5 px-3 py-1.5 hover:bg-muted/40 transition-colors group">
                <button
                  onClick={() => toggleExpand(result.file.id)}
                  className="flex items-center gap-1.5 flex-1 min-w-0 text-left"
                >
                  {result.expanded
                    ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                    : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />
                  }
                  <FileCode2 className={`w-3.5 h-3.5 shrink-0 ${fileIcon(result.file.path)}`} />
                  <span className="text-xs font-medium truncate flex-1">{result.file.path.split("/").pop()}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0 ml-1">
                    {result.matches.length}{result.matches.length === 50 ? "+" : ""}
                  </span>
                </button>
                {/* Per-file replace button */}
                {showReplace && query.trim() && (
                  <button
                    onClick={() => replaceInFile(result)}
                    disabled={replacing}
                    title="Replace in this file"
                    className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-primary shrink-0 ml-1"
                  >
                    {replacing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Replace className="w-3 h-3" />}
                  </button>
                )}
              </div>

              {/* Match lines */}
              <AnimatePresence initial={false}>
                {result.expanded && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.15 }}
                    className="overflow-hidden"
                  >
                    {result.matches.map((match, idx) => (
                      <button
                        key={idx}
                        onClick={() => onFileSelect(result.file, match.line)}
                        className="w-full flex items-start gap-2 pl-8 pr-3 py-0.5 hover:bg-muted/30 transition-colors text-left"
                      >
                        <span className="text-[10px] text-muted-foreground/60 w-8 shrink-0 text-right font-mono pt-px">
                          {match.line}
                        </span>
                        <span className="text-[11px] font-mono truncate leading-5">
                          {highlight(
                            match.text.trimStart(),
                            match.highlight[0] - (match.text.length - match.text.trimStart().length),
                            match.highlight[1] - (match.text.length - match.text.trimStart().length),
                          )}
                        </span>
                      </button>
                    ))}
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
