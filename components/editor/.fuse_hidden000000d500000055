"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Shield, ShieldAlert, ShieldCheck, Loader2,
  AlertTriangle, XCircle, Info, ChevronDown, ChevronRight,
  Wand2, Eye, EyeOff,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { Project, ProjectFile } from "@/types/database";
import { staticScan, type SecurityFinding } from "@/lib/security/static-scan";

interface SecurityPanelProps {
  project: Project;
  files: ProjectFile[];
  onFilesUpdate: (files: ProjectFile[]) => void;
}

const SEVERITY_CONFIG = {
  critical: { color: "text-red-400", bg: "bg-red-500/10 border-red-500/30", icon: XCircle, label: "Critical" },
  high:     { color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/30", icon: AlertTriangle, label: "High" },
  medium:   { color: "text-amber-400", bg: "bg-amber-500/10 border-amber-500/30", icon: AlertTriangle, label: "Medium" },
  low:      { color: "text-blue-400", bg: "bg-blue-500/10 border-blue-500/30", icon: Info, label: "Low" },
  info:     { color: "text-slate-400", bg: "bg-slate-500/10 border-slate-500/30", icon: Info, label: "Info" },
};

// staticScan was originally defined here. It now lives in lib/security/static-scan.ts
// so the editor top bar can compute a security-issue count for the publish dropdown
// badge without duplicating logic. The function below is dead code and should be
// removed in a follow-up; kept temporarily because removing the entire body in a
// single edit pass is error-prone. The active implementation is the imported one.
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function _removed_staticScan(files: ProjectFile[]): SecurityFinding[] {
  const findings: SecurityFinding[] = [];

  const PATTERNS: { pattern: RegExp; severity: SecurityFinding["severity"]; title: string; description: string; fix: string }[] = [
    {
      pattern: /sk-[a-zA-Z0-9]{20,}/,
      severity: "critical",
      title: "Exposed OpenAI API Key",
      description: "An OpenAI API key was found in your source code. Anyone who sees this code can use your API key.",
      fix: "Move this key to .env.local and use process.env.OPENAI_API_KEY instead.",
    },
    {
      pattern: /sk-ant-[a-zA-Z0-9\-_]{20,}/,
      severity: "critical",
      title: "Exposed Anthropic API Key",
      description: "An Anthropic API key was found in source code.",
      fix: "Move to .env.local and use process.env.ANTHROPIC_API_KEY.",
    },
    {
      pattern: /pk_live_[a-zA-Z0-9]{20,}/,
      severity: "critical",
      title: "Exposed Stripe Live Publishable Key",
      description: "A live Stripe publishable key is hardcoded. While publishable keys have limited scope, they should still be in environment variables.",
      fix: "Use process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY.",
    },
    {
      pattern: /sk_live_[a-zA-Z0-9]{20,}/,
      severity: "critical",
      title: "Exposed Stripe Live Secret Key",
      description: "A live Stripe secret key is hardcoded. This gives full access to your Stripe account.",
      fix: "Move immediately to .env.local as STRIPE_SECRET_KEY and never commit this file.",
    },
    {
      pattern: /password\s*=\s*["'][^"']{4,}["']/i,
      severity: "high",
      title: "Hardcoded Password",
      description: "A password appears to be hardcoded in source code.",
      fix: "Use environment variables or a secrets manager.",
    },
    {
      pattern: /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html/,
      severity: "high",
      title: "XSS Risk: dangerouslySetInnerHTML",
      description: "Using dangerouslySetInnerHTML with unvalidated content can lead to Cross-Site Scripting attacks.",
      fix: "Sanitize HTML with DOMPurify before using dangerouslySetInnerHTML, or use a safer alternative.",
    },
    {
      pattern: /eval\s*\(/,
      severity: "high",
      title: "Dangerous: eval() usage",
      description: "eval() executes arbitrary code and is a major security risk if user input reaches it.",
      fix: "Avoid eval(). Use JSON.parse() for data parsing, or refactor the logic.",
    },
    {
      pattern: /localStorage\.setItem.*token|localStorage\.setItem.*password|sessionStorage\.setItem.*token/i,
      severity: "medium",
      title: "Sensitive Data in localStorage",
      description: "Tokens or passwords stored in localStorage are accessible via XSS attacks.",
      fix: "Use httpOnly cookies for sensitive tokens instead of localStorage.",
    },
    {
      pattern: /console\.(log|warn|error)\s*\(.*?(password|token|secret|key)/i,
      severity: "medium",
      title: "Sensitive Data Logged to Console",
      description: "Passwords, tokens, or keys appear to be logged to the console.",
      fix: "Remove console logs that include sensitive data before deploying.",
    },
    {
      pattern: /\.env[^.]/,
      severity: "medium",
      title: "Possible .env File Reference",
      description: "Source code appears to directly reference a .env file path.",
      fix: "Use process.env.VARIABLE_NAME instead of reading .env files directly in code.",
    },
    {
      pattern: /no-cors/i,
      severity: "low",
      title: "CORS Mode: no-cors",
      description: "Using fetch with mode:'no-cors' hides response details and can mask errors.",
      fix: "Configure proper CORS headers on your API instead of using no-cors mode.",
    },
    {
      pattern: /http:\/\/(?!localhost|127\.0\.0\.1)/,
      severity: "low",
      title: "Insecure HTTP URL",
      description: "Non-localhost HTTP URLs were found. Production traffic should use HTTPS.",
      fix: "Replace http:// with https:// for all production API endpoints.",
    },
  ];

  for (const file of files) {
    const lines = file.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      for (const { pattern, severity, title, description, fix } of PATTERNS) {
        if (pattern.test(line)) {
          const existing = findings.find(f => f.title === title && f.file === file.path);
          if (!existing) {
            findings.push({
              severity,
              title,
              description,
              file: file.path,
              line: i + 1,
              snippet: line.trim().slice(0, 120),
              fix,
            });
          }
        }
      }
    }
  }

  return findings.sort((a, b) => {
    const order = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    return order[a.severity] - order[b.severity];
  });
}

export function SecurityPanel({ project, files, onFilesUpdate }: SecurityPanelProps) {
  const [findings, setFindings] = useState<SecurityFinding[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showSnippets, setShowSnippets] = useState(false);
  const { toast } = useToast();

  async function runScan() {
    setScanning(true);
    setFindings(null);
    // Small artificial delay to feel responsive
    await new Promise(r => setTimeout(r, 600));
    const results = staticScan(files);
    setFindings(results);
    setScanning(false);
  }

  async function aiFixFinding(finding: SecurityFinding) {
    setFixing(finding.title);
    try {
      const affectedFiles = files.filter(f => f.path === finding.file);
      const res = await fetch("/api/ai/fix", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: project.id,
          error: `Security issue: ${finding.title}\n${finding.description}\nFix: ${finding.fix}\nIn file: ${finding.file} line ${finding.line ?? "unknown"}`,
          files: affectedFiles.map(f => ({ path: f.path, content: f.content })),
        }),
      });
      const data = await res.json();
      if (data.files?.length) {
        onFilesUpdate(data.files);
        toast({ title: "Fix applied", description: `${finding.title} has been addressed.` });
        // Re-scan
        await runScan();
      }
    } catch {
      toast({ title: "Auto-fix failed", description: "Please fix manually.", variant: "destructive" });
    } finally {
      setFixing(null);
    }
  }

  const counts = findings
    ? {
        critical: findings.filter(f => f.severity === "critical").length,
        high: findings.filter(f => f.severity === "high").length,
        medium: findings.filter(f => f.severity === "medium").length,
        low: findings.filter(f => f.severity === "low").length,
      }
    : null;

  const score = findings
    ? Math.max(0, 100 - (counts!.critical * 30 + counts!.high * 15 + counts!.medium * 5 + counts!.low * 2))
    : null;

  return (
    <div className="flex flex-col h-full bg-[#0a0a0f]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <div className="flex items-center gap-2">
          <Shield className="w-4 h-4 text-slate-400" />
          <span className="text-sm font-semibold text-white">Security Scan</span>
        </div>
        <p className="text-xs text-slate-500 mt-0.5">Detect exposed keys, XSS risks, and security misconfigurations.</p>
      </div>

      {/* Scan button */}
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <Button
          onClick={runScan}
          disabled={scanning}
          className="w-full h-8 text-xs bg-violet-600 hover:bg-violet-500 text-white"
        >
          {scanning ? (
            <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> Scanning {files.length} files…</>
          ) : (
            <><Shield className="w-3 h-3 mr-1.5" /> Run Security Scan</>
          )}
        </Button>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto">
        {!findings && !scanning && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
            <div className="w-12 h-12 rounded-full bg-white/[0.04] border border-white/[0.08] flex items-center justify-center">
              <ShieldCheck className="w-6 h-6 text-slate-500" />
            </div>
            <p className="text-sm text-slate-500">Run a scan to check your project for security issues.</p>
            <p className="text-xs text-slate-600">Checks for exposed API keys, XSS, hardcoded secrets, and more.</p>
          </div>
        )}

        {findings && (
          <div className="p-4 space-y-4">
            {/* Score */}
            <div className={`p-4 rounded-xl border ${
              score! >= 90 ? "bg-emerald-500/[0.08] border-emerald-500/30" :
              score! >= 70 ? "bg-amber-500/[0.08] border-amber-500/30" :
              "bg-red-500/[0.08] border-red-500/30"
            }`}>
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-2xl font-bold text-white">{score}/100</div>
                  <div className="text-xs text-slate-400 mt-0.5">Security Score</div>
                </div>
                {score! >= 90 ? (
                  <ShieldCheck className="w-8 h-8 text-emerald-400" />
                ) : score! >= 70 ? (
                  <Shield className="w-8 h-8 text-amber-400" />
                ) : (
                  <ShieldAlert className="w-8 h-8 text-red-400" />
                )}
              </div>
              {counts && (
                <div className="flex gap-3 mt-3">
                  {counts.critical > 0 && <span className="text-xs text-red-400 font-semibold">{counts.critical} critical</span>}
                  {counts.high > 0 && <span className="text-xs text-orange-400 font-semibold">{counts.high} high</span>}
                  {counts.medium > 0 && <span className="text-xs text-amber-400">{counts.medium} medium</span>}
                  {counts.low > 0 && <span className="text-xs text-blue-400">{counts.low} low</span>}
                  {findings.length === 0 && <span className="text-xs text-emerald-400 font-semibold">No issues found!</span>}
                </div>
              )}
            </div>

            {/* Show snippets toggle */}
            {findings.length > 0 && (
              <button
                onClick={() => setShowSnippets(!showSnippets)}
                className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-300"
              >
                {showSnippets ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                {showSnippets ? "Hide" : "Show"} code snippets
              </button>
            )}

            {/* Finding cards */}
            <div className="space-y-2">
              {findings.map((finding, i) => {
                const cfg = SEVERITY_CONFIG[finding.severity];
                const Icon = cfg.icon;
                const isExpanded = expanded === `${i}`;

                return (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                    className={`rounded-xl border ${cfg.bg} overflow-hidden`}
                  >
                    <button
                      onClick={() => setExpanded(isExpanded ? null : `${i}`)}
                      className="w-full flex items-start gap-3 p-3 text-left"
                    >
                      <Icon className={`w-4 h-4 mt-0.5 flex-shrink-0 ${cfg.color}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium text-white">{finding.title}</span>
                          <span className={`text-[10px] font-bold uppercase px-1.5 py-0.5 rounded ${cfg.color} bg-black/20`}>
                            {cfg.label}
                          </span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 truncate">{finding.file}{finding.line ? `:${finding.line}` : ""}</div>
                      </div>
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-slate-500 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />}
                    </button>

                    <AnimatePresence>
                      {isExpanded && (
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: "auto" }}
                          exit={{ height: 0 }}
                          className="overflow-hidden border-t border-white/[0.06]"
                        >
                          <div className="p-3 space-y-3">
                            <p className="text-xs text-slate-400 leading-relaxed">{finding.description}</p>
                            {showSnippets && finding.snippet && (
                              <pre className="text-xs font-mono bg-black/30 rounded-lg p-2 text-slate-300 overflow-x-auto whitespace-pre-wrap break-all">
                                {finding.snippet}
                              </pre>
                            )}
                            <div className="p-2.5 rounded-lg bg-black/20 border border-white/[0.04]">
                              <p className="text-xs text-emerald-400 font-medium mb-1">💡 Fix</p>
                              <p className="text-xs text-slate-400 leading-relaxed">{finding.fix}</p>
                            </div>
                            {finding.severity !== "info" && (
                              <Button
                                size="sm"
                                onClick={() => aiFixFinding(finding)}
                                disabled={!!fixing}
                                className="h-7 text-xs bg-violet-600 hover:bg-violet-500 text-white"
                              >
                                {fixing === finding.title ? (
                                  <><Loader2 className="w-3 h-3 mr-1.5 animate-spin" />Fixing…</>
                                ) : (
                                  <><Wand2 className="w-3 h-3 mr-1.5" />Auto-Fix with AI</>
                                )}
                              </Button>
                            )}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </motion.div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
