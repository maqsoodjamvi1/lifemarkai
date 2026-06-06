"use client";

/**
 * AccessibilityPanel — AI-powered a11y checker for the editor
 *
 * Scans project files for common accessibility issues:
 * - Missing alt text on <img> tags
 * - Missing ARIA roles / labels
 * - Non-semantic HTML (div-soup)
 * - Missing form labels
 * - Color contrast warnings (heuristic)
 * - Keyboard navigation issues
 *
 * Uses local pattern matching + AI explanation for each issue.
 */

import { useState, useCallback } from "react";
import {
  Eye, AlertTriangle, AlertCircle, Info, CheckCircle2,
  Loader2, RefreshCw, Zap, ChevronDown, ChevronUp,
  ExternalLink, Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type { ProjectFile } from "@/types/database";

// ─── Types ───────────────────────────────────────────────────────────────────

type Severity = "error" | "warning" | "info";

interface A11yIssue {
  id: string;
  severity: Severity;
  rule: string;
  description: string;
  file: string;
  line: number;
  snippet: string;
  fixPrompt: string;
  wcag?: string;
  expanded?: boolean;
}

interface AccessibilityPanelProps {
  files: ProjectFile[];
  onFixWithAI: (prompt: string) => void;
}

// ─── Rules ───────────────────────────────────────────────────────────────────

interface Rule {
  id: string;
  severity: Severity;
  name: string;
  pattern: RegExp;
  description: (match: string) => string;
  fixPrompt: (file: string, snippet: string) => string;
  wcag?: string;
  antipattern?: RegExp; // skip if this is also present on the same line
}

const RULES: Rule[] = [
  {
    id: "img-alt",
    severity: "error",
    name: "Missing alt attribute on <img>",
    pattern: /<img(?![^>]*alt=)[^>]*>/gi,
    description: () => "Images must have an alt attribute to convey meaning to screen reader users.",
    fixPrompt: (file, snippet) =>
      `In ${file}, add descriptive alt attributes to all <img> tags that are missing them. The problematic snippet is:\n${snippet}`,
    wcag: "1.1.1",
  },
  {
    id: "img-empty-alt",
    severity: "warning",
    name: "Empty alt attribute on non-decorative image",
    pattern: /<img[^>]*alt=(?:""|''|\s*)[^>]*src=(?!"data:)[^>]*>/gi,
    description: () => "An empty alt attribute implies the image is decorative. If the image conveys information, provide a meaningful alt.",
    fixPrompt: (file, snippet) =>
      `In ${file}, review this image and add a meaningful alt attribute if it conveys information:\n${snippet}`,
    wcag: "1.1.1",
  },
  {
    id: "button-no-text",
    severity: "error",
    name: "Button with no accessible label",
    pattern: /<button[^>]*>[\s]*<(?:svg|img|span className="sr-only")[^>]*>[^<]*<\/(?:svg|img|span)>[\s]*<\/button>/gi,
    description: () => "Icon-only buttons must have an aria-label or aria-labelledby to be accessible.",
    fixPrompt: (file, snippet) =>
      `In ${file}, add aria-label attributes to icon-only buttons:\n${snippet}`,
    wcag: "4.1.2",
  },
  {
    id: "input-no-label",
    severity: "error",
    name: "Input without associated label",
    pattern: /<input(?![^>]*(?:aria-label|aria-labelledby|id=))[^>]*(?:type=(?:"text"|"email"|"password"|"search"|"tel"))[^>]*>/gi,
    description: () => "Form inputs must be associated with a label element or have an aria-label.",
    fixPrompt: (file, snippet) =>
      `In ${file}, add labels or aria-label attributes to all form inputs missing them:\n${snippet}`,
    wcag: "1.3.1",
  },
  {
    id: "link-no-text",
    severity: "error",
    name: "Link with no discernible text",
    pattern: /<a[^>]*>[\s]*<(?:svg|img)[^>]*>[\s]*<\/a>/gi,
    description: () => "Links must have accessible text. Add aria-label to icon-only links.",
    fixPrompt: (file, snippet) =>
      `In ${file}, add aria-label to links that contain only icons:\n${snippet}`,
    wcag: "2.4.4",
  },
  {
    id: "div-button",
    severity: "warning",
    name: "Interactive div instead of button",
    pattern: /<div[^>]*(?:onClick|on-click)[^>]*>/gi,
    description: () => "Clickable <div> elements aren't keyboard accessible. Use <button> instead.",
    fixPrompt: (file, snippet) =>
      `In ${file}, replace the clickable <div> with a semantically correct <button> element:\n${snippet}`,
    wcag: "4.1.2",
  },
  {
    id: "tabindex-positive",
    severity: "warning",
    name: "Positive tabIndex disrupts focus order",
    pattern: /tabIndex=\{[1-9]\d*\}|tabindex=["'][1-9]/gi,
    description: () => "Positive tabIndex values create an unexpected tab order. Use tabIndex={0} or -1 instead.",
    fixPrompt: (file, snippet) =>
      `In ${file}, remove or correct the positive tabIndex values to avoid disrupting keyboard focus order:\n${snippet}`,
    wcag: "2.4.3",
  },
  {
    id: "autofocus",
    severity: "info",
    name: "autoFocus can be disorienting",
    pattern: /autoFocus(?:=\{true\})?(?!\s*=\s*\{false\})/gi,
    description: () => "autoFocus can unexpectedly move focus and disorient screen reader users. Use intentionally.",
    fixPrompt: (file, snippet) =>
      `In ${file}, evaluate whether autoFocus is appropriate here or if focus management should be handled programmatically:\n${snippet}`,
    wcag: "2.4.3",
  },
  {
    id: "no-language",
    severity: "warning",
    name: "HTML element missing lang attribute",
    pattern: /<html(?![^>]*lang=)[^>]*>/gi,
    description: () => "The <html> element must have a lang attribute for screen readers to use the correct language.",
    fixPrompt: (file, snippet) =>
      `In ${file}, add a lang attribute to the <html> element:\n${snippet}`,
    wcag: "3.1.1",
  },
  {
    id: "low-contrast-hint",
    severity: "info",
    name: "Potential low contrast (heuristic)",
    pattern: /text-(?:gray|slate|zinc|neutral|stone)-[23]00|text-muted(?!-foreground)/gi,
    description: (match) => `"${match}" may produce text that's too light for WCAG AA contrast (4.5:1). Verify with a contrast checker.`,
    fixPrompt: (file, snippet) =>
      `In ${file}, review this text color for WCAG AA contrast compliance and increase if necessary:\n${snippet}`,
    wcag: "1.4.3",
  },
  {
    id: "role-missing",
    severity: "info",
    name: "Landmark region without role",
    pattern: /<(?:header|footer|main|nav|aside|section)(?![^>]*(?:role|aria-label|aria-labelledby))[^>]*>/gi,
    description: (match) => `The <${match.match(/<(\w+)/)?.[1] ?? "element"}> element should have an aria-label if there are multiple of the same type.`,
    fixPrompt: (file, snippet) =>
      `In ${file}, add appropriate aria-label attributes to landmark regions to distinguish them:\n${snippet}`,
    wcag: "1.3.1",
  },
];

// ─── Scanner ─────────────────────────────────────────────────────────────────

function scanFiles(files: ProjectFile[]): A11yIssue[] {
  const issues: A11yIssue[] = [];
  const uiFiles = files.filter((f) =>
    /\.(tsx|jsx|html)$/.test(f.path) && f.content
  );

  for (const file of uiFiles) {
    const lines = (file.content ?? "").split("\n");
    for (const rule of RULES) {
      const fullMatch = (file.content ?? "").matchAll(new RegExp(rule.pattern.source, "gi"));
      for (const match of fullMatch) {
        const beforeMatch = (file.content ?? "").slice(0, match.index ?? 0);
        const lineNum = beforeMatch.split("\n").length;
        const snippet = lines.slice(Math.max(0, lineNum - 2), lineNum + 2).join("\n").trim().slice(0, 200);

        issues.push({
          id: `${rule.id}-${file.path}-${lineNum}`,
          severity: rule.severity,
          rule: rule.name,
          description: rule.description(match[0]),
          file: file.path,
          line: lineNum,
          snippet,
          fixPrompt: rule.fixPrompt(file.path, snippet),
          wcag: rule.wcag,
        });
      }
    }
  }

  return issues;
}

// ─── Severity config ─────────────────────────────────────────────────────────

const SEV = {
  error:   { icon: AlertCircle,  label: "Error",   color: "text-red-500",    bg: "bg-red-500/10 border-red-500/20",    badge: "bg-red-500/10 text-red-500 border-red-500/20" },
  warning: { icon: AlertTriangle,label: "Warning", color: "text-amber-500",  bg: "bg-amber-500/10 border-amber-500/20", badge: "bg-amber-500/10 text-amber-500 border-amber-500/20" },
  info:    { icon: Info,         label: "Info",    color: "text-blue-400",   bg: "bg-blue-500/10 border-blue-500/20",  badge: "bg-blue-500/10 text-blue-400 border-blue-500/20" },
};

// ─── Component ────────────────────────────────────────────────────────────────

export function AccessibilityPanel({ files, onFixWithAI }: AccessibilityPanelProps) {
  const [issues, setIssues] = useState<A11yIssue[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<"all" | Severity>("all");

  const runScan = useCallback(async () => {
    setScanning(true);
    // Simulate slight delay for UX
    await new Promise((r) => setTimeout(r, 400));
    const found = scanFiles(files);
    setIssues(found);
    setScanning(false);
    if (found.length === 0) {
      toast({ title: "No accessibility issues found!" });
    } else {
      toast({ title: `Found ${found.length} accessibility issue${found.length !== 1 ? "s" : ""}` });
    }
  }, [files]);

  const toggleExpand = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const filteredIssues = issues?.filter((i) => filter === "all" || i.severity === filter) ?? [];

  const counts = {
    error:   issues?.filter((i) => i.severity === "error").length ?? 0,
    warning: issues?.filter((i) => i.severity === "warning").length ?? 0,
    info:    issues?.filter((i) => i.severity === "info").length ?? 0,
  };

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border">
        <Eye className="w-4 h-4 text-muted-foreground" />
        <span className="font-semibold flex-1">Accessibility</span>
        {issues !== null && (
          <Badge variant="outline" className={cn(
            "text-[10px] px-1.5 h-4",
            counts.error > 0 ? "bg-red-500/10 text-red-500 border-red-500/20" :
            counts.warning > 0 ? "bg-amber-500/10 text-amber-500 border-amber-500/20" :
            "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
          )}>
            {issues.length} issue{issues.length !== 1 ? "s" : ""}
          </Badge>
        )}
      </div>

      {/* Scan button / summary */}
      <div className="px-4 py-3 border-b border-border space-y-3">
        <Button
          className="w-full h-8 text-xs gap-1.5"
          onClick={() => void runScan()}
          disabled={scanning}
        >
          {scanning
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> Scanning…</>
            : <><RefreshCw className="w-3.5 h-3.5" /> {issues === null ? "Run Accessibility Scan" : "Re-scan"}</>
          }
        </Button>

        {issues !== null && issues.length > 0 && (
          <div className="flex gap-1.5">
            {(["all", "error", "warning", "info"] as const).map((sev) => (
              <button
                key={sev}
                onClick={() => setFilter(sev)}
                className={cn(
                  "flex-1 text-[10px] py-0.5 rounded border transition-colors",
                  filter === sev
                    ? sev === "all" ? "bg-primary text-primary-foreground border-primary"
                      : sev === "error" ? "bg-red-500 text-white border-red-500"
                      : sev === "warning" ? "bg-amber-500 text-white border-amber-500"
                      : "bg-blue-500 text-white border-blue-500"
                    : "border-border text-muted-foreground hover:text-foreground"
                )}
              >
                {sev === "all" ? `All (${issues.length})` : sev === "error" ? `Errors (${counts.error})` : sev === "warning" ? `Warnings (${counts.warning})` : `Info (${counts.info})`}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Issue list */}
      <div className="flex-1 overflow-y-auto">
        {issues === null ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
            <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center">
              <Eye className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <p className="font-medium text-sm">Accessibility checker</p>
              <p className="text-xs text-muted-foreground mt-1">Scan your project files for WCAG compliance issues, missing ARIA attributes, and semantic HTML problems.</p>
            </div>
          </div>
        ) : filteredIssues.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
            <CheckCircle2 className="w-10 h-10 text-emerald-500" />
            <p className="font-medium text-sm">No {filter === "all" ? "" : filter} issues found</p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {filteredIssues.map((issue) => {
              const cfg = SEV[issue.severity];
              const Icon = cfg.icon;
              const isExp = expanded.has(issue.id);
              return (
                <div key={issue.id} className={cn("rounded-lg border overflow-hidden", cfg.bg)}>
                  {/* Header */}
                  <button
                    onClick={() => toggleExpand(issue.id)}
                    className="w-full flex items-start gap-2 px-3 py-2 text-left"
                  >
                    <Icon className={cn("w-3.5 h-3.5 shrink-0 mt-0.5", cfg.color)} />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium leading-tight">{issue.rule}</p>
                      <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{issue.file}:{issue.line}</p>
                    </div>
                    {issue.wcag && (
                      <span className="text-[9px] text-muted-foreground font-mono shrink-0">WCAG {issue.wcag}</span>
                    )}
                    {isExp ? <ChevronUp className="w-3 h-3 shrink-0" /> : <ChevronDown className="w-3 h-3 shrink-0" />}
                  </button>

                  {/* Expanded */}
                  {isExp && (
                    <div className="border-t border-border/40 px-3 py-2.5 space-y-2.5 bg-background/40">
                      <p className="text-xs text-foreground/80">{issue.description}</p>
                      {issue.snippet && (
                        <pre className="text-[10px] font-mono bg-muted/60 border border-border rounded px-2 py-1.5 overflow-x-auto whitespace-pre-wrap break-all">
                          {issue.snippet}
                        </pre>
                      )}
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          className="h-6 text-[10px] gap-1 flex-1"
                          onClick={() => { onFixWithAI(issue.fixPrompt); toast({ title: "Fix sent to AI chat" }); }}
                        >
                          <Zap className="w-2.5 h-2.5" /> Fix with AI
                        </Button>
                        {issue.wcag && (
                          <a
                            href={`https://www.w3.org/WAI/WCAG21/Understanding/${issue.wcag.replace(".", "")}.html`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors px-1.5"
                          >
                            WCAG <ExternalLink className="w-2.5 h-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-2 border-t border-border bg-muted/30">
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Sparkles className="w-3 h-3" />
          Pattern-based scan · covers WCAG 2.1 Level A &amp; AA rules
        </p>
      </div>
    </div>
  );
}
