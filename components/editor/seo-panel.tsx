"use client";

import { useState } from "react";
import {
  Search,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Lightbulb,
  ChevronDown,
  ChevronUp,
  Loader2,
  Wand2,
  EyeOff,
  RotateCcw,
  Shield,
  FileText,
  Globe,
  Code,
  Smartphone,
  Zap,
  Database,
  Bot,
  Sparkles,
  Scan,
} from "lucide-react";
import { toast } from "@/hooks/use-toast";

interface SeoPanelProps {
  projectId?: string;
  onSendToChat?: (prompt: string) => void;
}

type Severity = "pass" | "info" | "warning" | "critical";
type Category =
  | "page_basics"
  | "indexing"
  | "metadata"
  | "open_graph"
  | "structured_data"
  | "content"
  | "ai_readiness"
  | "performance"
  | "accessibility"
  | "mobile";

interface SeoFinding {
  id: number;
  title: string;
  severity: Severity;
  category: Category;
  description: string;
  recommendation: string;
  fixable: boolean;
  autoFixPrompt?: string;
  status: "active" | "fixed" | "ignored";
}

const SEVERITY_META: Record<
  Severity,
  { color: string; bg: string; icon: React.ElementType; label: string; priority: string }
> = {
  pass: {
    color: "text-emerald-600",
    bg: "bg-emerald-50 border-emerald-200",
    icon: CheckCircle2,
    label: "Passing",
    priority: "Nothing to do",
  },
  info: {
    color: "text-blue-600",
    bg: "bg-blue-50 border-blue-200",
    icon: Lightbulb,
    label: "Suggestion",
    priority: "Nice to fix",
  },
  warning: {
    color: "text-amber-600",
    bg: "bg-amber-50 border-amber-200",
    icon: AlertTriangle,
    label: "Warning",
    priority: "Should fix",
  },
  critical: {
    color: "text-red-600",
    bg: "bg-red-50 border-red-200",
    icon: XCircle,
    label: "Critical",
    priority: "Must fix",
  },
};

const CATEGORY_META: Record<Category, { label: string; icon: React.ElementType }> = {
  page_basics: { label: "Page Basics", icon: FileText },
  indexing: { label: "Indexing", icon: Globe },
  metadata: { label: "Metadata", icon: FileText },
  open_graph: { label: "Open Graph", icon: Globe },
  structured_data: { label: "Structured Data", icon: Code },
  content: { label: "Content", icon: FileText },
  ai_readiness: { label: "AI Readiness", icon: Bot },
  performance: { label: "Performance", icon: Zap },
  accessibility: { label: "Accessibility", icon: Shield },
  mobile: { label: "Mobile", icon: Smartphone },
};

const SIMULATED_FINDINGS: Omit<SeoFinding, "id" | "status">[] = [
  {
    title: "Missing meta description",
    severity: "critical",
    category: "metadata",
    description: "No meta description tag found. This is displayed in search results and strongly influences click-through rates.",
    recommendation: "Add a unique, compelling meta description of 150–160 characters to each page.",
    fixable: true,
    autoFixPrompt: "Add a descriptive meta description tag to the HTML head for every page. Keep it under 160 characters and make it compelling for searchers.",
  },
  {
    title: "Missing page title",
    severity: "critical",
    category: "page_basics",
    description: "No <title> tag found. The page title is the single most important on-page SEO element.",
    recommendation: "Add a descriptive <title> of 50–60 characters to each page.",
    fixable: true,
    autoFixPrompt: "Add a descriptive <title> tag to the HTML head. Keep it under 60 characters and include the primary keyword.",
  },
  {
    title: "No canonical URL",
    severity: "warning",
    category: "indexing",
    description: "Missing canonical link element. Without it, search engines may index duplicate content.",
    recommendation: "Add <link rel=\"canonical\" href=\"...\"> to each page.",
    fixable: true,
    autoFixPrompt: "Add a canonical link element (<link rel=\"canonical\">) to each page's HTML head pointing to its preferred URL.",
  },
  {
    title: "Open Graph tags missing",
    severity: "warning",
    category: "open_graph",
    description: "No Open Graph meta tags found. These control how the page appears when shared on social media.",
    recommendation: "Add og:title, og:description, og:image, and og:url tags to each page.",
    fixable: true,
    autoFixPrompt: "Add Open Graph meta tags (og:title, og:description, og:image, og:url) to the HTML head of each page for better social media previews.",
  },
  {
    title: "No robots.txt",
    severity: "warning",
    category: "indexing",
    description: "No robots.txt file detected. Search engines may crawl unintended pages.",
    recommendation: "Create a robots.txt at the root of your domain to guide crawler behavior.",
    fixable: true,
    autoFixPrompt: "Create a robots.txt file in the public directory with appropriate rules to guide search engine crawlers.",
  },
  {
    title: "Missing sitemap.xml",
    severity: "warning",
    category: "indexing",
    description: "No XML sitemap found. A sitemap helps search engines discover and index all pages.",
    recommendation: "Generate and submit a sitemap.xml to Google Search Console.",
    fixable: true,
    autoFixPrompt: "Create a sitemap.xml file listing all public pages of the app and place it in the public directory.",
  },
  {
    title: "Images missing alt text",
    severity: "warning",
    category: "accessibility",
    description: "One or more images lack alt attributes. This hurts both accessibility and image search ranking.",
    recommendation: "Add descriptive alt text to all <img> elements.",
    fixable: true,
    autoFixPrompt: "Add descriptive alt attributes to all <img> elements in the codebase. Decorative images should have alt=\"\".",
  },
  {
    title: "No structured data (JSON-LD)",
    severity: "info",
    category: "structured_data",
    description: "No JSON-LD structured data found. Structured data enables rich snippets in Google results.",
    recommendation: "Add appropriate schema.org markup (WebApplication, Organization, etc.).",
    fixable: true,
    autoFixPrompt: "Add JSON-LD structured data markup (schema.org) to the HTML. Use WebApplication and Organization schemas appropriate for the site.",
  },
  {
    title: "Heading hierarchy issues",
    severity: "info",
    category: "content",
    description: "Page headings may not follow a logical H1 → H2 → H3 hierarchy.",
    recommendation: "Ensure each page has exactly one H1, and that heading levels don't skip (e.g., H1 → H3).",
    fixable: true,
    autoFixPrompt: "Review and fix heading hierarchy across all pages. Each page should have exactly one H1, and headings should be nested logically (H1 → H2 → H3).",
  },
  {
    title: "Page title present",
    severity: "pass",
    category: "page_basics",
    description: "A page title exists.",
    recommendation: "No action needed.",
    fixable: false,
  },
  {
    title: "HTTPS enabled",
    severity: "pass",
    category: "indexing",
    description: "The site is served over HTTPS.",
    recommendation: "No action needed.",
    fixable: false,
  },
  {
    title: "Viewport meta tag present",
    severity: "pass",
    category: "mobile",
    description: "The viewport meta tag is configured for mobile devices.",
    recommendation: "No action needed.",
    fixable: false,
  },
  {
    title: "Consider adding llms.txt for AI discoverability",
    severity: "info",
    category: "ai_readiness",
    description: "An llms.txt file helps AI models understand your site's purpose and content structure.",
    recommendation: "Create an llms.txt file at the root describing your site for AI crawlers.",
    fixable: true,
    autoFixPrompt: "Create a public/llms.txt file describing the site's purpose, key pages, and content for AI language models following the llms.txt standard.",
  },
];

const RESEARCH_QUESTIONS = [
  "What keywords should a site like mine target?",
  "Audit my landing page for SEO issues.",
  "Suggest SEO improvements for my page copy.",
  "How do I improve my Core Web Vitals?",
  "What backlink strategies would help my site rank?",
  "Generate an llms.txt for my project.",
];

export function SeoPanel({ onSendToChat }: SeoPanelProps) {
  const [findings, setFindings] = useState<SeoFinding[]>([]);
  const [isScanning, setIsScanning] = useState(false);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [showIgnored, setShowIgnored] = useState(false);
  const [filter, setFilter] = useState<"all" | "failing" | "passing">("all");
  const [scanSummary, setScanSummary] = useState<{
    pass: number; info: number; warning: number; critical: number;
  } | null>(null);

  const handleScan = async () => {
    setIsScanning(true);
    await new Promise((r) => setTimeout(r, 1800));

    const newFindings: SeoFinding[] = SIMULATED_FINDINGS.map((f, i) => ({
      ...f,
      id: i + 1,
      status: "active" as const,
    }));

    setFindings(newFindings);
    const summary = {
      pass: newFindings.filter((f) => f.severity === "pass").length,
      info: newFindings.filter((f) => f.severity === "info").length,
      warning: newFindings.filter((f) => f.severity === "warning").length,
      critical: newFindings.filter((f) => f.severity === "critical").length,
    };
    setScanSummary(summary);
    setIsScanning(false);
    toast({
      title: `SEO scan complete`,
      description: `${summary.critical} critical, ${summary.warning} warnings, ${summary.info} suggestions`,
    });
  };

  const markFixed = (id: number) => {
    setFindings((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status: "fixed" } : f))
    );
    toast({ title: "Marked as fixed" });
  };

  const ignore = (id: number) => {
    setFindings((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status: "ignored" } : f))
    );
    toast({ title: "Finding ignored" });
  };

  const restore = (id: number) => {
    setFindings((prev) =>
      prev.map((f) => (f.id === id ? { ...f, status: "active" } : f))
    );
    toast({ title: "Finding restored" });
  };

  const sendToChat = (prompt: string) => {
    if (onSendToChat) {
      onSendToChat(prompt);
      toast({ title: "Sent to AI chat" });
    }
  };

  const activeFindings = findings.filter(
    (f) => f.status === "active" || f.status === "fixed"
  );
  const ignoredFindings = findings.filter((f) => f.status === "ignored");

  const filteredFindings = activeFindings.filter((f) => {
    if (filter === "failing") return f.severity !== "pass";
    if (filter === "passing") return f.severity === "pass";
    return true;
  });

  const failingCount = activeFindings.filter((f) => f.severity !== "pass").length;
  const fixableCount = activeFindings.filter(
    (f) => f.fixable && f.severity !== "pass" && f.autoFixPrompt
  ).length;

  const handleFixAll = () => {
    const fixable = activeFindings.filter(
      (f) => f.fixable && f.severity !== "pass" && f.autoFixPrompt
    );
    if (fixable.length === 0) {
      toast({ title: "No fixable findings", variant: "destructive" });
      return;
    }
    const prompt =
      "Fix all the following SEO issues in my project:\n\n" +
      fixable.map((f) => `• ${f.title}: ${f.autoFixPrompt}`).join("\n");
    sendToChat(prompt);
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {/* Header */}
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-violet-500" />
          <h2 className="text-sm font-semibold">SEO Audit</h2>
        </div>

        {/* Summary cards */}
        {scanSummary && (
          <div className="grid grid-cols-4 gap-1.5">
            {(
              [
                { key: "pass" as const, color: "text-emerald-600", bg: "bg-emerald-50", icon: CheckCircle2 },
                { key: "info" as const, color: "text-blue-600", bg: "bg-blue-50", icon: Lightbulb },
                { key: "warning" as const, color: "text-amber-600", bg: "bg-amber-50", icon: AlertTriangle },
                { key: "critical" as const, color: "text-red-600", bg: "bg-red-50", icon: XCircle },
              ] as const
            ).map((s) => (
              <div key={s.key} className={`${s.bg} rounded-xl p-2 text-center`}>
                <s.icon className={`w-2.5 h-2.5 ${s.color} mx-auto mb-0.5`} />
                <div className={`text-base font-bold ${s.color}`}>
                  {scanSummary[s.key]}
                </div>
                <div className="text-[8px] text-muted-foreground capitalize">
                  {s.key === "pass" ? "passing" : s.key}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Scan / Fix All buttons */}
        <div className="flex gap-2">
          <button
            onClick={handleScan}
            disabled={isScanning}
            className="flex-1 py-2 bg-foreground text-background text-xs font-semibold rounded-xl hover:opacity-90 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
          >
            {isScanning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Scan className="w-3.5 h-3.5" />
            )}
            {isScanning ? "Scanning…" : findings.length > 0 ? "Scan Again" : "Scan Project"}
          </button>
          {fixableCount > 0 && (
            <button
              onClick={handleFixAll}
              className="px-3 py-2 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-xs font-semibold rounded-xl hover:opacity-90 transition flex items-center gap-1.5"
            >
              <Wand2 className="w-3 h-3" />
              Fix All ({fixableCount})
            </button>
          )}
        </div>

        {/* Research SEO chips */}
        <div className="p-2.5 bg-violet-50 dark:bg-violet-950/20 border border-violet-100 dark:border-violet-800 rounded-xl">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="w-3 h-3 text-violet-500" />
            <span className="text-[9px] font-semibold text-violet-700 dark:text-violet-400 uppercase tracking-wider">
              Ask AI about SEO
            </span>
          </div>
          <div className="flex flex-wrap gap-1">
            {RESEARCH_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => sendToChat(q)}
                className="px-2 py-0.5 bg-white dark:bg-violet-900/40 border border-violet-200 dark:border-violet-700 text-[9px] text-violet-600 dark:text-violet-400 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/60 transition"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Filter tabs */}
        {findings.length > 0 && (
          <div className="flex gap-0.5 p-0.5 bg-muted rounded-lg">
            {(
              [
                { key: "all" as const, label: `All (${activeFindings.length})` },
                { key: "failing" as const, label: `Failing (${failingCount})` },
                {
                  key: "passing" as const,
                  label: `Passing (${activeFindings.filter((f) => f.severity === "pass").length})`,
                },
              ] as const
            ).map((t) => (
              <button
                key={t.key}
                onClick={() => setFilter(t.key)}
                className={`flex-1 py-1 text-[10px] font-medium rounded-md transition ${
                  filter === t.key
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        )}

        {/* Findings list */}
        {isScanning ? (
          <div className="flex flex-col items-center justify-center py-12 gap-3">
            <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            <p className="text-xs text-muted-foreground">Analyzing project…</p>
          </div>
        ) : filteredFindings.length === 0 && findings.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 gap-2 text-center">
            <Search className="w-8 h-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No findings yet</p>
            <p className="text-[11px] text-muted-foreground/60">
              Run a scan to analyze your project for SEO issues
            </p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {filteredFindings.map((finding) => {
              const meta = SEVERITY_META[finding.severity];
              const catMeta = CATEGORY_META[finding.category];
              const SevIcon = meta.icon;
              const CatIcon = catMeta.icon;
              const isExpanded = expandedId === finding.id;

              return (
                <div
                  key={finding.id}
                  className={`border rounded-xl overflow-hidden ${meta.bg}`}
                >
                  <button
                    onClick={() =>
                      setExpandedId(isExpanded ? null : finding.id)
                    }
                    className="flex items-start gap-2 w-full p-2.5 text-left hover:bg-white/30 transition"
                  >
                    <SevIcon className={`w-3.5 h-3.5 mt-0.5 flex-shrink-0 ${meta.color}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-semibold text-foreground">
                          {finding.title}
                        </span>
                        {finding.status === "fixed" && (
                          <span className="text-[7px] px-1 py-0.5 bg-emerald-200 text-emerald-700 rounded-full">
                            Fixed
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1 mt-0.5">
                        <CatIcon className="w-2 h-2 text-muted-foreground" />
                        <span className="text-[9px] text-muted-foreground">
                          {catMeta.label}
                        </span>
                        {finding.fixable && finding.severity !== "pass" && (
                          <span className="text-[7px] px-1 py-0.5 bg-white/60 text-muted-foreground rounded-full">
                            Fixable
                          </span>
                        )}
                      </div>
                    </div>
                    {isExpanded ? (
                      <ChevronUp className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    ) : (
                      <ChevronDown className="w-3 h-3 text-muted-foreground flex-shrink-0" />
                    )}
                  </button>

                  {isExpanded && (
                    <div className="px-2.5 pb-2.5 border-t border-current/10 pt-2 space-y-2">
                      <p className="text-[10px] text-muted-foreground">
                        {finding.description}
                      </p>
                      <div className="p-2 bg-white/50 rounded-lg">
                        <span className="text-[8px] font-semibold text-muted-foreground uppercase tracking-wider">
                          Recommendation
                        </span>
                        <p className="text-[10px] text-foreground mt-0.5">
                          {finding.recommendation}
                        </p>
                      </div>
                      <div className="flex gap-1.5">
                        {finding.fixable &&
                          finding.severity !== "pass" &&
                          finding.autoFixPrompt && (
                            <button
                              onClick={() =>
                                sendToChat(finding.autoFixPrompt!)
                              }
                              className="flex-1 py-1.5 bg-gradient-to-r from-violet-500 to-purple-600 text-white text-[10px] font-medium rounded-lg hover:opacity-90 transition flex items-center justify-center gap-1"
                            >
                              <Wand2 className="w-2.5 h-2.5" />
                              Fix with AI
                            </button>
                          )}
                        {finding.status !== "fixed" && finding.severity !== "pass" && (
                          <button
                            onClick={() => markFixed(finding.id)}
                            className="px-2.5 py-1.5 border border-current/20 text-muted-foreground text-[10px] rounded-lg hover:bg-white/50 transition flex items-center gap-1"
                          >
                            <CheckCircle2 className="w-2.5 h-2.5" />
                            Mark Fixed
                          </button>
                        )}
                        <button
                          onClick={() => ignore(finding.id)}
                          className="px-2.5 py-1.5 border border-current/20 text-muted-foreground text-[10px] rounded-lg hover:bg-white/50 transition flex items-center gap-1"
                        >
                          <EyeOff className="w-2.5 h-2.5" />
                          Ignore
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Ignored section */}
        {ignoredFindings.length > 0 && (
          <div>
            <button
              onClick={() => setShowIgnored(!showIgnored)}
              className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition"
            >
              {showIgnored ? (
                <ChevronUp className="w-2.5 h-2.5" />
              ) : (
                <ChevronDown className="w-2.5 h-2.5" />
              )}
              Ignored ({ignoredFindings.length})
            </button>
            {showIgnored && (
              <div className="mt-1.5 space-y-1">
                {ignoredFindings.map((f) => (
                  <div
                    key={f.id}
                    className="flex items-center justify-between p-2 bg-muted/50 rounded-lg border border-border"
                  >
                    <span className="text-[10px] text-muted-foreground line-through">
                      {f.title}
                    </span>
                    <button
                      onClick={() => restore(f.id)}
                      className="text-[9px] text-blue-500 hover:text-blue-600 flex items-center gap-0.5"
                    >
                      <RotateCcw className="w-2 h-2" />
                      Restore
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Legend */}
        {findings.length > 0 && (
          <div className="p-2.5 bg-muted/40 rounded-xl border border-border">
            <span className="text-[9px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1.5">
              Severity Guide
            </span>
            <div className="grid grid-cols-2 gap-1">
              {Object.entries(SEVERITY_META).map(([key, meta]) => {
                const Icon = meta.icon;
                return (
                  <div key={key} className="flex items-center gap-1.5">
                    <Icon className={`w-2.5 h-2.5 ${meta.color}`} />
                    <span className="text-[9px] text-muted-foreground">
                      {meta.label} — {meta.priority}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
