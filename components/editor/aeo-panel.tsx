"use client";

/**
 * AeoPanel — Answer Engine Optimization
 * Audits project files for AEO signals (FAQ schema, HowTo schema, Article schema,
 * BreadcrumbList, speakable, etc.) and lets users generate structured data via AI.
 */

import { useState, useMemo } from "react";
import {
  Sparkles, CheckCircle2, AlertTriangle, XCircle, Circle,
  ChevronDown, ChevronRight, Wand2, Copy, Check,
  FileJson, HelpCircle, BookOpen, List, Mic, Globe,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ProjectFile } from "@/types/database";

// ─── AEO Check types ──────────────────────────────────────────────────────────

type CheckStatus = "pass" | "warning" | "fail" | "info";

interface AeoCheck {
  id: string;
  label: string;
  description: string;
  status: CheckStatus;
  impact: "high" | "medium" | "low";
  fixPrompt?: string;
  schemaType?: string;
}

interface SchemaTemplate {
  id: string;
  name: string;
  icon: React.ElementType;
  description: string;
  aiPrompt: string;
  example: string;
}

// ─── Schema templates ─────────────────────────────────────────────────────────

const SCHEMA_TEMPLATES: SchemaTemplate[] = [
  {
    id: "faq",
    name: "FAQPage",
    icon: HelpCircle,
    description: "Enables FAQ rich results in Google — ideal for landing and support pages",
    aiPrompt: `Add FAQPage JSON-LD structured data to the project's HTML head. Extract the most commonly asked questions from the page content or create 5-8 relevant FAQs for this app. Use the schema.org FAQPage format with mainEntity array of Question/Answer pairs. Add the <script type="application/ld+json"> block to the <head> in app/layout.tsx or the relevant page file.`,
    example: `{
  "@context": "https://schema.org",
  "@type": "FAQPage",
  "mainEntity": [{
    "@type": "Question",
    "name": "How does it work?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "…"
    }
  }]
}`,
  },
  {
    id: "howto",
    name: "HowTo",
    icon: List,
    description: "Step-by-step instructions shown as rich results — great for tutorial pages",
    aiPrompt: `Add HowTo JSON-LD structured data to the project. Identify any tutorial, guide, or step-by-step content in the project files and mark it up with schema.org HowTo schema including name, description, totalTime, supply, tool, and step arrays. Add to the relevant page file's <head> as a <script type="application/ld+json"> block.`,
    example: `{
  "@context": "https://schema.org",
  "@type": "HowTo",
  "name": "How to get started",
  "step": [
    { "@type": "HowToStep", "text": "Step 1…" }
  ]
}`,
  },
  {
    id: "article",
    name: "Article",
    icon: BookOpen,
    description: "Marks up blog posts and articles for Google News and Discover",
    aiPrompt: `Add Article JSON-LD structured data to all blog post or article pages in this project. Use schema.org Article (or BlogPosting) with headline, author, datePublished, dateModified, image, and publisher fields. Add to each article page's <head>.`,
    example: `{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Article title",
  "author": { "@type": "Person", "name": "Author" },
  "datePublished": "2024-01-01"
}`,
  },
  {
    id: "breadcrumb",
    name: "BreadcrumbList",
    icon: List,
    description: "Shows page hierarchy in Google search results",
    aiPrompt: `Add BreadcrumbList JSON-LD structured data to all non-root pages in this project. Use schema.org BreadcrumbList with ListItem entries for each path segment. Wire it dynamically using the current route path so it updates per-page.`,
    example: `{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [{
    "@type": "ListItem",
    "position": 1,
    "name": "Home",
    "item": "https://example.com"
  }]
}`,
  },
  {
    id: "speakable",
    name: "Speakable",
    icon: Mic,
    description: "Marks content suitable for text-to-speech in voice assistants",
    aiPrompt: `Add Speakable JSON-LD or speakable CSS selectors to this project to mark the most important content for voice search and AI assistants. Identify headings, intro paragraphs, and key sections that should be read aloud and add the speakable property referencing those CSS selectors.`,
    example: `{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "speakable": {
    "@type": "SpeakableSpecification",
    "cssSelector": ["h1", ".article-intro"]
  }
}`,
  },
  {
    id: "software",
    name: "SoftwareApplication",
    icon: Globe,
    description: "Marks up web apps with ratings, pricing, and OS support",
    aiPrompt: `Add SoftwareApplication JSON-LD structured data to the main page of this project. Include applicationCategory, operatingSystem (Web), offers (with price), aggregateRating if applicable, and featureList. Add to app/layout.tsx or the main landing page.`,
    example: `{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "App name",
  "applicationCategory": "WebApplication",
  "offers": { "@type": "Offer", "price": "0" }
}`,
  },
];

// ─── Check runner ─────────────────────────────────────────────────────────────

function runAeoChecks(files: ProjectFile[]): AeoCheck[] {
  const allContent = files.map((f) => f.content ?? "").join("\n");
  const htmlFiles = files.filter((f) => /\.(tsx|jsx|html)$/.test(f.path));
  const htmlContent = htmlFiles.map((f) => f.content ?? "").join("\n");

  const checks: AeoCheck[] = [
    {
      id: "faq_schema",
      label: "FAQPage structured data",
      description: "JSON-LD FAQPage schema enables FAQ rich results in search engines and AI assistants.",
      status: /FAQPage|faqpage/i.test(allContent) ? "pass" : "fail",
      impact: "high",
      schemaType: "FAQPage",
      fixPrompt: SCHEMA_TEMPLATES.find((t) => t.id === "faq")!.aiPrompt,
    },
    {
      id: "howto_schema",
      label: "HowTo structured data",
      description: "HowTo schema surfaces step-by-step instructions in Google rich results.",
      status: /HowTo|howto/i.test(allContent) ? "pass" : "info",
      impact: "medium",
      schemaType: "HowTo",
      fixPrompt: SCHEMA_TEMPLATES.find((t) => t.id === "howto")!.aiPrompt,
    },
    {
      id: "article_schema",
      label: "Article / BlogPosting schema",
      description: "Article schema enables Google News and Discover eligibility.",
      status: /Article|BlogPosting/i.test(allContent) ? "pass"
        : /blog|post|article/i.test(allContent) ? "warning" : "info",
      impact: "medium",
      schemaType: "Article",
      fixPrompt: SCHEMA_TEMPLATES.find((t) => t.id === "article")!.aiPrompt,
    },
    {
      id: "breadcrumb_schema",
      label: "BreadcrumbList schema",
      description: "Breadcrumbs improve navigation signals and are shown in search snippets.",
      status: /BreadcrumbList/i.test(allContent) ? "pass" : "warning",
      impact: "medium",
      schemaType: "BreadcrumbList",
      fixPrompt: SCHEMA_TEMPLATES.find((t) => t.id === "breadcrumb")!.aiPrompt,
    },
    {
      id: "software_schema",
      label: "SoftwareApplication schema",
      description: "Marks up the app with ratings and pricing for rich results.",
      status: /SoftwareApplication|WebApplication/i.test(allContent) ? "pass" : "warning",
      impact: "high",
      schemaType: "SoftwareApplication",
      fixPrompt: SCHEMA_TEMPLATES.find((t) => t.id === "software")!.aiPrompt,
    },
    {
      id: "speakable",
      label: "Speakable specification",
      description: "Speakable markup helps voice assistants and AI identify content for audio playback.",
      status: /speakable|SpeakableSpecification/i.test(allContent) ? "pass" : "info",
      impact: "low",
      fixPrompt: SCHEMA_TEMPLATES.find((t) => t.id === "speakable")!.aiPrompt,
    },
    {
      id: "llms_txt",
      label: "llms.txt for AI crawlers",
      description: "An llms.txt file at the root helps AI models understand your site structure and purpose.",
      status: files.some((f) => f.path.includes("llms.txt")) ? "pass" : "warning",
      impact: "high",
      fixPrompt: `Create a public/llms.txt file following the llms.txt standard (https://llmstxt.org). Include: site name, description, key pages with their purpose, and any important context for AI models. Also create a public/llms-full.txt with complete documentation.`,
    },
    {
      id: "og_tags",
      label: "OpenGraph meta tags",
      description: "og:title, og:description, og:image required for rich previews in AI chat interfaces.",
      status: /og:title|og:description|og:image/i.test(htmlContent) ? "pass"
        : /openGraph|opengraph/i.test(allContent) ? "pass" : "warning",
      impact: "high",
      fixPrompt: `Add complete OpenGraph meta tags to the project's <head>: og:title, og:description, og:image (1200×630px), og:url, og:type, og:site_name. Use Next.js metadata API in app/layout.tsx with the openGraph object.`,
    },
    {
      id: "canonical",
      label: "Canonical URL tag",
      description: "Prevents duplicate content penalties and helps AI crawlers identify the authoritative URL.",
      status: /canonical|alternates.*canonical/i.test(allContent) ? "pass" : "warning",
      impact: "medium",
      fixPrompt: `Add a canonical URL to the project's metadata in app/layout.tsx using Next.js metadata: alternates: { canonical: process.env.NEXT_PUBLIC_APP_URL }`,
    },
    {
      id: "sitemap",
      label: "sitemap.xml",
      description: "A sitemap helps search engines and AI crawlers discover all pages.",
      status: files.some((f) => /sitemap/.test(f.path)) ? "pass" : "warning",
      impact: "high",
      fixPrompt: `Create a Next.js app/sitemap.ts file that generates a sitemap.xml dynamically. Include all static routes and any dynamic routes (blog posts, projects, etc.) fetched from the database. Export a default function that returns a MetadataRoute.Sitemap array.`,
    },
    {
      id: "robots_txt",
      label: "robots.txt",
      description: "Controls which AI crawlers and search bots can index your content.",
      status: files.some((f) => /robots/.test(f.path)) ? "pass" : "info",
      impact: "medium",
      fixPrompt: `Create a Next.js app/robots.ts file that generates robots.txt. Allow all search engines and common AI crawlers (GPTBot, ClaudeBot, PerplexityBot) while blocking malicious bots. Export a default function returning a MetadataRoute.Robots object.`,
    },
  ];

  return checks;
}

// ─── Score calculator ─────────────────────────────────────────────────────────

function calcAeoScore(checks: AeoCheck[]): number {
  const weights = { high: 15, medium: 8, low: 4 };
  const maxScore = checks.reduce((s, c) => s + weights[c.impact], 0);
  const earned = checks
    .filter((c) => c.status === "pass")
    .reduce((s, c) => s + weights[c.impact], 0);
  return maxScore > 0 ? Math.round((earned / maxScore) * 100) : 0;
}

// ─── Status icon ──────────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: CheckStatus }) {
  if (status === "pass")    return <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />;
  if (status === "warning") return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  if (status === "fail")    return <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
  return <Circle className="w-3.5 h-3.5 text-muted-foreground/40 shrink-0" />;
}

function statusColor(s: CheckStatus) {
  return s === "pass" ? "border-emerald-500/20 bg-emerald-500/5"
    : s === "fail" ? "border-red-500/20 bg-red-500/5"
    : s === "warning" ? "border-amber-500/20 bg-amber-500/5"
    : "border-border bg-muted/10";
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface AeoPanelProps {
  files: ProjectFile[];
  onGenerateSchema: (prompt: string) => void;
}

export function AeoPanel({ files, onGenerateSchema }: AeoPanelProps) {
  const [activeTab, setActiveTab] = useState<"audit" | "generate">("audit");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const checks = useMemo(() => runAeoChecks(files), [files]);
  const score = useMemo(() => calcAeoScore(checks), [checks]);

  const passing  = checks.filter((c) => c.status === "pass").length;
  const failing  = checks.filter((c) => c.status === "fail").length;
  const warnings = checks.filter((c) => c.status === "warning").length;

  function copyExample(id: string, text: string) {
    void navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  }

  const scoreColor = score >= 80 ? "text-emerald-400" : score >= 50 ? "text-amber-400" : "text-red-400";
  const scoreBg    = score >= 80 ? "bg-emerald-500" : score >= 50 ? "bg-amber-500" : "bg-red-500";

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <Sparkles className="w-4 h-4 text-violet-400 shrink-0" />
        <span className="text-xs font-semibold flex-1">AEO — Answer Engines</span>
        <Badge variant="outline" className={`text-[10px] h-4 px-1.5 font-bold ${scoreColor}`}>
          {score}/100
        </Badge>
      </div>

      {/* Tabs */}
      <div className="flex border-b border-border shrink-0">
        {(["audit", "generate"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-2 text-[11px] font-medium transition-colors ${
              activeTab === tab
                ? "text-foreground border-b-2 border-primary"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "audit" ? "AEO Audit" : "Generate Schema"}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        {activeTab === "audit" ? (
          <div className="p-3 space-y-3">
            {/* Score hero */}
            <div className="rounded-xl border border-border bg-muted/20 p-4">
              <div className="flex items-center gap-4">
                {/* Ring */}
                <div className="relative w-16 h-16 shrink-0">
                  <svg viewBox="0 0 64 64" className="w-16 h-16 -rotate-90">
                    <circle cx="32" cy="32" r="26" fill="none" stroke="hsl(var(--muted))" strokeWidth="6" />
                    <circle
                      cx="32" cy="32" r="26" fill="none"
                      stroke={score >= 80 ? "#34d399" : score >= 50 ? "#fbbf24" : "#f87171"}
                      strokeWidth="6"
                      strokeDasharray={`${(score / 100) * 163.4} 163.4`}
                      strokeLinecap="round"
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className={`text-sm font-bold ${scoreColor}`}>{score}</span>
                  </div>
                </div>
                <div className="flex-1">
                  <p className="text-xs font-semibold mb-1">AEO Score</p>
                  <div className="flex gap-3 text-[10px]">
                    <span className="text-emerald-400">✓ {passing} pass</span>
                    <span className="text-amber-400">⚠ {warnings} warn</span>
                    <span className="text-red-400">✗ {failing} fail</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-1">
                    {score >= 80 ? "Great AEO coverage" : score >= 50 ? "Room to improve" : "Needs structured data"}
                  </p>
                </div>
              </div>
            </div>

            {/* Checks */}
            <div className="space-y-1.5">
              {checks.map((check) => (
                <div
                  key={check.id}
                  className={`rounded-xl border overflow-hidden ${statusColor(check.status)}`}
                >
                  <button
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left"
                    onClick={() => setExpandedId((p) => p === check.id ? null : check.id)}
                  >
                    <StatusIcon status={check.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium truncate">{check.label}</p>
                    </div>
                    <Badge
                      variant="outline"
                      className={`text-[8px] h-4 px-1 shrink-0 ${
                        check.impact === "high" ? "border-red-500/30 text-red-400" :
                        check.impact === "medium" ? "border-amber-500/30 text-amber-400" :
                        "border-border text-muted-foreground"
                      }`}
                    >
                      {check.impact}
                    </Badge>
                    {expandedId === check.id
                      ? <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                      : <ChevronRight className="w-3 h-3 text-muted-foreground shrink-0" />}
                  </button>

                  {expandedId === check.id && (
                    <div className="px-3 pb-3 pt-1 border-t border-current/10 space-y-2">
                      <p className="text-[10px] text-muted-foreground leading-relaxed">{check.description}</p>
                      {check.status !== "pass" && check.fixPrompt && (
                        <Button
                          size="sm"
                          className="w-full h-7 text-xs gap-1.5"
                          onClick={() => onGenerateSchema(check.fixPrompt!)}
                        >
                          <Wand2 className="w-3 h-3" /> Fix with AI
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            <p className="text-[10px] text-muted-foreground px-0.5 pb-1">
              Select a schema type to generate and inject into your project via AI.
            </p>
            {SCHEMA_TEMPLATES.map((tpl) => {
              const Icon = tpl.icon;
              return (
                <div key={tpl.id} className="rounded-xl border border-border bg-card overflow-hidden">
                  <div className="flex items-start gap-3 p-3">
                    <div className="w-8 h-8 rounded-lg bg-violet-500/15 flex items-center justify-center shrink-0">
                      <Icon className="w-4 h-4 text-violet-400" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <p className="text-xs font-semibold">{tpl.name}</p>
                        <Badge variant="outline" className="text-[8px] h-3.5 px-1 font-mono">JSON-LD</Badge>
                      </div>
                      <p className="text-[10px] text-muted-foreground mt-0.5">{tpl.description}</p>
                    </div>
                  </div>

                  {/* Example */}
                  <div className="mx-3 mb-2 rounded-lg bg-muted/40 border border-border/60 overflow-hidden">
                    <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border/40 bg-muted/20">
                      <span className="flex items-center gap-1.5 text-[9px] text-muted-foreground">
                        <FileJson className="w-2.5 h-2.5" /> example
                      </span>
                      <button onClick={() => copyExample(tpl.id, tpl.example)}>
                        {copiedId === tpl.id
                          ? <Check className="w-3 h-3 text-emerald-400" />
                          : <Copy className="w-3 h-3 text-muted-foreground hover:text-foreground" />}
                      </button>
                    </div>
                    <pre className="text-[9px] font-mono text-muted-foreground/80 p-2.5 max-h-24 overflow-y-auto whitespace-pre-wrap">
                      {tpl.example}
                    </pre>
                  </div>

                  <div className="px-3 pb-3">
                    <Button
                      size="sm"
                      className="w-full h-7 text-xs gap-1.5"
                      onClick={() => onGenerateSchema(tpl.aiPrompt)}
                    >
                      <Wand2 className="w-3 h-3" /> Generate {tpl.name} with AI
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </ScrollArea>

      {/* Footer */}
      <div className="border-t border-border px-3 py-2 shrink-0">
        <p className="text-[9px] text-muted-foreground text-center">
          Structured data helps AI assistants, voice search, and search engines understand your content.
        </p>
      </div>
    </div>
  );
}
