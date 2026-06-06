"use client";

/**
 * PerformancePanel
 * Heuristic Lighthouse-style scoring across four categories:
 *   Performance · Accessibility · SEO · Best Practices
 * Runs entirely client-side on project_files content — no network call needed.
 * "Fix with AI" fires a chat prompt for each issue.
 */

import { useState, useMemo } from "react";
import {
  Gauge, Zap, Eye, Search, ShieldCheck, RefreshCw,
  ChevronDown, ChevronRight, AlertTriangle, CheckCircle2,
  Info, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ProjectFile } from "@/types/database";

// ─── Types ─────────────────────────────────────────────────────────────────

type Category = "performance" | "accessibility" | "seo" | "bestpractices";
type Severity = "error" | "warning" | "info" | "pass";

interface PerfIssue {
  id: string;
  category: Category;
  severity: Severity;
  title: string;
  description: string;
  fixPrompt: string;
  impact: number; // 0-10, how much it affects the score
}

interface CategoryResult {
  score: number;
  issues: PerfIssue[];
}

// ─── Scoring Colours ────────────────────────────────────────────────────────

function scoreColor(score: number) {
  if (score >= 90) return "text-emerald-400";
  if (score >= 50) return "text-amber-400";
  return "text-red-400";
}

function scoreBg(score: number) {
  if (score >= 90) return "bg-emerald-500";
  if (score >= 50) return "bg-amber-500";
  return "bg-red-500";
}

function scoreLabel(score: number) {
  if (score >= 90) return "Good";
  if (score >= 50) return "Needs improvement";
  return "Poor";
}

const CATEGORY_META: Record<Category, { label: string; icon: React.ElementType; color: string }> = {
  performance:   { label: "Performance",     icon: Zap,        color: "text-amber-400" },
  accessibility: { label: "Accessibility",   icon: Eye,        color: "text-violet-400" },
  seo:           { label: "SEO",             icon: Search,     color: "text-sky-400" },
  bestpractices: { label: "Best Practices",  icon: ShieldCheck, color: "text-emerald-400" },
};

const SEVERITY_CONFIG: Record<Severity, { icon: React.ElementType; color: string; label: string }> = {
  error:   { icon: AlertTriangle,  color: "text-red-400",     label: "Error" },
  warning: { icon: AlertTriangle,  color: "text-amber-400",   label: "Warning" },
  info:    { icon: Info,           color: "text-sky-400",     label: "Info" },
  pass:    { icon: CheckCircle2,   color: "text-emerald-400", label: "Pass" },
};

// ─── Heuristic Rules ────────────────────────────────────────────────────────

function runChecks(files: ProjectFile[]): Record<Category, CategoryResult> {
  const allContent = files.map((f) => f.content ?? "").join("\n");
  const tsxFiles = files.filter((f) => /\.(tsx|jsx)$/.test(f.path));
  const tsxContent = tsxFiles.map((f) => f.content ?? "").join("\n");

  const issues: PerfIssue[] = [];

  // ── Performance ──────────────────────────────────────────────────────────

  // Large inline SVGs
  const svgCount = (allContent.match(/<svg[\s\S]{500,}?<\/svg>/g) ?? []).length;
  if (svgCount > 2) {
    issues.push({
      id: "large-inline-svg",
      category: "performance",
      severity: "warning",
      title: "Large inline SVGs detected",
      description: `Found ${svgCount} large inline SVG blocks. Extract them to separate .svg files and use next/image or <img> to benefit from browser caching.`,
      fixPrompt: "Extract large inline SVGs into separate .svg files and import them as React components or use <Image> from next/image for optimal loading.",
      impact: 7,
    });
  }

  // console.log left in production code
  const consoleLogs = (allContent.match(/console\.(log|warn|error|debug)\s*\(/g) ?? []).length;
  if (consoleLogs > 5) {
    issues.push({
      id: "console-logs",
      category: "performance",
      severity: "warning",
      title: `${consoleLogs} console statements left in code`,
      description: "console.log calls add overhead and expose internals in production. Remove or replace with a proper logger.",
      fixPrompt: "Remove all console.log, console.warn, and console.debug statements from the codebase, or replace them with a conditional logger that's disabled in production.",
      impact: 4,
    });
  }

  // No dynamic imports for heavy components
  const hasHeavyComponents = /monaco|chart|three\.js|@tiptap|react-pdf/i.test(allContent);
  const hasDynamicImport = /dynamic\s*\(\s*\(\)/i.test(allContent) || /import\s*\(/i.test(allContent);
  if (hasHeavyComponents && !hasDynamicImport) {
    issues.push({
      id: "no-dynamic-import",
      category: "performance",
      severity: "error",
      title: "Heavy libraries not lazy-loaded",
      description: "Heavy libraries (Monaco, charts, etc.) are imported statically. Use next/dynamic or dynamic import() to reduce initial bundle size.",
      fixPrompt: "Convert heavy library imports (Monaco, chart libraries, etc.) to use dynamic imports: `const MonacoEditor = dynamic(() => import('@monaco-editor/react'), { ssr: false })`",
      impact: 9,
    });
  }

  // No image optimisation
  const hasImgTags = /<img\s/i.test(allContent);
  const hasNextImage = /next\/image/.test(allContent) || /from ['"]next\/image['"]/i.test(allContent);
  if (hasImgTags && !hasNextImage) {
    issues.push({
      id: "no-next-image",
      category: "performance",
      severity: "warning",
      title: "Using <img> instead of next/image",
      description: "HTML <img> tags miss automatic optimisation (WebP conversion, lazy loading, responsive sizing). Use next/image instead.",
      fixPrompt: "Replace <img> tags with the <Image> component from next/image. This provides automatic WebP conversion, responsive sizing, and lazy loading.",
      impact: 6,
    });
  }

  // Unoptimised animations
  const hasFramerWithoutWillChange = /framer-motion/.test(allContent) && !/will-change/.test(allContent);
  if (hasFramerWithoutWillChange) {
    issues.push({
      id: "framer-no-will-change",
      category: "performance",
      severity: "info",
      title: "Framer Motion animations without GPU hints",
      description: "Animating layout properties (width, height, left, top) causes reflows. Prefer animating transform and opacity for smooth 60fps animations.",
      fixPrompt: "Review Framer Motion animations and ensure they animate transform (x, y, scale) and opacity rather than layout properties like width/height/top/left for better GPU compositing.",
      impact: 3,
    });
  }

  // ── Accessibility ────────────────────────────────────────────────────────

  const imgWithoutAlt = (tsxContent.match(/<img(?![^>]*\balt\s*=)[^>]*>/gi) ?? []).length;
  if (imgWithoutAlt > 0) {
    issues.push({
      id: "img-no-alt",
      category: "accessibility",
      severity: "error",
      title: `${imgWithoutAlt} image${imgWithoutAlt > 1 ? "s" : ""} missing alt text`,
      description: "Images without alt attributes are inaccessible to screen readers. Add descriptive alt text or alt=\"\" for decorative images.",
      fixPrompt: "Add meaningful alt text to all <img> and <Image> elements. Use alt=\"\" for purely decorative images.",
      impact: 10,
    });
  }

  const buttonWithoutLabel = (tsxContent.match(/<button(?![^>]*(?:aria-label|aria-labelledby|title))[^>]*>\s*<[^>]+\/>\s*<\/button>/gi) ?? []).length;
  if (buttonWithoutLabel > 0) {
    issues.push({
      id: "button-no-label",
      category: "accessibility",
      severity: "error",
      title: `${buttonWithoutLabel} icon button${buttonWithoutLabel > 1 ? "s" : ""} without accessible label`,
      description: "Buttons that contain only an icon must have an aria-label so screen readers can identify them.",
      fixPrompt: "Add aria-label attributes to icon-only buttons. For example: <button aria-label=\"Close dialog\"><X /></button>",
      impact: 8,
    });
  }

  const inputWithoutLabel = (tsxContent.match(/<input(?![^>]*(?:aria-label|id))[^>]*>/gi) ?? []).length;
  if (inputWithoutLabel > 0) {
    issues.push({
      id: "input-no-label",
      category: "accessibility",
      severity: "warning",
      title: `${inputWithoutLabel} input${inputWithoutLabel > 1 ? "s" : ""} potentially missing labels`,
      description: "Input elements should have associated <label> elements or aria-label attributes.",
      fixPrompt: "Ensure every <input> has an associated <label htmlFor> or aria-label attribute for accessibility.",
      impact: 7,
    });
  }

  const hasPositiveTabIndex = /tabIndex\s*=\s*\{?\s*[1-9]/i.test(tsxContent);
  if (hasPositiveTabIndex) {
    issues.push({
      id: "positive-tabindex",
      category: "accessibility",
      severity: "warning",
      title: "Positive tabIndex values detected",
      description: "tabIndex > 0 disrupts the natural tab order and confuses keyboard users. Use tabIndex={0} or tabIndex={-1} only.",
      fixPrompt: "Replace positive tabIndex values (e.g. tabIndex={1}) with tabIndex={0} to follow the natural DOM order, or tabIndex={-1} to remove from tab order entirely.",
      impact: 5,
    });
  }

  // ── SEO ──────────────────────────────────────────────────────────────────

  const hasLayoutMetadata = /generateMetadata|metadata\s*=\s*\{|<head>/i.test(allContent);
  if (!hasLayoutMetadata) {
    issues.push({
      id: "no-metadata",
      category: "seo",
      severity: "error",
      title: "No page metadata found",
      description: "Pages should export metadata (title, description, og:image) for search engines and social sharing.",
      fixPrompt: "Add metadata exports to your Next.js page files:\n```ts\nexport const metadata = {\n  title: 'Page Title',\n  description: 'Page description',\n  openGraph: { title: 'Page Title', description: '...' },\n};\n```",
      impact: 9,
    });
  }

  const hasRobots = files.some((f) => f.path.includes("robots.ts") || f.path.includes("robots.txt"));
  if (!hasRobots) {
    issues.push({
      id: "no-robots",
      category: "seo",
      severity: "warning",
      title: "No robots.txt",
      description: "A robots.txt file (or robots.ts route) tells search engines which pages to crawl.",
      fixPrompt: "Create app/robots.ts to define crawl rules:\n```ts\nexport default function robots() {\n  return {\n    rules: { userAgent: '*', allow: '/', disallow: '/api/' },\n    sitemap: `${process.env.NEXT_PUBLIC_APP_URL}/sitemap.xml`,\n  };\n}\n```",
      impact: 4,
    });
  }

  const hasSitemap = files.some((f) => f.path.includes("sitemap.ts") || f.path.includes("sitemap.xml"));
  if (!hasSitemap) {
    issues.push({
      id: "no-sitemap",
      category: "seo",
      severity: "warning",
      title: "No sitemap",
      description: "A sitemap.xml helps search engines discover and index all your pages.",
      fixPrompt: "Create app/sitemap.ts to generate a dynamic sitemap for your Next.js app.",
      impact: 4,
    });
  }

  const hasOgImage = /og:image|opengraph-image|twitter:image/i.test(allContent) || files.some((f) => f.path.includes("opengraph-image"));
  if (!hasOgImage) {
    issues.push({
      id: "no-og-image",
      category: "seo",
      severity: "warning",
      title: "No Open Graph image",
      description: "Open Graph images appear when your app is shared on social media. Add an opengraph-image.tsx or og:image metadata.",
      fixPrompt: "Add an Open Graph image by creating app/opengraph-image.tsx using the ImageResponse API, or add openGraph.images to your metadata export.",
      impact: 5,
    });
  }

  // ── Best Practices ───────────────────────────────────────────────────────

  const hasEnvExposure = /process\.env\.(?!NEXT_PUBLIC_)\w+/.test(tsxContent);
  if (hasEnvExposure) {
    issues.push({
      id: "env-exposure",
      category: "bestpractices",
      severity: "error",
      title: "Server env vars potentially exposed to client",
      description: "Non-NEXT_PUBLIC_ environment variables referenced in client components will be undefined at runtime and may expose secrets.",
      fixPrompt: "Move any server-only secrets to API routes or Server Components. Only use NEXT_PUBLIC_ prefixed variables in client components.",
      impact: 10,
    });
  }

  const hasTypeAny = (allContent.match(/:\s*any\b/g) ?? []).length;
  if (hasTypeAny > 10) {
    issues.push({
      id: "excessive-any",
      category: "bestpractices",
      severity: "warning",
      title: `${hasTypeAny} uses of TypeScript 'any' type`,
      description: "Excessive use of 'any' defeats TypeScript's safety guarantees. Use specific types or 'unknown' instead.",
      fixPrompt: "Replace 'any' type annotations with proper TypeScript types. Use 'unknown' when the type is genuinely unknown, and add type guards where needed.",
      impact: 5,
    });
  }

  const hasEslintDisable = (allContent.match(/eslint-disable/g) ?? []).length;
  if (hasEslintDisable > 3) {
    issues.push({
      id: "eslint-disable",
      category: "bestpractices",
      severity: "info",
      title: `${hasEslintDisable} ESLint disable comments`,
      description: "Frequent ESLint disables suggest underlying code quality issues. Fix the root causes instead.",
      fixPrompt: "Review and fix the issues causing ESLint errors rather than disabling rules. Remove eslint-disable comments and address the underlying code quality concerns.",
      impact: 3,
    });
  }

  const hasTodoComments = (allContent.match(/\/\/\s*(TODO|FIXME|HACK|XXX)/gi) ?? []).length;
  if (hasTodoComments > 0) {
    issues.push({
      id: "todo-comments",
      category: "bestpractices",
      severity: "info",
      title: `${hasTodoComments} TODO/FIXME comment${hasTodoComments > 1 ? "s" : ""}`,
      description: "Unresolved TODO and FIXME comments indicate incomplete work that may affect production quality.",
      fixPrompt: "Review and resolve the TODO and FIXME comments in the codebase, or create proper issues to track them.",
      impact: 2,
    });
  }

  const hasErrorBoundary = /ErrorBoundary|error\.tsx/i.test(allContent) || files.some((f) => f.path === "app/error.tsx" || f.path === "app/global-error.tsx");
  if (!hasErrorBoundary) {
    issues.push({
      id: "no-error-boundary",
      category: "bestpractices",
      severity: "warning",
      title: "No error boundary / error.tsx",
      description: "Without error boundaries, unhandled errors crash the entire page. Add app/error.tsx and app/global-error.tsx.",
      fixPrompt: "Create app/error.tsx and app/global-error.tsx as Next.js error boundary pages to gracefully handle runtime errors.",
      impact: 6,
    });
  }

  // ── Score Calculation ────────────────────────────────────────────────────

  const CATEGORIES: Category[] = ["performance", "accessibility", "seo", "bestpractices"];

  const results: Record<Category, CategoryResult> = {} as Record<Category, CategoryResult>;

  for (const cat of CATEGORIES) {
    const catIssues = issues.filter((i) => i.category === cat);
    const totalPenalty = catIssues.reduce((sum, i) => {
      const multiplier = i.severity === "error" ? 1.5 : i.severity === "warning" ? 1 : 0.3;
      return sum + i.impact * multiplier;
    }, 0);
    const score = Math.max(0, Math.min(100, Math.round(100 - totalPenalty * 2)));
    results[cat] = { score, issues: catIssues };
  }

  // Add pass items for categories with no issues
  if (results.seo.issues.length === 0) {
    results.seo.issues.push({
      id: "seo-pass",
      category: "seo",
      severity: "pass",
      title: "SEO basics in place",
      description: "Metadata, robots, sitemap, and OG images detected. Great work!",
      fixPrompt: "",
      impact: 0,
    });
  }

  return results;
}

// ─── Score Ring ─────────────────────────────────────────────────────────────

function ScoreRing({ score, size = 64 }: { score: number; size?: number }) {
  const r = (size - 8) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (score / 100) * circ;

  return (
    <svg width={size} height={size} className="rotate-[-90deg]">
      <circle cx={size / 2} cy={size / 2} r={r} fill="none" strokeWidth={6} stroke="hsl(var(--muted))" />
      <circle
        cx={size / 2} cy={size / 2} r={r}
        fill="none" strokeWidth={6}
        stroke={score >= 90 ? "#10b981" : score >= 50 ? "#f59e0b" : "#ef4444"}
        strokeDasharray={`${dash} ${circ - dash}`}
        strokeLinecap="round"
        style={{ transition: "stroke-dasharray 0.6s ease" }}
      />
    </svg>
  );
}

// ─── Category Section ────────────────────────────────────────────────────────

interface CategorySectionProps {
  category: Category;
  result: CategoryResult;
  onFixWithAI: (prompt: string) => void;
}

function CategorySection({ category, result, onFixWithAI }: CategorySectionProps) {
  const [expanded, setExpanded] = useState(true);
  const meta = CATEGORY_META[category];
  const Icon = meta.icon;

  return (
    <div className="rounded-xl border border-border overflow-hidden">
      {/* Header */}
      <button
        className="w-full flex items-center gap-3 px-3 py-3 bg-muted/20 hover:bg-muted/40 transition-colors"
        onClick={() => setExpanded((v) => !v)}
      >
        <Icon className={`w-4 h-4 shrink-0 ${meta.color}`} />
        <span className="text-xs font-semibold flex-1 text-left">{meta.label}</span>

        {/* Score ring */}
        <div className="relative shrink-0">
          <ScoreRing score={result.score} size={36} />
          <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-bold ${scoreColor(result.score)}`}>
            {result.score}
          </span>
        </div>

        <Badge
          variant="outline"
          className={`text-[9px] h-4 px-1.5 shrink-0 ${
            result.score >= 90
              ? "border-emerald-500/30 text-emerald-400"
              : result.score >= 50
              ? "border-amber-500/30 text-amber-400"
              : "border-red-500/30 text-red-400"
          }`}
        >
          {scoreLabel(result.score)}
        </Badge>

        {expanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />}
      </button>

      {/* Issue list */}
      {expanded && (
        <div className="divide-y divide-border/40">
          {result.issues.map((issue) => {
            const sevCfg = SEVERITY_CONFIG[issue.severity];
            const SevIcon = sevCfg.icon;
            return (
              <div key={issue.id} className="px-3 py-2.5 space-y-1">
                <div className="flex items-start gap-2">
                  <SevIcon className={`w-3.5 h-3.5 shrink-0 mt-0.5 ${sevCfg.color}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium">{issue.title}</p>
                    <p className="text-[10px] text-muted-foreground mt-0.5 leading-relaxed">
                      {issue.description}
                    </p>
                  </div>
                  {issue.severity !== "pass" && issue.fixPrompt && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 text-[10px] px-2 gap-1 shrink-0 text-violet-400 hover:text-violet-300 hover:bg-violet-500/10"
                      onClick={() => onFixWithAI(issue.fixPrompt)}
                    >
                      Fix <ArrowRight className="w-2.5 h-2.5" />
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Main Panel ──────────────────────────────────────────────────────────────

interface PerformancePanelProps {
  files: ProjectFile[];
  onFixWithAI: (prompt: string) => void;
}

export function PerformancePanel({ files, onFixWithAI }: PerformancePanelProps) {
  const [runCount, setRunCount] = useState(0);

  const results = useMemo(() => {
    void runCount; // dependency to allow re-run
    return runChecks(files);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [files, runCount]);

  const overallScore = Math.round(
    Object.values(results).reduce((s, r) => s + r.score, 0) / 4
  );

  const totalIssues = Object.values(results).reduce(
    (s, r) => s + r.issues.filter((i) => i.severity !== "pass").length, 0
  );

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <Gauge className="w-4 h-4 text-amber-400 shrink-0" />
        <span className="text-xs font-semibold flex-1">Performance</span>
        <Button
          size="sm"
          variant="ghost"
          className="h-6 w-6 p-0 shrink-0"
          onClick={() => setRunCount((n) => n + 1)}
          title="Re-run checks"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </Button>
      </div>

      {/* Overall score hero */}
      <div className="flex items-center gap-4 px-4 py-4 border-b border-border shrink-0 bg-muted/10">
        <div className="relative shrink-0">
          <ScoreRing score={overallScore} size={72} />
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={`text-lg font-bold ${scoreColor(overallScore)}`}>{overallScore}</span>
            <span className="text-[8px] text-muted-foreground leading-none">/ 100</span>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold">{scoreLabel(overallScore)}</p>
          <p className="text-[10px] text-muted-foreground mt-0.5">
            {totalIssues === 0
              ? "No issues found — great work!"
              : `${totalIssues} issue${totalIssues > 1 ? "s" : ""} detected across ${Object.keys(results).length} categories`}
          </p>
          {/* Mini score bars */}
          <div className="grid grid-cols-4 gap-1 mt-2">
            {(Object.entries(results) as [Category, CategoryResult][]).map(([cat, res]) => (
              <div key={cat} className="space-y-0.5">
                <div className="h-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className={`h-full rounded-full ${scoreBg(res.score)} transition-all duration-700`}
                    style={{ width: `${res.score}%` }}
                  />
                </div>
                <p className="text-[9px] text-muted-foreground text-center">{res.score}</p>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-4 gap-1">
            {(Object.keys(results) as Category[]).map((cat) => (
              <p key={cat} className="text-[8px] text-muted-foreground/60 text-center truncate">
                {CATEGORY_META[cat].label.split(" ")[0]}
              </p>
            ))}
          </div>
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">
          {(Object.entries(results) as [Category, CategoryResult][]).map(([cat, res]) => (
            <CategorySection
              key={cat}
              category={cat}
              result={res}
              onFixWithAI={onFixWithAI}
            />
          ))}

          {/* Disclaimer */}
          <p className="text-[9px] text-muted-foreground/60 text-center px-2 pb-2">
            Scores are heuristic estimates based on static analysis of your source files.
            Run Lighthouse in Chrome DevTools for precise real-world metrics.
          </p>
        </div>
      </ScrollArea>
    </div>
  );
}
