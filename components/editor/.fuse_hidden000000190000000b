"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldAlert, Zap, Star, Code2, AlertCircle, AlertTriangle, Info,
  Loader2, RefreshCw, CheckCircle2, FileCode2, Wrench,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ProjectFile } from "@/types/database";
import type { ReviewIssue, ReviewResult } from "@/app/api/ai/review/route";

interface CodeReviewPanelProps {
  activeFile: ProjectFile | null;
  onJumpToLine: (line: number) => void;
  onFixWithAI: (issue: ReviewIssue) => void;
}

type Category = ReviewIssue["category"];
type Severity = ReviewIssue["severity"];

const CATEGORY_META: Record<Category, { label: string; icon: React.ReactNode; color: string }> = {
  quality:     { label: "Quality",        icon: <Code2 className="w-3.5 h-3.5" />,      color: "text-blue-400" },
  security:    { label: "Security",       icon: <ShieldAlert className="w-3.5 h-3.5" />, color: "text-red-400" },
  performance: { label: "Performance",    icon: <Zap className="w-3.5 h-3.5" />,         color: "text-yellow-400" },
  bestpractice:{ label: "Best Practices", icon: <Star className="w-3.5 h-3.5" />,        color: "text-purple-400" },
};

const SEVERITY_META: Record<Severity, { icon: React.ReactNode; color: string; badge: string }> = {
  error:   { icon: <AlertCircle className="w-3 h-3" />,   color: "text-red-400",    badge: "bg-red-400/15 text-red-300 border-red-400/30" },
  warning: { icon: <AlertTriangle className="w-3 h-3" />, color: "text-yellow-400", badge: "bg-yellow-400/15 text-yellow-300 border-yellow-400/30" },
  info:    { icon: <Info className="w-3 h-3" />,          color: "text-blue-400",   badge: "bg-blue-400/15 text-blue-300 border-blue-400/30" },
};

const CATEGORY_ORDER: Category[] = ["security", "quality", "performance", "bestpractice"];

export function CodeReviewPanel({ activeFile, onJumpToLine, onFixWithAI }: CodeReviewPanelProps) {
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [reviewedPath, setReviewedPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState<Set<Category>>(new Set());

  const stale = reviewedPath !== null && activeFile?.path !== reviewedPath;

  async function runReview() {
    if (!activeFile?.content) return;
    setLoading(true);
    setError(null);

    try {
      const res = await fetch("/api/ai/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: activeFile.content,
          filename: activeFile.path,
          language: activeFile.language,
        }),
      });
      if (!res.ok) throw new Error("Review request failed");
      const data: ReviewResult = await res.json();
      setResult(data);
      setReviewedPath(activeFile.path);
    } catch {
      setError("Review failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function toggleCategory(cat: Category) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(cat) ? next.delete(cat) : next.add(cat);
      return next;
    });
  }

  const grouped = result
    ? CATEGORY_ORDER.reduce<Record<Category, ReviewIssue[]>>((acc, cat) => {
        acc[cat] = result.issues.filter((i) => i.category === cat);
        return acc;
      }, { quality: [], security: [], performance: [], bestpractice: [] })
    : null;

  const errorCount = result?.issues.filter((i) => i.severity === "error").length ?? 0;
  const warningCount = result?.issues.filter((i) => i.severity === "warning").length ?? 0;

  return (
    <div className="flex flex-col h-full text-sm bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <ShieldAlert className="w-4 h-4" />
        <span className="text-sm font-semibold">Code Review</span>
        {result && !stale && (
          <div className="ml-auto flex items-center gap-1.5">
            {errorCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border bg-red-400/15 text-red-300 border-red-400/30">
                {errorCount} error{errorCount !== 1 ? "s" : ""}
              </span>
            )}
            {warningCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded border bg-yellow-400/15 text-yellow-300 border-yellow-400/30">
                {warningCount} warn{warningCount !== 1 ? "ings" : "ing"}
              </span>
            )}
            {errorCount === 0 && warningCount === 0 && (
              <span className="text-[10px] text-green-400 flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Clean
              </span>
            )}
          </div>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* No file open */}
        {!activeFile && (
          <div className="flex flex-col items-center justify-center h-full gap-2 text-muted-foreground">
            <FileCode2 className="w-8 h-8 opacity-20" />
            <p className="text-xs">Open a file to review</p>
          </div>
        )}

        {/* File info + run button */}
        {activeFile && (
          <div className="p-4 space-y-3">
            <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2 border border-border/50">
              <FileCode2 className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate flex-1">{activeFile.path}</span>
              {stale && (
                <span className="text-yellow-400/80 shrink-0 text-[10px]">changed</span>
              )}
            </div>

            <Button
              onClick={runReview}
              disabled={loading}
              className="w-full gap-2"
              size="sm"
            >
              {loading
                ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Reviewing…</>
                : result
                  ? <><RefreshCw className="w-3.5 h-3.5" /> {stale ? "Review updated file" : "Re-review"}</>
                  : <><ShieldAlert className="w-3.5 h-3.5" /> Review this file</>
              }
            </Button>

            {error && (
              <p className="text-xs text-red-400 text-center">{error}</p>
            )}
          </div>
        )}

        {/* Results */}
        {result && !loading && (
          <div className="pb-4">
            {/* Summary */}
            <div className="mx-4 mb-3 px-3 py-2 rounded-md bg-muted/20 border border-border/50 text-xs text-muted-foreground leading-relaxed">
              {result.summary}
            </div>

            {result.issues.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-6 text-green-400">
                <CheckCircle2 className="w-8 h-8" />
                <p className="text-xs">No issues found — great code!</p>
              </div>
            ) : (
              <div className="space-y-1">
                {CATEGORY_ORDER.map((cat) => {
                  const issues = grouped![cat];
                  if (issues.length === 0) return null;
                  const meta = CATEGORY_META[cat];
                  const isOpen = !collapsed.has(cat);

                  return (
                    <div key={cat}>
                      {/* Category header */}
                      <button
                        onClick={() => toggleCategory(cat)}
                        className="w-full flex items-center gap-2 px-4 py-1.5 hover:bg-muted/30 transition-colors"
                      >
                        <span className={meta.color}>{meta.icon}</span>
                        <span className="text-xs font-semibold text-foreground flex-1 text-left">
                          {meta.label}
                        </span>
                        <span className="text-[10px] text-muted-foreground">{issues.length}</span>
                        <motion.span
                          animate={{ rotate: isOpen ? 0 : -90 }}
                          transition={{ duration: 0.15 }}
                          className="text-muted-foreground"
                        >
                          ▾
                        </motion.span>
                      </button>

                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.15 }}
                            className="overflow-hidden"
                          >
                            {issues.map((issue, idx) => {
                              const sev = SEVERITY_META[issue.severity];
                              return (
                                <div
                                  key={idx}
                                  className="flex items-start gap-2 px-4 py-2 hover:bg-muted/20 transition-colors border-l-2 border-transparent hover:border-l-muted-foreground/20 ml-4 group/issue"
                                >
                                  <span className={`mt-px shrink-0 ${sev.color}`}>{sev.icon}</span>
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                      <span className="text-xs font-medium text-foreground">{issue.title}</span>
                                      <span className={`text-[10px] px-1 py-px rounded border shrink-0 ${sev.badge}`}>
                                        {issue.severity}
                                      </span>
                                      {issue.line && (
                                        <button
                                          onClick={() => onJumpToLine(issue.line!)}
                                          className="text-[10px] text-primary hover:underline shrink-0 font-mono"
                                          title="Jump to line"
                                        >
                                          :{issue.line}
                                        </button>
                                      )}
                                    </div>
                                    <p className="text-[11px] text-muted-foreground/80 mt-0.5 leading-relaxed">
                                      {issue.description}
                                    </p>
                                  </div>
                                  {/* Fix with AI button — appears on hover */}
                                  <button
                                    onClick={() => onFixWithAI(issue)}
                                    title="Fix with AI"
                                    className="opacity-0 group-hover/issue:opacity-100 transition-opacity shrink-0 mt-0.5 flex items-center gap-1 text-[10px] text-emerald-400 hover:text-emerald-300 border border-emerald-400/30 hover:border-emerald-300/50 rounded px-1.5 py-0.5 bg-emerald-400/5"
                                  >
                                    <Wrench className="w-2.5 h-2.5" />
                                    Fix
                                  </button>
                                </div>
                              );
                            })}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
