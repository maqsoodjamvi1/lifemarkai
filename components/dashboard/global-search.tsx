"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, FolderOpen, FileCode2, MessageSquare,
  Loader2, X, ArrowRight, CornerDownLeft,
} from "lucide-react";
import type { SearchResult } from "@/app/api/search/route";

const TYPE_CONFIG = {
  project: { icon: FolderOpen,    label: "Projects",  color: "text-violet-400" },
  file:    { icon: FileCode2,     label: "Files",     color: "text-blue-400"   },
  message: { icon: MessageSquare, label: "Chat",      color: "text-emerald-400"},
} as const;

function groupResults(results: SearchResult[]) {
  const groups: Record<string, SearchResult[]> = {};
  for (const r of results) {
    if (!groups[r.type]) groups[r.type] = [];
    groups[r.type].push(r);
  }
  return groups;
}

export function GlobalSearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [activeIdx, setActiveIdx] = useState(0);
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Open on ⌘F or /
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && (e.key === "f" || e.key === "k") && !e.shiftKey) {
        // Only intercept when not inside Monaco
        const active = document.activeElement;
        if (active?.closest(".monaco-editor")) return;
        e.preventDefault();
        setOpen(true);
      }
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
      setQuery("");
      setResults([]);
      setActiveIdx(0);
    }
  }, [open]);

  // Debounced search
  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q.trim())}`);
      if (!res.ok) throw new Error("Search failed");
      const data = await res.json();
      setResults(data.results ?? []);
      setActiveIdx(0);
    } catch {
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, []);

  function handleChange(val: string) {
    setQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void search(val), 280);
  }

  function navigate(url: string) {
    setOpen(false);
    router.push(url);
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && results[activeIdx]) {
      e.preventDefault();
      navigate(results[activeIdx].url);
    }
  }

  const groups = groupResults(results);
  // Flat ordered list for arrow-key navigation
  const flat = [
    ...(groups.project ?? []),
    ...(groups.file ?? []),
    ...(groups.message ?? []),
  ];

  return (
    <>
      {/* Trigger button */}
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-2 h-8 px-3 rounded-lg border border-border bg-muted/40 text-xs text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
      >
        <Search className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Search projects, files, chat…</span>
        <kbd className="hidden sm:inline-flex items-center gap-0.5 ml-1 px-1.5 py-0.5 rounded text-[10px] border border-border bg-background font-mono">
          ⌘K
        </kbd>
      </button>

      {/* Overlay */}
      <AnimatePresence>
        {open && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.15 }}
              className="fixed inset-0 z-50 bg-background/60 backdrop-blur-sm"
              onClick={() => setOpen(false)}
            />

            {/* Modal */}
            <motion.div
              initial={{ opacity: 0, scale: 0.97, y: -8 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.97, y: -8 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="fixed top-[15vh] left-1/2 -translate-x-1/2 z-50 w-full max-w-2xl"
            >
              <div className="mx-4 rounded-2xl border border-border bg-card shadow-2xl overflow-hidden">
                {/* Search input row */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
                  {loading ? (
                    <Loader2 className="w-4 h-4 text-muted-foreground animate-spin flex-shrink-0" />
                  ) : (
                    <Search className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  )}
                  <input
                    ref={inputRef}
                    value={query}
                    onChange={(e) => handleChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="Search projects, files, and chat messages…"
                    className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                  />
                  {query && (
                    <button
                      onClick={() => { setQuery(""); setResults([]); inputRef.current?.focus(); }}
                      className="text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                  <button
                    onClick={() => setOpen(false)}
                    className="hidden sm:flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground border border-border rounded px-1.5 py-0.5 font-mono transition-colors"
                  >
                    Esc
                  </button>
                </div>

                {/* Results */}
                <div className="max-h-[60vh] overflow-y-auto">
                  {query.trim().length < 2 && (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      Type at least 2 characters to search
                    </div>
                  )}

                  {query.trim().length >= 2 && !loading && results.length === 0 && (
                    <div className="px-4 py-8 text-center text-sm text-muted-foreground">
                      No results for <span className="font-medium text-foreground">"{query}"</span>
                    </div>
                  )}

                  {Object.entries(groups).map(([type, items]) => {
                    const cfg = TYPE_CONFIG[type as keyof typeof TYPE_CONFIG];
                    const Icon = cfg.icon;
                    return (
                      <div key={type} className="py-2">
                        {/* Group header */}
                        <div className="flex items-center gap-2 px-4 py-1.5">
                          <Icon className={`w-3 h-3 ${cfg.color}`} />
                          <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                            {cfg.label}
                          </span>
                        </div>

                        {/* Items */}
                        {items.map((result) => {
                          const flatIdx = flat.findIndex((r) => r.id === result.id && r.type === result.type);
                          const isActive = flatIdx === activeIdx;
                          return (
                            <button
                              key={`${result.type}-${result.id}`}
                              onClick={() => navigate(result.url)}
                              onMouseEnter={() => setActiveIdx(flatIdx)}
                              className={`w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors ${
                                isActive ? "bg-accent" : "hover:bg-muted/50"
                              }`}
                            >
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-medium text-foreground truncate">
                                  {result.title}
                                </p>
                                <p className="text-xs text-muted-foreground truncate mt-0.5">
                                  <span className="font-medium">{result.projectName}</span>
                                  {result.snippet && result.type !== "project" && (
                                    <> · {result.snippet}</>
                                  )}
                                </p>
                              </div>
                              {isActive && (
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground flex-shrink-0">
                                  <CornerDownLeft className="w-3 h-3" />
                                  open
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    );
                  })}

                  {/* Footer hint */}
                  {results.length > 0 && (
                    <div className="border-t border-border px-4 py-2 flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground">
                        {results.length} result{results.length !== 1 ? "s" : ""}
                      </span>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <kbd className="border border-border rounded px-1 font-mono">↑↓</kbd> navigate
                        </span>
                        <span className="flex items-center gap-1">
                          <kbd className="border border-border rounded px-1 font-mono">↵</kbd> open
                        </span>
                        <span className="flex items-center gap-1">
                          <kbd className="border border-border rounded px-1 font-mono">Esc</kbd> close
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
