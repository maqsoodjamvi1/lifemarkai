
import { useState } from "react";
import { motion,AnimatePresence } from "framer-motion";
import {
Shield,ShieldAlert,ShieldCheck,Loader2,
AlertTriangle,XCircle,Info,ChevronDown,ChevronRight,
Wand2,Eye,EyeOff,ExternalLink,KeyRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { Project,ProjectFile } from "@/types/database";
import { staticScan,type SecurityFinding } from "@/lib/security/static-scan";

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

export function SecurityPanel({ project, files, onFilesUpdate }: SecurityPanelProps) {
  const [findings, setFindings] = useState<SecurityFinding[] | null>(null);
  const [scanning, setScanning] = useState(false);
  const [fixing, setFixing] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showSnippets, setShowSnippets] = useState(false);
  // Dependency/CVE check status, separate from the static scan's `findings`:
  // "unknown" (haven't run it yet), "checking", "unavailable" (feed
  // unreachable — must never render the same as "clean", those are different
  // claims), or "ok" once it's actually run. See /api/security/dependencies
  // (cve-feed.ts) — the static scan alone never looked at what's actually
  // installed, so a project pinned to a package with a known critical
  // vulnerability could show a clean 100/100 score.
  const [depStatus, setDepStatus] = useState<"unknown" | "checking" | "unavailable" | "ok">("unknown");
  const [depSummary, setDepSummary] = useState<string | null>(null);
  const { toast } = useToast();

  async function runScan() {
    setScanning(true);
    setFindings(null);
    setDepStatus("unknown");
    setDepSummary(null);
    // Small artificial delay to feel responsive
    await new Promise(r => setTimeout(r, 600));
    const results = staticScan(files);
    setFindings(results);
    setScanning(false);

    // Dependency/CVE audit runs separately and asynchronously after the
    // (instant, offline) static scan — a slow or unreachable OSV.dev feed
    // degrades to "static findings only, dependency check unavailable"
    // rather than blocking the panel, and a network failure is shown
    // honestly rather than silently reported as a clean score.
    setDepStatus("checking");
    try {
      const res = await fetch(`/api/security/dependencies?projectId=${project.id}`);
      if (!res.ok) throw new Error(`Dependency check failed (${res.status})`);
      const data = (await res.json()) as {
        cve: { available: boolean; findings: Array<{
          severity: SecurityFinding["severity"];
          title: string;
          recommendation?: string;
          file: string;
          line?: number;
          snippet?: string;
        }>; error?: string | null };
        summary: string;
      };
      setDepSummary(data.summary);
      if (!data.cve.available) {
        setDepStatus("unavailable");
        return;
      }
      setDepStatus("ok");
      if (data.cve.findings.length > 0) {
        setFindings((prev) => [
          ...(prev ?? []),
          ...data.cve.findings.map((f) => ({
            severity: f.severity,
            title: f.title,
            description: f.recommendation ?? "",
            file: f.file,
            line: f.line,
            snippet: f.snippet,
          })),
        ]);
      }
    } catch {
      setDepStatus("unavailable");
      setDepSummary("Could not reach the vulnerability feed — advisory results are unknown, not clear.");
    }
  }

  async function aiFixFinding(finding: SecurityFinding, findingKey: string) {
    setFixing(findingKey);
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
      if (!res.ok) {
        // Previously unchecked: a non-200 response (429/500, or a JSON error
        // body with no `files`) just fell through this if-branch with no
        // feedback at all — the button stopped spinning and the user had no
        // way to tell the fix hadn't actually happened.
        toast({ title: "Auto-fix failed", description: data.error ?? "Please fix manually.", variant: "destructive" });
        return;
      }
      if (data.files?.length) {
        onFilesUpdate(data.files);
        toast({ title: "Fix applied", description: `${finding.title} has been addressed.` });
        // Re-scan
        await runScan();
      } else {
        toast({ title: "No fix produced", description: "The AI didn't return a change. Please fix manually.", variant: "destructive" });
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

            {/* Dependency/CVE check status — distinct from the score above,
                since "no advisories found" and "could not check" are
                different claims and must never render the same way. */}
            {depStatus === "checking" && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500">
                <Loader2 className="w-3 h-3 animate-spin" /> Checking dependencies for known vulnerabilities…
              </div>
            )}
            {depStatus === "unavailable" && (
              <div className="flex items-center gap-1.5 text-xs text-amber-400">
                <AlertTriangle className="w-3 h-3 shrink-0" />
                {depSummary ?? "Dependency check unavailable — static findings only."}
              </div>
            )}
            {depStatus === "ok" && depSummary && (
              <div className="text-xs text-slate-500">{depSummary}</div>
            )}

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
                              <pre className="text-xs font-mono bg-black/30 rounded-lg p-2 text-slate-700 dark:text-slate-300 overflow-x-auto whitespace-pre-wrap break-all">
                                {finding.snippet}
                              </pre>
                            )}
                            <div className="p-2.5 rounded-lg bg-black/20 border border-white/[0.04]">
                              <p className="text-xs text-emerald-400 font-medium mb-1">💡 Fix</p>
                              <p className="text-xs text-slate-400 leading-relaxed">{finding.fix}</p>
                            </div>
                            {/* Leaked credential: the only useful first action
                                is revoking it at the provider. Auto-Fix below
                                edits the code, which does NOT make an exposed
                                key safe — it stays valid until revoked. */}
                            {finding.revokeUrl && (
                              <a
                                href={finding.revokeUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 p-2.5 rounded-lg bg-red-500/10 border border-red-500/25 hover:bg-red-500/15 transition-colors group"
                              >
                                <KeyRound className="w-3.5 h-3.5 text-red-400 shrink-0" />
                                <span className="text-xs text-red-300 font-medium flex-1">
                                  Revoke this key at the provider first
                                </span>
                                <ExternalLink className="w-3 h-3 text-red-400/70 group-hover:text-red-300 shrink-0" />
                              </a>
                            )}
                            {finding.severity !== "info" && (
                              <Button
                                size="sm"
                                onClick={() => aiFixFinding(finding, `${i}`)}
                                disabled={!!fixing}
                                className="h-7 text-xs bg-violet-600 hover:bg-violet-500 text-white"
                              >
                                {fixing === `${i}` ? (
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
