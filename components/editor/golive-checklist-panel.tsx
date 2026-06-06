"use client";

import { useState, useEffect, useCallback } from "react";
import { CheckCircle2, XCircle, AlertCircle, Rocket, RefreshCw, Sparkles, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ProjectFile } from "@/types/database";

interface GoLiveChecklistPanelProps {
  projectId: string;
  files: ProjectFile[];
  onFixWithAI: (prompt: string) => void;
}

type CheckStatus = "pass" | "fail" | "warn" | "loading";

interface CheckItem {
  id: string;
  label: string;
  description: string;
  category: string;
  impact: "critical" | "important" | "nice";
  status: CheckStatus;
  detail?: string;
  fixPrompt?: string;
}

// ─── Check runners ────────────────────────────────────────────────────────────

function hasFile(files: ProjectFile[], ...names: string[]): ProjectFile | undefined {
  return files.find((f) => names.some((n) => f.path === n || f.path.endsWith("/" + n)));
}

function fileContains(file: ProjectFile | undefined, pattern: RegExp | string): boolean {
  if (!file?.content) return false;
  return typeof pattern === "string"
    ? file.content.includes(pattern)
    : pattern.test(file.content);
}

function runChecks(files: ProjectFile[]): CheckItem[] {
  const indexHtml = hasFile(files, "index.html");
  const nextConfig = hasFile(files, "next.config.ts", "next.config.js", "next.config.mjs");
  const envExample = hasFile(files, ".env.local.example", ".env.example", ".env");
  const robotsTxt  = hasFile(files, "robots.txt");
  const sitemapXml = hasFile(files, "sitemap.xml");
  const manifest   = hasFile(files, "manifest.json", "manifest.webmanifest");
  const appPage    = hasFile(files, "app/page.tsx", "pages/index.tsx", "src/App.tsx");
  const mainLayout = hasFile(files, "app/layout.tsx");
  const errorBound = hasFile(files, "global-error.tsx", "error.tsx", "ErrorBoundary.tsx");

  const hasOGMeta      = fileContains(indexHtml, "og:title") || fileContains(mainLayout, "og:title") || fileContains(mainLayout, "openGraph");
  const hasCanonical   = fileContains(indexHtml, "canonical") || fileContains(mainLayout, "canonical");
  const hasCSP         = fileContains(nextConfig, "Content-Security-Policy") || fileContains(nextConfig, "contentSecurityPolicy");
  const hasAuthGuard   = files.some((f) => fileContains(f, "middleware") && fileContains(f, "supabase.auth"));
  const hasEnvVars     = !!envExample || files.some((f) => f.path.includes(".env"));
  const hasTitle       = fileContains(indexHtml, "<title>") || fileContains(mainLayout, "title:");
  const hasDescription = fileContains(indexHtml, 'name="description"') || fileContains(mainLayout, "description:");
  const hasRateLimit   = files.some((f) => fileContains(f, "rateLimit") || fileContains(f, "rate-limit") || fileContains(f, "rateLimiter"));
  const hasErrorBound  = !!errorBound;
  const hasFavicon     = hasFile(files, "favicon.ico", "favicon.svg", "icon.png") || fileContains(mainLayout, "icon");

  return [
    // SEO
    {
      id: "title",
      label: "Page title set",
      description: "Every page should have a descriptive <title> tag for SEO and browser tabs.",
      category: "SEO",
      impact: "important",
      status: hasTitle ? "pass" : "fail",
      detail: hasTitle ? "Title tag found in layout or HTML" : "No <title> detected in layout.tsx or index.html",
      fixPrompt: "Add a descriptive page title to my app's layout.tsx metadata and index.html",
    },
    {
      id: "description",
      label: "Meta description",
      description: "A 150-160 character meta description improves click-through rates in search results.",
      category: "SEO",
      impact: "important",
      status: hasDescription ? "pass" : "fail",
      detail: hasDescription ? "Meta description found" : "No meta description detected",
      fixPrompt: "Add a compelling meta description to my app's layout.tsx metadata and index.html",
    },
    {
      id: "og",
      label: "Open Graph tags",
      description: "OG tags control how your app appears when shared on Slack, Twitter, LinkedIn.",
      category: "SEO",
      impact: "important",
      status: hasOGMeta ? "pass" : "warn",
      detail: hasOGMeta ? "OG tags found" : "No og:title or openGraph metadata detected",
      fixPrompt: "Add Open Graph meta tags (og:title, og:description, og:image) to my app's layout.tsx",
    },
    {
      id: "canonical",
      label: "Canonical URL",
      description: "Prevents duplicate content issues when your app is embedded or accessed via multiple URLs.",
      category: "SEO",
      impact: "nice",
      status: hasCanonical ? "pass" : "warn",
      detail: hasCanonical ? "Canonical URL found" : "No canonical link tag detected",
      fixPrompt: "Add a canonical URL link tag to my app's layout.tsx metadata",
    },
    {
      id: "robots",
      label: "robots.txt",
      description: "Tells search engine crawlers which pages to index.",
      category: "SEO",
      impact: "important",
      status: robotsTxt ? "pass" : "warn",
      detail: robotsTxt ? "robots.txt found" : "No robots.txt found in project",
      fixPrompt: "Create a robots.txt file for my app that allows all crawlers and points to the sitemap",
    },
    {
      id: "sitemap",
      label: "sitemap.xml",
      description: "Helps search engines discover and index all your pages.",
      category: "SEO",
      impact: "nice",
      status: sitemapXml ? "pass" : "warn",
      detail: sitemapXml ? "sitemap.xml found" : "No sitemap.xml found",
      fixPrompt: "Create a sitemap.xml (or dynamic sitemap route) for my Next.js app",
    },
    // Security
    {
      id: "csp",
      label: "Content Security Policy",
      description: "CSP headers prevent XSS attacks by controlling which scripts can execute.",
      category: "Security",
      impact: "critical",
      status: hasCSP ? "pass" : "fail",
      detail: hasCSP ? "CSP configured in next.config" : "No Content-Security-Policy header found in next.config",
      fixPrompt: "Add a Content-Security-Policy header to my next.config.ts security headers",
    },
    {
      id: "auth",
      label: "Auth middleware",
      description: "Protected routes should check authentication before serving content.",
      category: "Security",
      impact: "critical",
      status: hasAuthGuard ? "pass" : "warn",
      detail: hasAuthGuard ? "Auth middleware detected" : "No auth guard found in middleware.ts — verify protected routes are secured",
      fixPrompt: "Add Supabase auth middleware to my Next.js app to protect dashboard routes",
    },
    {
      id: "ratelimit",
      label: "Rate limiting",
      description: "Prevents abuse of AI and API endpoints by limiting request frequency.",
      category: "Security",
      impact: "important",
      status: hasRateLimit ? "pass" : "warn",
      detail: hasRateLimit ? "Rate limiter found" : "No rate limiter detected on API routes",
      fixPrompt: "Add rate limiting to my API routes using the lib/rate-limit.ts utility",
    },
    // App quality
    {
      id: "errorboundary",
      label: "Error boundary",
      description: "Catches runtime errors and shows a user-friendly fallback instead of a blank screen.",
      category: "Quality",
      impact: "critical",
      status: hasErrorBound ? "pass" : "fail",
      detail: hasErrorBound ? "Error boundary component found" : "No global-error.tsx or ErrorBoundary component detected",
      fixPrompt: "Add a global-error.tsx error boundary to my Next.js app that shows a friendly error page",
    },
    {
      id: "envvars",
      label: "Env vars documented",
      description: ".env.local.example documents all required environment variables for deployment.",
      category: "Quality",
      impact: "important",
      status: hasEnvVars ? "pass" : "warn",
      detail: hasEnvVars ? "Env file found" : "No .env.local.example — teammates and deployment pipelines won't know which vars are required",
      fixPrompt: "Create a .env.local.example file listing all required environment variables for my app",
    },
    {
      id: "favicon",
      label: "Favicon / app icon",
      description: "A custom favicon improves brand recognition in browser tabs and bookmarks.",
      category: "Quality",
      impact: "nice",
      status: hasFavicon ? "pass" : "warn",
      detail: hasFavicon ? "Favicon detected" : "No favicon.ico or icon metadata found",
      fixPrompt: "Add a favicon to my Next.js app — generate one with the Image Gen panel or use a placeholder SVG",
    },
    {
      id: "manifest",
      label: "PWA manifest",
      description: "Enables 'Add to Home Screen' on mobile and improves app discoverability.",
      category: "Quality",
      impact: "nice",
      status: manifest ? "pass" : "warn",
      detail: manifest ? "manifest.json found" : "No web manifest — app cannot be installed as a PWA",
      fixPrompt: "Create a manifest.json for my app with name, icons, theme_color, and display: standalone",
    },
  ];
}

// ─── Check card ───────────────────────────────────────────────────────────────

const IMPACT_COLORS = { critical: "text-red-400 border-red-500/30", important: "text-amber-400 border-amber-500/30", nice: "text-sky-400 border-sky-500/30" };

function CheckCard({ item, onFix }: { item: CheckItem; onFix: () => void }) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon =
    item.status === "pass"    ? <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" /> :
    item.status === "fail"    ? <XCircle      className="w-4 h-4 text-red-400 shrink-0" /> :
    item.status === "warn"    ? <AlertCircle  className="w-4 h-4 text-amber-400 shrink-0" /> :
                                <Loader2      className="w-4 h-4 text-muted-foreground shrink-0 animate-spin" />;

  return (
    <div className={`rounded-xl border overflow-hidden ${
      item.status === "pass" ? "border-border bg-muted/10" :
      item.status === "fail" ? "border-red-500/20 bg-red-500/5" :
      "border-amber-500/20 bg-amber-500/5"
    }`}>
      <button
        className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
        onClick={() => setExpanded((v) => !v)}
      >
        {statusIcon}
        <span className="flex-1 text-xs font-medium text-foreground">{item.label}</span>
        <Badge variant="outline" className={`text-[9px] h-4 px-1 ${IMPACT_COLORS[item.impact]}`}>
          {item.impact}
        </Badge>
        {expanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 pt-0 border-t border-border space-y-2">
          <p className="text-[11px] text-muted-foreground leading-relaxed">{item.description}</p>
          {item.detail && (
            <p className="text-[11px] text-foreground/70 font-mono bg-muted/30 rounded px-2 py-1">{item.detail}</p>
          )}
          {item.status !== "pass" && item.fixPrompt && (
            <Button size="sm" variant="outline" className="h-7 text-[11px] gap-1" onClick={onFix}>
              <Sparkles className="w-3 h-3 text-violet-400" /> Fix with AI
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main panel ───────────────────────────────────────────────────────────────

export function GoLiveChecklistPanel({ projectId, files, onFixWithAI }: GoLiveChecklistPanelProps) {
  const [checks, setChecks] = useState<CheckItem[]>([]);
  const [running, setRunning] = useState(false);
  const [filterCategory, setFilterCategory] = useState("All");

  const runAll = useCallback(() => {
    setRunning(true);
    setChecks([]); // show loading
    setTimeout(() => {
      setChecks(runChecks(files));
      setRunning(false);
    }, 800);
  }, [files]);

  useEffect(() => { runAll(); }, [runAll]);

  const categories = ["All", "SEO", "Security", "Quality"];
  const filtered = filterCategory === "All" ? checks : checks.filter((c) => c.category === filterCategory);

  const passing  = checks.filter((c) => c.status === "pass").length;
  const failing  = checks.filter((c) => c.status === "fail").length;
  const warnings = checks.filter((c) => c.status === "warn").length;
  const score    = checks.length > 0 ? Math.round((passing / checks.length) * 100) : 0;

  const criticalFails = checks.filter((c) => c.status === "fail" && c.impact === "critical");
  const isReady = criticalFails.length === 0 && checks.length > 0;

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Rocket className="w-4 h-4 text-emerald-400" />
          <h2 className="font-semibold text-foreground">Go-Live Checklist</h2>
          {!running && checks.length > 0 && (
            <Badge
              variant="outline"
              className={`text-[10px] h-4 px-1.5 ${isReady ? "border-emerald-500/40 text-emerald-400" : "border-amber-500/40 text-amber-400"}`}
            >
              {isReady ? "Ready" : "Issues found"}
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Pre-deployment health check for SEO, security, and quality</p>
      </div>

      {/* Score ring */}
      {!running && checks.length > 0 && (
        <div className="p-4 border-b border-border flex items-center gap-4">
          <div className="relative w-16 h-16 shrink-0">
            <svg className="w-16 h-16 -rotate-90" viewBox="0 0 64 64">
              <circle cx="32" cy="32" r="26" fill="none" stroke="currentColor" strokeWidth="6" className="text-muted/30" />
              <circle
                cx="32" cy="32" r="26" fill="none" strokeWidth="6"
                stroke={score >= 80 ? "#22c55e" : score >= 60 ? "#f59e0b" : "#ef4444"}
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 26}`}
                strokeDashoffset={`${2 * Math.PI * 26 * (1 - score / 100)}`}
                className="transition-all duration-500"
              />
            </svg>
            <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-foreground">{score}%</span>
          </div>
          <div className="flex-1 space-y-1">
            <div className="flex items-center gap-3 text-xs">
              <span className="flex items-center gap-1"><CheckCircle2 className="w-3 h-3 text-emerald-400" /><span className="text-foreground">{passing} passing</span></span>
              <span className="flex items-center gap-1"><XCircle className="w-3 h-3 text-red-400" /><span className="text-foreground">{failing} failing</span></span>
              <span className="flex items-center gap-1"><AlertCircle className="w-3 h-3 text-amber-400" /><span className="text-foreground">{warnings} warnings</span></span>
            </div>
            {criticalFails.length > 0 && (
              <p className="text-[11px] text-red-400">{criticalFails.length} critical issue{criticalFails.length !== 1 ? "s" : ""} must be fixed before going live</p>
            )}
            {isReady && (
              <p className="text-[11px] text-emerald-400">All critical checks pass — ready to deploy!</p>
            )}
          </div>
        </div>
      )}

      {/* Category filter */}
      <div className="flex gap-1 px-4 py-2 border-b border-border overflow-x-auto">
        {categories.map((cat) => (
          <button
            key={cat}
            onClick={() => setFilterCategory(cat)}
            className={`shrink-0 px-3 py-1 rounded-full text-xs font-medium transition-all ${
              filterCategory === cat ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Checks list */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {running ? (
          <div className="flex flex-col items-center gap-3 py-12">
            <Loader2 className="w-6 h-6 animate-spin text-violet-400" />
            <p className="text-xs text-muted-foreground">Running checks…</p>
          </div>
        ) : (
          filtered.map((item) => (
            <CheckCard
              key={item.id}
              item={item}
              onFix={() => { if (item.fixPrompt) onFixWithAI(item.fixPrompt); }}
            />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border">
        <Button size="sm" variant="outline" className="w-full gap-1.5" onClick={runAll} disabled={running}>
          <RefreshCw className={`w-3.5 h-3.5 ${running ? "animate-spin" : ""}`} />
          {running ? "Scanning…" : "Re-run checks"}
        </Button>
      </div>
    </div>
  );
}
