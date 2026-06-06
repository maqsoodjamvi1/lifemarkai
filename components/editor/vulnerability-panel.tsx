"use client";

/**
 * VulnerabilityPanel
 * Parses package.json from project files, fetches CVE data from OSV.dev API,
 * and lists vulnerable packages with severity, CVE IDs, and "Fix with AI" buttons.
 */

import { useState, useEffect, useMemo } from "react";
import {
  Shield, ShieldAlert, ShieldCheck, RefreshCw, Loader2,
  ChevronDown, ChevronRight, ExternalLink, Wand2, AlertTriangle,
  XCircle, Info, CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ProjectFile } from "@/types/database";

// ─── Types ────────────────────────────────────────────────────────────────────

type Severity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW" | "UNKNOWN";

interface Vulnerability {
  id: string;           // CVE or GHSA ID
  summary: string;
  severity: Severity;
  fixedIn?: string;
  aliases: string[];
  referenceUrl?: string;
}

interface VulnerablePackage {
  name: string;
  version: string;
  vulns: Vulnerability[];
  isDev: boolean;
}

interface OsvVuln {
  id: string;
  summary?: string;
  aliases?: string[];
  database_specific?: { severity?: string };
  severity?: Array<{ type: string; score: string }>;
  affected?: Array<{
    ranges?: Array<{ events?: Array<{ fixed?: string }> }>;
  }>;
  references?: Array<{ url: string }>;
}

interface OsvResponse {
  vulns?: OsvVuln[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseSeverity(vuln: OsvVuln): Severity {
  const s = (vuln.database_specific?.severity ?? "").toUpperCase();
  if (["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(s)) return s as Severity;
  // Try CVSS score
  const cvss = vuln.severity?.find((sv) => sv.type === "CVSS_V3")?.score ?? "";
  const match = cvss.match(/CVSS:3\.\d\/.*\/(\d+\.\d)/);
  if (match) {
    const score = parseFloat(match[1]);
    if (score >= 9) return "CRITICAL";
    if (score >= 7) return "HIGH";
    if (score >= 4) return "MEDIUM";
    return "LOW";
  }
  return "UNKNOWN";
}

function parseFixedIn(vuln: OsvVuln): string | undefined {
  for (const aff of vuln.affected ?? []) {
    for (const range of aff.ranges ?? []) {
      for (const evt of range.events ?? []) {
        if (evt.fixed) return evt.fixed;
      }
    }
  }
  return undefined;
}

const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3, UNKNOWN: 4,
};

function SeverityBadge({ severity }: { severity: Severity }) {
  const cls = {
    CRITICAL: "bg-red-500/20 text-red-400 border-red-500/30",
    HIGH:     "bg-orange-500/20 text-orange-400 border-orange-500/30",
    MEDIUM:   "bg-amber-500/20 text-amber-400 border-amber-500/30",
    LOW:      "bg-sky-500/20 text-sky-400 border-sky-500/30",
    UNKNOWN:  "bg-muted/40 text-muted-foreground border-border",
  }[severity];
  return (
    <Badge variant="outline" className={`text-[9px] h-4 px-1.5 font-bold ${cls}`}>
      {severity}
    </Badge>
  );
}

function SeverityIcon({ severity }: { severity: Severity }) {
  if (severity === "CRITICAL" || severity === "HIGH")
    return <XCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />;
  if (severity === "MEDIUM")
    return <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0" />;
  if (severity === "LOW")
    return <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />;
  return <Info className="w-3.5 h-3.5 text-muted-foreground shrink-0" />;
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface VulnerabilityPanelProps {
  files: ProjectFile[];
  onFixWithAI: (prompt: string) => void;
}

export function VulnerabilityPanel({ files, onFixWithAI }: VulnerabilityPanelProps) {
  const [activeTab, setActiveTab] = useState<"sca" | "sast" | "aikido" | "wiz">("sca");
  const [results, setResults] = useState<VulnerablePackage[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanned, setScanned] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedPkg, setExpandedPkg] = useState<string | null>(null);
  const [severityFilter, setSeverityFilter] = useState<Severity | "ALL">("ALL");
  // SAST state
  const [sastResults, setSastResults] = useState<Array<{
    file: string; line: number; rule: string; severity: "CRITICAL"|"HIGH"|"MEDIUM"|"LOW"; message: string; snippet: string;
  }>>([]);
  const [sastScanned, setSastScanned] = useState(false);
  // Aikido state
  const [aikidoApiKey, setAikidoApiKey]       = useState("");
  const [aikidoRepoUrl, setAikidoRepoUrl]     = useState("");
  const [aikidoLoading, setAikidoLoading]     = useState(false);
  const [aikidoScanned, setAikidoScanned]     = useState(false);
  const [aikidoError, setAikidoError]         = useState<string | null>(null);
  const [aikidoFindings, setAikidoFindings]   = useState<Array<{
    id: string; title: string; severity: "CRITICAL"|"HIGH"|"MEDIUM"|"LOW"|"INFO";
    category: string; description: string; remediation?: string; link?: string;
  }>>([]);
  // Wiz state — parallel to Aikido, hits the LifemarkAI dispatcher route which
  // proxies through to Wiz so credentials live in env vars, not in the browser.
  const [wizLoading, setWizLoading] = useState(false);
  const [wizScanned, setWizScanned] = useState(false);
  const [wizError, setWizError] = useState<string | null>(null);
  const [wizConfigGuide, setWizConfigGuide] = useState<null | {
    step1: string; step2: string; step3: string; docs?: string;
  }>(null);
  const [wizFindings, setWizFindings] = useState<Array<{
    id: string; title: string; severity: string; description?: string;
  }>>([]);

  async function runWizScan() {
    setWizLoading(true);
    setWizError(null);
    setWizConfigGuide(null);
    setWizFindings([]);
    try {
      const res = await fetch("/api/security/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: "current", vendor: "wiz" }),
      });
      const data = await res.json();
      if (res.status === 501 && data.guide) {
        // Vendor not configured — surface the setup guide.
        setWizConfigGuide(data.guide);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? `Wiz returned ${res.status}`);
      setWizFindings(data.findings ?? []);
      setWizScanned(true);
    } catch (e) {
      setWizError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setWizLoading(false);
    }
  }

  async function runAikidoScan() {
    if (!aikidoApiKey.trim()) { setAikidoError("Enter your Aikido API key first."); return; }
    setAikidoLoading(true); setAikidoError(null); setAikidoFindings([]);
    try {
      // Aikido Security API — trigger a scan and poll for results
      // Docs: https://app.aikido.dev/settings/integrations/api
      const triggerRes = await fetch("https://app.aikido.dev/api/public/v1/scans", {
        method: "POST",
        headers: { "X-AIK-API-SECRET": aikidoApiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          repository_url: aikidoRepoUrl || undefined,
          scan_types: ["sca", "sast", "secrets", "iac"],
        }),
      });
      if (!triggerRes.ok) {
        const msg = await triggerRes.text();
        throw new Error(`Aikido API error ${triggerRes.status}: ${msg.slice(0, 120)}`);
      }
      const { scan_id } = await triggerRes.json() as { scan_id: string };

      // Poll for results (max 30 s)
      let findings: typeof aikidoFindings = [];
      for (let i = 0; i < 10; i++) {
        await new Promise((r) => setTimeout(r, 3000));
        const pollRes = await fetch(`https://app.aikido.dev/api/public/v1/scans/${scan_id}`, {
          headers: { "X-AIK-API-SECRET": aikidoApiKey },
        });
        if (!pollRes.ok) continue;
        const data = await pollRes.json() as { status: string; issues?: typeof findings };
        if (data.status === "completed" || data.status === "failed") {
          findings = data.issues ?? [];
          break;
        }
      }
      setAikidoFindings(findings);
      setAikidoScanned(true);
    } catch (e) {
      setAikidoError(e instanceof Error ? e.message : "Scan failed");
    } finally {
      setAikidoLoading(false);
    }
  }

  // Parse package.json from project files
  const packageJson = useMemo(() => {
    const pkgFile = files.find((f) => f.path === "package.json" || f.path.endsWith("/package.json"));
    if (!pkgFile?.content) return null;
    try { return JSON.parse(pkgFile.content) as { dependencies?: Record<string, string>; devDependencies?: Record<string, string> }; }
    catch { return null; }
  }, [files]);

  const allDeps = useMemo(() => {
    if (!packageJson) return [];
    const deps = Object.entries(packageJson.dependencies ?? {}).map(([name, version]) => ({ name, version: version.replace(/[\^~>=<]/g, ""), isDev: false }));
    const devDeps = Object.entries(packageJson.devDependencies ?? {}).map(([name, version]) => ({ name, version: version.replace(/[\^~>=<]/g, ""), isDev: true }));
    return [...deps, ...devDeps];
  }, [packageJson]);

  async function runScan() {
    if (allDeps.length === 0) return;
    setLoading(true);
    setError(null);
    setResults([]);
    setScanned(false);

    try {
      // OSV.dev batch query (free, no auth)
      const queries = allDeps.slice(0, 50).map((dep) => ({
        package: { name: dep.name, ecosystem: "npm" },
        version: dep.version,
      }));

      const res = await fetch("https://api.osv.dev/v1/querybatch", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ queries }),
      });

      if (!res.ok) throw new Error("OSV API error");
      const data = await res.json() as { results: OsvResponse[] };

      const vulnerable: VulnerablePackage[] = [];
      data.results.forEach((result, i) => {
        const dep = allDeps[i];
        if (!dep || !result.vulns?.length) return;
        const vulns: Vulnerability[] = result.vulns.map((v) => ({
          id: v.id,
          summary: v.summary ?? "No description available",
          severity: parseSeverity(v),
          fixedIn: parseFixedIn(v),
          aliases: v.aliases ?? [],
          referenceUrl: v.references?.[0]?.url,
        })).sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

        vulnerable.push({ ...dep, vulns });
      });

      // Sort: most severe first
      vulnerable.sort((a, b) => {
        const aMin = Math.min(...a.vulns.map((v) => SEVERITY_ORDER[v.severity]));
        const bMin = Math.min(...b.vulns.map((v) => SEVERITY_ORDER[v.severity]));
        return aMin - bMin;
      });

      setResults(vulnerable);
    } catch (e) {
      setError("Failed to reach OSV.dev API. Check your connection.");
    } finally {
      setLoading(false);
      setScanned(true);
    }
  }

  const filtered = useMemo(() => {
    if (severityFilter === "ALL") return results;
    return results.filter((pkg) => pkg.vulns.some((v) => v.severity === severityFilter));
  }, [results, severityFilter]);

  const counts = useMemo(() => {
    const c: Record<Severity, number> = { CRITICAL: 0, HIGH: 0, MEDIUM: 0, LOW: 0, UNKNOWN: 0 };
    for (const pkg of results) {
      for (const v of pkg.vulns) c[v.severity]++;
    }
    return c;
  }, [results]);

  const totalVulns = results.reduce((s, p) => s + p.vulns.length, 0);

  function buildFixPrompt(pkg: VulnerablePackage): string {
    const fixVersions = [...new Set(pkg.vulns.map((v) => v.fixedIn).filter(Boolean))];
    const targetVersion = fixVersions[0] ?? "latest";
    const cveIds = pkg.vulns.map((v) => v.id).join(", ");
    return `Upgrade the npm package "${pkg.name}" from version "${pkg.version}" to "${targetVersion}" to fix the following vulnerabilities: ${cveIds}. Update package.json and run npm install. Make sure no breaking changes are introduced — check the changelog if needed.`;
  }


  // ── SAST: static code analysis rules ──────────────────────────────────────
  function runSast() {
    const issues: typeof sastResults = [];

    const RULES = [
      { id: "hardcoded-secret",   severity: "CRITICAL" as const, pattern: /(?:api[_-]?key|secret|password|token|auth)\s*[:=]\s*["'][A-Za-z0-9_\-]{16,}["']/gi, message: "Possible hardcoded secret or credential" },
      { id: "sql-injection",      severity: "HIGH"     as const, pattern: /`SELECT.+\$\{|query\s*\(\s*["'`]SELECT.+\+\s*(?:req|params|body|query)/gi, message: "Possible SQL injection — use parameterised queries" },
      { id: "xss-dangeroushtml",  severity: "HIGH"     as const, pattern: /dangerouslySetInnerHTML/g, message: "dangerouslySetInnerHTML can introduce XSS vulnerabilities" },
      { id: "eval-usage",         severity: "HIGH"     as const, pattern: /eval\s*\(/g, message: "eval() executes arbitrary code — use safer alternatives" },
      { id: "insecure-http",      severity: "MEDIUM"   as const, pattern: /fetch\(['"]http:\/\//g, message: "Insecure HTTP fetch — use HTTPS in production" },
      { id: "console-log-secret", severity: "MEDIUM"   as const, pattern: /console\.log\(.*(?:password|secret|token|key)/gi, message: "Possible secret logged to console" },
      { id: "env-in-client",      severity: "MEDIUM"   as const, pattern: /process\.env\.(?!NEXT_PUBLIC_)[A-Z_]+/g, message: "Server-only env var may be exposed in client bundle — use NEXT_PUBLIC_ prefix or move to server" },
      { id: "http-redirect",      severity: "LOW"      as const, pattern: /redirect\(['"]http:\/\//g, message: "Redirecting to plain HTTP URL" },
      { id: "cors-wildcard",      severity: "MEDIUM"   as const, pattern: /['"]Access-Control-Allow-Origin['"],?\s*['"]\*/g, message: "Wildcard CORS — restrict to specific origins in production" },
      { id: "no-rate-limit",      severity: "LOW"      as const, pattern: /export\s+async\s+function\s+(?:POST|PUT|DELETE|PATCH)\s*\((?!.*rateLimit)/g, message: "API route missing rate limiting" },
    ];

    for (const file of files) {
      // Only scan source files
      if (!["typescript","javascript","tsx","jsx"].some((ext) => file.path.endsWith(`.${ext}`)) &&
          !file.path.endsWith(".ts") && !file.path.endsWith(".tsx") && !file.path.endsWith(".js") && !file.path.endsWith(".jsx")) continue;

      const lines = (file.content ?? "").split("\n");
      for (const rule of RULES) {
        rule.pattern.lastIndex = 0;
        let match: RegExpExecArray | null;
        const content = file.content ?? "";
        rule.pattern.lastIndex = 0;
        while ((match = rule.pattern.exec(content)) !== null) {
          const lineNum = content.slice(0, match.index).split("\n").length;
          const snippet = lines[lineNum - 1]?.trim().slice(0, 80) ?? "";
          issues.push({ file: file.path, line: lineNum, rule: rule.id, severity: rule.severity, message: rule.message, snippet });
          if (issues.length > 100) break; // cap
        }
      }
    }

    setSastResults(issues);
    setSastScanned(true);
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
        <span className="text-xs font-semibold flex-1">Vulnerability Scanner</span>
        {scanned && totalVulns > 0 && (
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-red-400 border-red-500/30">
            {totalVulns} found
          </Badge>
        )}
        {scanned && totalVulns === 0 && (
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 text-emerald-400 border-emerald-500/30">
            Clean
          </Badge>
        )}
      </div>

      {/* SCA / SAST / Aikido tabs */}
      <div className="flex border-b border-border shrink-0">
        {(["sca", "sast", "aikido", "wiz"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setActiveTab(t)}
            className={`flex-1 py-2 text-xs font-medium transition-colors border-b-2 ${
              activeTab === t ? "border-red-400 text-red-400" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "sca" ? "🔗 SCA" : t === "sast" ? "🔬 SAST" : t === "aikido" ? "🥷 Aikido" : "🛡️ Wiz"}
          </button>
        ))}
      </div>

      {activeTab === "sca" && (
      <ScrollArea className="flex-1">
        <div className="p-3 space-y-3">

          {/* Package info + scan button */}
          <div className="rounded-xl border border-border bg-muted/20 p-3 space-y-2">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold">
                  {allDeps.length > 0 ? `${allDeps.length} packages detected` : "No package.json found"}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {allDeps.length > 0
                    ? `${allDeps.filter((d) => !d.isDev).length} prod · ${allDeps.filter((d) => d.isDev).length} dev`
                    : "Add a package.json to scan dependencies"}
                </p>
              </div>
              <Button
                size="sm"
                className="h-7 text-xs gap-1.5"
                onClick={runScan}
                disabled={loading || allDeps.length === 0}
              >
                {loading
                  ? <Loader2 className="w-3 h-3 animate-spin" />
                  : <RefreshCw className="w-3 h-3" />}
                {scanned ? "Re-scan" : "Scan now"}
              </Button>
            </div>
            <p className="text-[9px] text-muted-foreground/60">
              Powered by <a href="https://osv.dev" target="_blank" rel="noreferrer" className="underline">OSV.dev</a> — free, no API key required
            </p>
          </div>

          {/* Error */}
          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
              <XCircle className="w-3.5 h-3.5 shrink-0" /> {error}
            </div>
          )}

          {/* Summary pills */}
          {scanned && (
            <div className="grid grid-cols-4 gap-1.5">
              {(["CRITICAL", "HIGH", "MEDIUM", "LOW"] as Severity[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSeverityFilter((prev) => prev === s ? "ALL" : s)}
                  className={`rounded-lg border p-2 text-center transition-all ${
                    severityFilter === s ? "border-primary bg-primary/10" : "border-border bg-muted/20 hover:bg-muted/40"
                  }`}
                >
                  <p className={`text-sm font-bold ${counts[s] > 0 ? ({
                    CRITICAL: "text-red-400",
                    HIGH: "text-orange-400",
                    MEDIUM: "text-amber-400",
                    LOW: "text-sky-400",
                    UNKNOWN: "text-slate-400",
                  } as Record<string, string>)[s] : "text-muted-foreground"}`}>{counts[s]}</p>
                  <p className="text-[8px] text-muted-foreground capitalize">{s.toLowerCase()}</p>
                </button>
              ))}
            </div>
          )}

          {/* Clean state */}
          {scanned && totalVulns === 0 && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-emerald-500/15 flex items-center justify-center">
                <ShieldCheck className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <p className="text-sm font-semibold">No vulnerabilities found</p>
                <p className="text-xs text-muted-foreground mt-1">All {allDeps.length} packages are clean.</p>
              </div>
            </div>
          )}

          {/* Vulnerable packages list */}
          {filtered.map((pkg) => {
            const worstSeverity = pkg.vulns[0]?.severity ?? "UNKNOWN";
            const isExpanded = expandedPkg === pkg.name;
            return (
              <div key={pkg.name} className="rounded-xl border border-border overflow-hidden">
                <button
                  className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted/20 transition-colors"
                  onClick={() => setExpandedPkg((p) => p === pkg.name ? null : pkg.name)}
                >
                  <SeverityIcon severity={worstSeverity} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="text-xs font-semibold font-mono">{pkg.name}</p>
                      <code className="text-[9px] text-muted-foreground bg-muted px-1 rounded">{pkg.version}</code>
                      {pkg.isDev && <Badge variant="outline" className="text-[8px] h-3.5 px-1">dev</Badge>}
                    </div>
                    <p className="text-[10px] text-muted-foreground">{pkg.vulns.length} vulnerabilit{pkg.vulns.length === 1 ? "y" : "ies"}</p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <SeverityBadge severity={worstSeverity} />
                    {isExpanded
                      ? <ChevronDown className="w-3 h-3 text-muted-foreground" />
                      : <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border divide-y divide-border/40">
                    {pkg.vulns.map((v) => (
                      <div key={v.id} className="px-3 py-2.5 space-y-1.5">
                        <div className="flex items-start gap-2">
                          <SeverityBadge severity={v.severity} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <p className="text-[10px] font-mono font-medium text-foreground">{v.id}</p>
                              {v.referenceUrl && (
                                <a href={v.referenceUrl} target="_blank" rel="noreferrer">
                                  <ExternalLink className="w-2.5 h-2.5 text-muted-foreground hover:text-foreground" />
                                </a>
                              )}
                            </div>
                            {v.aliases.filter((a) => a !== v.id).slice(0, 2).map((alias) => (
                              <span key={alias} className="text-[9px] text-muted-foreground/60 font-mono mr-1">{alias}</span>
                            ))}
                          </div>
                        </div>
                        <p className="text-[10px] text-muted-foreground leading-relaxed">{v.summary}</p>
                        {v.fixedIn && (
                          <p className="text-[9px] text-emerald-400">
                            ✓ Fixed in v{v.fixedIn}
                          </p>
                        )}
                      </div>
                    ))}
                    <div className="px-3 py-2.5">
                      <Button
                        size="sm"
                        className="w-full h-7 text-xs gap-1.5"
                        onClick={() => onFixWithAI(buildFixPrompt(pkg))}
                      >
                        <Wand2 className="w-3 h-3" />
                        Fix {pkg.name} with AI
                        {pkg.vulns[0]?.fixedIn && (
                          <span className="opacity-70 ml-1">→ v{pkg.vulns[0].fixedIn}</span>
                        )}
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}

          {/* Not-scanned empty state */}
          {!scanned && !loading && (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <div className="w-12 h-12 rounded-full bg-muted/40 flex items-center justify-center">
                <Shield className="w-6 h-6 text-muted-foreground/40" />
              </div>
              <div>
                <p className="text-sm font-medium">Scan your dependencies</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {allDeps.length > 0
                    ? `Click "Scan now" to check ${allDeps.length} packages for known CVEs.`
                    : "Add a package.json to your project to enable scanning."}
                </p>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      )}

      {/* SAST Panel */}
      {activeTab === "sast" && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="p-3 border-b border-border shrink-0 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs font-medium">Static Code Analysis</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Scans {files.filter(f => [".ts",".tsx",".js",".jsx"].some(e => f.path.endsWith(e))).length} source files for security issues</p>
            </div>
            <Button size="sm" className="h-7 text-xs gap-1.5" onClick={runSast}>
              {sastScanned ? "Re-scan" : "Run SAST"}
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {!sastScanned ? (
                <div className="text-center py-10 text-muted-foreground">
                  <p className="text-xs">Click "Run SAST" to scan for hardcoded secrets, SQL injection, XSS, eval usage, and more.</p>
                </div>
              ) : sastResults.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-sm text-emerald-400 font-medium">✓ No issues found</p>
                  <p className="text-xs text-muted-foreground mt-1">Your code passed all {10} static analysis rules.</p>
                </div>
              ) : (
                sastResults.map((issue, i) => (
                                    <div key={i} className="rounded-lg border border-border bg-card p-2.5 space-y-1.5">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${
                        issue.severity === "CRITICAL" ? "bg-red-500/20 text-red-400" :
                        issue.severity === "HIGH"     ? "bg-orange-500/20 text-orange-400" :
                        issue.severity === "MEDIUM"   ? "bg-yellow-500/20 text-yellow-400" :
                                                        "bg-blue-500/20 text-blue-400"
                      }`}>{issue.severity}</span>
                      <span className="text-xs font-medium flex-1 truncate">{issue.message}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground">{issue.file}:{issue.line}</p>
                    {issue.snippet && (
                      <code className="text-[10px] font-mono text-muted-foreground bg-muted/30 rounded px-1.5 py-1 block truncate">{issue.snippet}</code>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-5 text-[10px] px-2 gap-1 mt-1"
                      onClick={() => onFixWithAI(`Fix this security issue in ${issue.file} at line ${issue.line}: ${issue.message}. The problematic code is: ${issue.snippet}`)}
                    >
                      <Wand2 className="w-2.5 h-2.5" /> Fix with AI
                    </Button>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Aikido Panel — direct browser → Aikido public API. Key stays client-side
          per Aikido's docs; we never persist it. */}
      {activeTab === "aikido" && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="p-3 border-b border-border shrink-0 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-base">🥷</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">Aikido pen-testing</p>
                <p className="text-[10px] text-muted-foreground">
                  AI-driven exploitable-vulnerability scan. Sign up at{" "}
                  <a href="https://app.aikido.dev" target="_blank" rel="noreferrer" className="underline text-violet-300">
                    app.aikido.dev
                  </a>{" "}
                  → Settings → Integrations → API.
                </p>
              </div>
            </div>
            <input
              type="password"
              value={aikidoApiKey}
              onChange={(e) => setAikidoApiKey(e.target.value)}
              placeholder="Aikido API key (X-AIK-API-SECRET)"
              className="w-full h-8 px-2.5 rounded-lg border border-border bg-muted/30 text-xs focus:outline-none focus:ring-2 focus:ring-red-500/30"
            />
            <input
              value={aikidoRepoUrl}
              onChange={(e) => setAikidoRepoUrl(e.target.value)}
              placeholder="Repository URL (optional)"
              className="w-full h-8 px-2.5 rounded-lg border border-border bg-muted/30 text-xs focus:outline-none focus:ring-2 focus:ring-red-500/30"
            />
            <Button
              size="sm"
              className="w-full h-8 text-xs gap-1.5"
              onClick={runAikidoScan}
              disabled={aikidoLoading || !aikidoApiKey.trim()}
            >
              {aikidoLoading
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <RefreshCw className="w-3 h-3" />}
              {aikidoScanned ? "Re-scan with Aikido" : "Scan with Aikido"}
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {aikidoError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  <XCircle className="w-3.5 h-3.5 shrink-0" /> {aikidoError}
                </div>
              )}
              {!aikidoScanned && !aikidoLoading && !aikidoError && (
                <div className="text-center py-10 text-muted-foreground">
                  <span className="text-3xl">🥷</span>
                  <p className="text-xs mt-2">Paste your Aikido key and click Scan to get started.</p>
                </div>
              )}
              {aikidoScanned && aikidoFindings.length === 0 && !aikidoError && (
                <div className="text-center py-10 text-emerald-400">
                  <ShieldCheck className="w-8 h-8 mx-auto" />
                  <p className="text-xs mt-2">No vulnerabilities found.</p>
                </div>
              )}
              {aikidoFindings.map((f) => (
                <div key={f.id} className="p-3 rounded-xl border border-border bg-muted/10">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium">{f.title}</p>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${
                      f.severity === "CRITICAL" ? "border-red-500/30 text-red-400 bg-red-500/10" :
                      f.severity === "HIGH"     ? "border-orange-500/30 text-orange-400 bg-orange-500/10" :
                      f.severity === "MEDIUM"   ? "border-amber-500/30 text-amber-400 bg-amber-500/10" :
                                                  "border-blue-500/30 text-blue-400 bg-blue-500/10"
                    }`}>
                      {f.severity}
                    </span>
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-1">{f.category}</p>
                  <p className="text-[11px] mt-2 leading-relaxed">{f.description}</p>
                  {f.remediation && (
                    <p className="text-[11px] mt-2 text-emerald-300/90 leading-relaxed">💡 {f.remediation}</p>
                  )}
                  {f.link && (
                    <a href={f.link} target="_blank" rel="noreferrer" className="text-[10px] text-violet-300 underline mt-1 inline-block">
                      View in Aikido →
                    </a>
                  )}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Wiz Panel — goes through /api/security/scan so client never sees the
          WIZ_CLIENT_ID/SECRET. When env vars are missing the server returns 501
          with a setup guide that we render here. */}
      {activeTab === "wiz" && (
        <div className="flex flex-col flex-1 overflow-hidden">
          <div className="p-3 border-b border-border shrink-0 space-y-2">
            <div className="flex items-start gap-2">
              <span className="text-base">🛡️</span>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-medium">Wiz SCA / SAST</p>
                <p className="text-[10px] text-muted-foreground">
                  Enterprise CVE + risky-code scanner. Configure via{" "}
                  <a href="https://app.wiz.io" target="_blank" rel="noreferrer" className="underline text-violet-300">
                    app.wiz.io
                  </a>{" "}
                  and set <code className="text-[10px]">WIZ_CLIENT_ID</code> +{" "}
                  <code className="text-[10px]">WIZ_CLIENT_SECRET</code> in your server env.
                </p>
              </div>
            </div>
            <Button
              size="sm"
              className="w-full h-8 text-xs gap-1.5"
              onClick={runWizScan}
              disabled={wizLoading}
            >
              {wizLoading
                ? <Loader2 className="w-3 h-3 animate-spin" />
                : <RefreshCw className="w-3 h-3" />}
              {wizScanned ? "Re-scan with Wiz" : "Scan with Wiz"}
            </Button>
          </div>
          <ScrollArea className="flex-1">
            <div className="p-3 space-y-2">
              {wizError && (
                <div className="flex items-center gap-2 p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-400">
                  <XCircle className="w-3.5 h-3.5 shrink-0" /> {wizError}
                </div>
              )}
              {wizConfigGuide && (
                <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                    <p className="text-xs font-medium text-amber-200">Wiz isn&apos;t configured yet</p>
                  </div>
                  <ol className="text-[11px] text-amber-200/80 list-decimal list-inside space-y-0.5">
                    <li>{wizConfigGuide.step1}</li>
                    <li>{wizConfigGuide.step2}</li>
                    <li>{wizConfigGuide.step3}</li>
                  </ol>
                  {wizConfigGuide.docs && (
                    <a href={wizConfigGuide.docs} target="_blank" rel="noreferrer" className="text-[10px] text-violet-300 underline">
                      Documentation →
                    </a>
                  )}
                </div>
              )}
              {!wizScanned && !wizLoading && !wizError && !wizConfigGuide && (
                <div className="text-center py-10 text-muted-foreground">
                  <span className="text-3xl">🛡️</span>
                  <p className="text-xs mt-2">Click Scan to run a Wiz scan against this project.</p>
                </div>
              )}
              {wizScanned && wizFindings.length === 0 && !wizError && (
                <div className="text-center py-10 text-emerald-400">
                  <ShieldCheck className="w-8 h-8 mx-auto" />
                  <p className="text-xs mt-2">No issues found by Wiz.</p>
                </div>
              )}
              {wizFindings.map((f) => (
                <div key={f.id} className="p-3 rounded-xl border border-border bg-muted/10">
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-xs font-medium">{f.title}</p>
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-red-500/30 text-red-400 bg-red-500/10">
                      {f.severity}
                    </span>
                  </div>
                  {f.description && <p className="text-[11px] mt-2 leading-relaxed">{f.description}</p>}
                </div>
              ))}
            </div>
          </ScrollArea>
        </div>
      )}

      {/* Footer */}
      {activeTab === "sca" && scanned && results.length > 0 && (
        <div className="border-t border-border px-3 py-2.5 shrink-0">
          <Button
            size="sm"
            variant="outline"
            className="w-full h-7 text-xs gap-1.5"
            onClick={() => onFixWithAI(
              `Fix all vulnerabilities in my project dependencies. Update package.json with safe versions and ensure no breaking changes.`
            )}
          >
            <Wand2 className="w-3 h-3" /> Fix all vulnerabilities with AI
          </Button>
        </div>
      )}
    </div>
  );
}
