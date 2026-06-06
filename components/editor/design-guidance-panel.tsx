"use client";

import { useState, useRef, useCallback } from "react";
import {
  Wand2, Sparkles, Loader2, Upload, X, ChevronDown,
  ChevronRight, CheckCircle2, AlertTriangle, XCircle,
  LayoutDashboard, Type, Palette, Accessibility,
  MousePointer, Zap, RefreshCw, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { ProjectFile } from "@/types/database";

interface DesignGuidancePanelProps {
  projectId: string;
  files: ProjectFile[];
  onApplyFix: (prompt: string) => void;
}

type Severity = "good" | "warning" | "error";
type Category = "Layout" | "Typography" | "Color" | "Accessibility" | "UX" | "Performance";

interface Suggestion {
  id: string;
  category: Category;
  severity: Severity;
  title: string;
  detail: string;
  fixPrompt: string;
}

interface GuidanceResult {
  score: number;
  summary: string;
  suggestions: Suggestion[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────

const CATEGORY_ICON: Record<Category, React.ReactNode> = {
  Layout:        <LayoutDashboard className="w-3.5 h-3.5" />,
  Typography:    <Type            className="w-3.5 h-3.5" />,
  Color:         <Palette         className="w-3.5 h-3.5" />,
  Accessibility: <Accessibility   className="w-3.5 h-3.5" />,
  UX:            <MousePointer    className="w-3.5 h-3.5" />,
  Performance:   <Zap             className="w-3.5 h-3.5" />,
};

const SEVERITY_CONFIG: Record<Severity, { icon: React.ReactNode; color: string; bg: string; border: string }> = {
  good:    {
    icon:   <CheckCircle2   className="w-3.5 h-3.5" />,
    color:  "text-emerald-500",
    bg:     "bg-emerald-500/8",
    border: "border-emerald-500/20",
  },
  warning: {
    icon:   <AlertTriangle  className="w-3.5 h-3.5" />,
    color:  "text-amber-400",
    bg:     "bg-amber-400/8",
    border: "border-amber-400/20",
  },
  error:   {
    icon:   <XCircle        className="w-3.5 h-3.5" />,
    color:  "text-red-500",
    bg:     "bg-red-500/8",
    border: "border-red-500/20",
  },
};

function scoreColor(score: number): string {
  if (score >= 90) return "text-emerald-400";
  if (score >= 70) return "text-blue-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function scoreLabel(score: number): string {
  if (score >= 90) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 50) return "Needs work";
  return "Poor";
}

/** Build a compact representative sample of project files for analysis */
function buildFilesSample(files: ProjectFile[]): string {
  const priority = [
    (f: ProjectFile) => f.path.endsWith("page.tsx") || f.path.endsWith("App.tsx"),
    (f: ProjectFile) => f.path.endsWith(".tsx") || f.path.endsWith(".jsx"),
    (f: ProjectFile) => f.path.endsWith(".css") || f.path.endsWith(".scss"),
    (f: ProjectFile) => f.path.includes("tailwind.config"),
  ];

  const picked = new Set<string>();
  const result: string[] = [];
  let totalChars = 0;
  const MAX = 10000;

  for (const pred of priority) {
    for (const f of files) {
      if (picked.has(f.path) || !f.content) continue;
      if (!pred(f)) continue;
      const snippet = f.content.slice(0, 2500);
      if (totalChars + snippet.length > MAX) continue;
      result.push(`// === ${f.path} ===\n${snippet}${f.content.length > 2500 ? "\n// …" : ""}`);
      picked.add(f.path);
      totalChars += snippet.length;
    }
    if (totalChars >= MAX) break;
  }

  return result.join("\n\n") || "// No source files found";
}

// ── Score ring SVG ────────────────────────────────────────────────────────────
function ScoreRing({ score }: { score: number }) {
  const r = 30;
  const circ = 2 * Math.PI * r;
  const offset = circ - (score / 100) * circ;
  return (
    <svg width="80" height="80" viewBox="0 0 80 80" className="rotate-[-90deg]">
      <circle cx="40" cy="40" r={r} fill="none" stroke="currentColor" strokeWidth="6" className="text-border" />
      <circle
        cx="40" cy="40" r={r}
        fill="none"
        stroke="currentColor"
        strokeWidth="6"
        strokeDasharray={circ}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className={scoreColor(score)}
        style={{ transition: "stroke-dashoffset 0.8s ease" }}
      />
    </svg>
  );
}

// ── Suggestion card ───────────────────────────────────────────────────────────
function SuggestionCard({
  suggestion,
  onApply,
}: {
  suggestion: Suggestion;
  onApply: (prompt: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const cfg = SEVERITY_CONFIG[suggestion.severity];

  return (
    <div className={`rounded-lg border ${cfg.border} ${cfg.bg} overflow-hidden`}>
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-2.5 p-3 text-left"
      >
        <span className={`${cfg.color} mt-0.5 shrink-0`}>{cfg.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-xs font-semibold text-foreground leading-snug">{suggestion.title}</span>
            <span className={`flex items-center gap-1 text-[10px] ${cfg.color} opacity-70`}>
              {CATEGORY_ICON[suggestion.category as Category]}
              {suggestion.category}
            </span>
          </div>
        </div>
        {expanded
          ? <ChevronDown  className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
          : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0 mt-0.5" />
        }
      </button>

      {expanded && (
        <div className="px-3 pb-3 space-y-2.5 border-t border-border/40">
          <p className="text-xs text-muted-foreground leading-relaxed pt-2.5">{suggestion.detail}</p>
          {suggestion.severity !== "good" && suggestion.fixPrompt && (
            <button
              onClick={() => onApply(suggestion.fixPrompt)}
              className="flex items-center gap-1.5 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
            >
              <ArrowRight className="w-3 h-3" />Apply fix with AI
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────
export function DesignGuidancePanel({ projectId, files, onApplyFix }: DesignGuidancePanelProps) {
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [screenshot, setScreenshot] = useState<string | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [result, setResult] = useState<GuidanceResult | null>(null);
  const [filter, setFilter] = useState<Severity | "all">("all");
  const [categoryFilter, setCategoryFilter] = useState<Category | "all">("all");

  const handleScreenshotUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast({ title: "Image too large", description: "Max 5 MB", variant: "destructive" });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => setScreenshot(reader.result as string);
    reader.readAsDataURL(file);
  }, [toast]);

  const analyse = useCallback(async () => {
    if (files.length === 0) {
      toast({ title: "No files to analyse", variant: "destructive" });
      return;
    }
    setAnalysing(true);
    setResult(null);

    const filesSample = buildFilesSample(files);

    try {
      const res = await fetch("/api/ai/design-guidance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId,
          filesSample,
          screenshotBase64: screenshot ?? undefined,
        }),
      });

      if (!res.ok) {
        const { error } = await res.json().catch(() => ({ error: "Unknown error" }));
        toast({ title: "Analysis failed", description: error, variant: "destructive" });
        return;
      }

      const data: GuidanceResult = await res.json();
      setResult(data);
    } finally {
      setAnalysing(false);
    }
  }, [files, projectId, screenshot, toast]);

  const handleApplyFix = useCallback((prompt: string) => {
    onApplyFix(prompt);
    toast({ title: "Fix prompt sent to Chat", description: "Switch to Chat to apply it" });
  }, [onApplyFix, toast]);

  // Filtered suggestions
  const filtered = (result?.suggestions ?? []).filter((s) => {
    if (filter !== "all" && s.severity !== filter) return false;
    if (categoryFilter !== "all" && s.category !== categoryFilter) return false;
    return true;
  });

  const counts = {
    good:    result?.suggestions.filter((s) => s.severity === "good").length    ?? 0,
    warning: result?.suggestions.filter((s) => s.severity === "warning").length ?? 0,
    error:   result?.suggestions.filter((s) => s.severity === "error").length   ?? 0,
  };

  const categories = Array.from(new Set(result?.suggestions.map((s) => s.category) ?? [])) as Category[];

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <Wand2 className="w-4 h-4 text-primary" />
        <span className="text-sm font-semibold">Design Guidance</span>
        {result && (
          <span className={`ml-auto text-xs font-bold ${scoreColor(result.score)}`}>
            {result.score}/100
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto">
        {/* Pre-analysis state */}
        {!result && !analysing && (
          <div className="p-4 space-y-4">
            <p className="text-xs text-muted-foreground">
              AI will analyse your project's code and give structured design feedback across Layout, Typography, Color, Accessibility, UX, and Performance.
            </p>

            {/* Screenshot upload */}
            <div className="space-y-2">
              <p className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
                Screenshot (optional)
              </p>
              {screenshot ? (
                <div className="relative rounded-lg overflow-hidden border border-border">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={screenshot} alt="Preview screenshot" className="w-full object-cover max-h-40" />
                  <button
                    onClick={() => setScreenshot(null)}
                    className="absolute top-2 right-2 w-6 h-6 bg-background/80 rounded-full flex items-center justify-center hover:bg-background transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full border-2 border-dashed border-border hover:border-primary/40 rounded-lg p-6 flex flex-col items-center gap-2 text-center transition-colors group"
                >
                  <Upload className="w-6 h-6 text-muted-foreground group-hover:text-primary transition-colors" />
                  <p className="text-xs text-muted-foreground">
                    Upload a screenshot for visual analysis
                  </p>
                  <p className="text-[10px] text-muted-foreground/60">PNG, JPG, WebP — max 5 MB</p>
                </button>
              )}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleScreenshotUpload}
              />
            </div>

            {/* What gets analysed */}
            <div className="rounded-lg bg-muted/20 border border-border p-3 space-y-1.5">
              <p className="text-[11px] font-medium text-foreground">What gets analysed</p>
              {[
                ["Layout",        "Spacing, alignment, grid, visual hierarchy"],
                ["Typography",    "Font pairing, sizing, line-height, contrast"],
                ["Color",         "Palette, contrast ratios, dark mode support"],
                ["Accessibility", "ARIA labels, focus order, keyboard nav"],
                ["UX",            "Loading states, error handling, empty states"],
                ["Performance",   "Bundle hints, lazy loading, image optimisation"],
              ].map(([cat, desc]) => (
                <div key={cat} className="flex items-start gap-2">
                  <span className="text-primary mt-0.5 shrink-0">
                    {CATEGORY_ICON[cat as Category]}
                  </span>
                  <div>
                    <span className="text-[11px] font-medium text-foreground">{cat}</span>
                    <span className="text-[10px] text-muted-foreground"> — {desc}</span>
                  </div>
                </div>
              ))}
            </div>

            <Button onClick={analyse} className="w-full h-8 text-xs gap-2">
              <Sparkles className="w-3.5 h-3.5" />
              Analyse design{screenshot ? " (with screenshot)" : ""}
            </Button>
          </div>
        )}

        {/* Loading */}
        {analysing && (
          <div className="flex flex-col items-center justify-center h-56 gap-4">
            <div className="relative">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium">Analysing design…</p>
              <p className="text-xs text-muted-foreground mt-1">
                Reviewing code, layout, and {screenshot ? "screenshot" : "patterns"}
              </p>
            </div>
          </div>
        )}

        {/* Results */}
        {result && !analysing && (
          <div className="p-4 space-y-4">
            {/* Score + summary */}
            <div className="flex items-center gap-4 rounded-xl border border-border p-4">
              <div className="relative shrink-0">
                <ScoreRing score={result.score} />
                <div className="absolute inset-0 flex flex-col items-center justify-center">
                  <span className={`text-lg font-bold ${scoreColor(result.score)}`}>{result.score}</span>
                </div>
              </div>
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-bold ${scoreColor(result.score)}`}>{scoreLabel(result.score)}</p>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{result.summary}</p>
              </div>
            </div>

            {/* Severity summary pills */}
            <div className="flex gap-2">
              {(["all", "good", "warning", "error"] as const).map((s) => {
                const count = s === "all" ? result.suggestions.length : counts[s];
                const cfg = s === "all"
                  ? { color: "text-muted-foreground", border: "border-border" }
                  : SEVERITY_CONFIG[s];
                return (
                  <button
                    key={s}
                    onClick={() => setFilter(s)}
                    className={`flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-medium transition-colors ${
                      filter === s
                        ? `${cfg.color} ${"bg" in cfg ? cfg.bg : "bg-muted"} ${"border" in cfg ? cfg.border : "border-border"}`
                        : "text-muted-foreground border-border hover:border-border/60"
                    }`}
                  >
                    {s === "all" ? "All" : s.charAt(0).toUpperCase() + s.slice(1)}
                    <span className="opacity-70">{count}</span>
                  </button>
                );
              })}
            </div>

            {/* Category filter */}
            {categories.length > 1 && (
              <div className="flex gap-1.5 flex-wrap">
                {(["all", ...categories] as const).map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setCategoryFilter(cat as Category | "all")}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] transition-colors ${
                      categoryFilter === cat
                        ? "bg-primary/10 text-primary border border-primary/30"
                        : "text-muted-foreground hover:text-foreground border border-transparent"
                    }`}
                  >
                    {cat !== "all" && CATEGORY_ICON[cat as Category]}
                    {cat === "all" ? "All categories" : cat}
                  </button>
                ))}
              </div>
            )}

            {/* Suggestions list */}
            <div className="space-y-2">
              {filtered.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No suggestions match the current filter</p>
              ) : (
                filtered.map((s) => (
                  <SuggestionCard key={s.id} suggestion={s} onApply={handleApplyFix} />
                ))
              )}
            </div>

            {/* Re-analyse */}
            <Button
              variant="outline"
              size="sm"
              onClick={analyse}
              className="w-full h-7 text-xs gap-1.5"
            >
              <RefreshCw className="w-3 h-3" />Re-analyse
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
