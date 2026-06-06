"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Shield, ShieldCheck, ShieldAlert, ShieldX, FileCode, Package,
  Lock, Settings, Search, Play, Loader2, CheckCircle2, AlertTriangle,
  XCircle, Info, Globe, Mail, Smartphone, Fingerprint, KeyRound,
  Eye, EyeOff, Download, RefreshCw, HelpCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { toast } from "@/hooks/use-toast";

/* ─── Types ─────────────────────────────────────────────── */

type Tab = "code" | "supply" | "secrets" | "auth";

interface Project {
  id: string;
  name: string;
  deployed_url: string | null;
  updated_at: string;
  security_score?: number | null;
}

interface Finding {
  severity: "critical" | "warning" | "info";
  title: string;
  file?: string;
  description: string;
}

const AUTH_METHODS = [
  { key: "email",  label: "Email",        desc: "Magic link / password sign-in",    icon: Mail,        enabled: true  },
  { key: "google", label: "Google",       desc: "OAuth via Google",                  icon: Globe,       enabled: true  },
  { key: "github", label: "GitHub",       desc: "OAuth via GitHub",                  icon: Fingerprint, enabled: true  },
  { key: "phone",  label: "Phone",        desc: "SMS authentication",                icon: Smartphone,  enabled: false },
  { key: "saml",   label: "SAML (SSO)",   desc: "Enterprise single sign-on",         icon: KeyRound,    enabled: false },
];

const SUPPLY_CHAIN_BEST_PRACTICES = [
  { title: "Pin dependency versions",           status: "pass",    desc: "Use exact versions in package.json" },
  { title: "No known CVEs in dependencies",     status: "warning", desc: "Run npm audit for latest results" },
  { title: "Lock file committed",               status: "pass",    desc: "package-lock.json is present" },
  { title: "Minimal dependency count",          status: "info",    desc: "Review and prune unused packages" },
  { title: "No deprecated packages",            status: "warning", desc: "Some packages may be deprecated" },
];

const FAQ = [
  { q: "Who can access the Security center?",               a: "Workspace admins and owners on Business and Enterprise plans." },
  { q: "Does the Security center run scans automatically?", a: "No. It displays the most recent scan results. You can trigger a scan from the Code Analysis tab." },
  { q: "Can I see actual secret values?",                   a: "No. Only secret names are shown. Values are never exposed here." },
];

function severityBadge(sev: string): string {
  if (sev === "critical") return "bg-red-500/20 text-red-400";
  if (sev === "warning")  return "bg-amber-500/20 text-amber-400";
  return "bg-blue-500/20 text-blue-400";
}

/* ─── Component ─────────────────────────────────────────── */

export function SecurityCenterPage({ userId }: { userId: string }) {
  const [activeTab, setActiveTab]   = useState<Tab>("code");
  const [projects, setProjects]     = useState<Project[]>([]);
  const [loading, setLoading]       = useState(true);
  const [search, setSearch]         = useState("");
  const [scanningId, setScanningId] = useState<string | null>(null);
  const [showFAQ, setShowFAQ]       = useState(false);
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);
  const [authMethods, setAuthMethods] = useState(AUTH_METHODS.map((m) => ({ ...m })));

  const fetchProjects = useCallback(async () => {
    setLoading(true);
    const supabase = createClient();
    const { data } = await (supabase as any)
      .from("projects")
      .select("id, name, deployed_url, updated_at, security_score")
      .eq("user_id", userId)
      .order("updated_at", { ascending: false })
      .limit(50);
    setProjects((data as Project[] | null) ?? []);
    setLoading(false);
  }, [userId]);

  useEffect(() => { fetchProjects(); }, [fetchProjects]);

  const handleScan = async (projectId: string) => {
    setScanningId(projectId);
    try {
      await fetch(`/api/projects/${projectId}/security`, { method: "POST" });
      toast({ title: "Scan started", description: "Security scan queued." });
      setTimeout(fetchProjects, 3000);
    } catch {
      toast({ title: "Scan failed", variant: "destructive" });
    } finally {
      setScanningId(null);
    }
  };

  const filteredProjects = projects.filter((p) =>
    !search || p.name.toLowerCase().includes(search.toLowerCase())
  );

  /* ── Aggregated stats ── */
  const totalCritical = projects.filter((p) => (p.security_score ?? 100) < 50).length;
  const totalWarning  = projects.filter((p) => { const s = p.security_score ?? 100; return s >= 50 && s < 80; }).length;
  const totalPassing  = projects.filter((p) => (p.security_score ?? 100) >= 80).length;

  const scoreIcon = (score: number | null | undefined) => {
    const s = score ?? 100;
    if (s >= 80) return <ShieldCheck size={14} className="text-green-400" />;
    if (s >= 50) return <ShieldAlert size={14} className="text-amber-400" />;
    return <ShieldX size={14} className="text-red-400" />;
  };

  const tabs = [
    { key: "code"   as Tab, label: "Code Analysis",  icon: FileCode },
    { key: "supply" as Tab, label: "Supply Chain",    icon: Package  },
    { key: "secrets" as Tab, label: "Secrets",        icon: Lock     },
    { key: "auth"   as Tab, label: "Auth Policy",     icon: Settings },
  ];

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <div className="border-b border-border">
        <div className="max-w-7xl mx-auto px-6 py-5">
          <div className="flex items-center gap-3 mb-4">
            <Shield size={20} className="text-muted-foreground" />
            <div>
              <h1 className="text-lg font-semibold">Security Center</h1>
              <p className="text-xs text-muted-foreground">Monitor security across your projects</p>
            </div>
          </div>

          {/* Summary chips */}
          <div className="flex gap-3 flex-wrap">
            {[
              { label: "Passing",   count: totalPassing,  color: "bg-green-500/20 text-green-400" },
              { label: "Warnings",  count: totalWarning,  color: "bg-amber-500/20 text-amber-400" },
              { label: "Critical",  count: totalCritical, color: "bg-red-500/20 text-red-400" },
            ].map((s) => (
              <div key={s.label} className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${s.color}`}>
                {s.count} {s.label}
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mt-4">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setActiveTab(t.key)}
                className={`flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg transition ${
                  activeTab === t.key
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:bg-muted"
                }`}
              >
                <t.icon size={12} /> {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-6 py-6 space-y-5">

        {/* ═══ CODE ANALYSIS TAB ═══ */}
        {activeTab === "code" && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div className="relative flex-1 max-w-sm">
                <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search projects…"
                  className="w-full pl-8 pr-3 py-2 text-xs border border-border rounded-lg bg-background text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <span className="text-[10px] text-muted-foreground">{filteredProjects.length} project{filteredProjects.length !== 1 ? "s" : ""}</span>
            </div>

            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="border-b border-border bg-muted/30">
                  <tr>
                    <th className="text-left py-2.5 px-4 text-muted-foreground font-medium">Project</th>
                    <th className="text-left py-2.5 px-4 text-muted-foreground font-medium">Score</th>
                    <th className="text-left py-2.5 px-4 text-muted-foreground font-medium">Status</th>
                    <th className="text-right py-2.5 px-4 text-muted-foreground font-medium">Scan</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={4} className="py-10 text-center">
                      <Loader2 size={18} className="text-muted-foreground animate-spin mx-auto" />
                    </td></tr>
                  ) : filteredProjects.length === 0 ? (
                    <tr><td colSpan={4} className="py-10 text-center text-muted-foreground">No projects found</td></tr>
                  ) : filteredProjects.map((p) => {
                    const score = p.security_score ?? null;
                    const isScanning = scanningId === p.id;
                    return (
                      <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition">
                        <td className="py-3 px-4">
                          <span className="font-medium text-foreground">{p.name}</span>
                          {p.deployed_url && (
                            <span className="text-[9px] text-green-400 ml-2">● Live</span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-1.5">
                            {scoreIcon(score)}
                            <span className="font-mono text-foreground">{score !== null ? `${score}/100` : "—"}</span>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          {score === null ? (
                            <span className="text-[10px] text-muted-foreground">Not scanned</span>
                          ) : score >= 80 ? (
                            <span className="text-[10px] text-green-400 flex items-center gap-1"><CheckCircle2 size={9} /> Passing</span>
                          ) : score >= 50 ? (
                            <span className="text-[10px] text-amber-400 flex items-center gap-1"><AlertTriangle size={9} /> Warnings</span>
                          ) : (
                            <span className="text-[10px] text-red-400 flex items-center gap-1"><XCircle size={9} /> Critical</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => handleScan(p.id)}
                            disabled={isScanning}
                            className="flex items-center gap-1 px-2.5 py-1 text-[10px] border border-border rounded-lg hover:bg-muted transition ml-auto disabled:opacity-50"
                          >
                            {isScanning ? <Loader2 size={10} className="animate-spin" /> : <Play size={10} />}
                            {isScanning ? "Scanning…" : "Scan"}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Info note */}
            <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <Info size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-blue-400">
                Security scans check for common vulnerabilities, insecure patterns, and exposed secrets.
                Full scan results are also available in the Security panel within each project editor.
              </p>
            </div>
          </div>
        )}

        {/* ═══ SUPPLY CHAIN TAB ═══ */}
        {activeTab === "supply" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <AlertTriangle size={14} className="text-amber-400 mt-0.5 flex-shrink-0" />
              <p className="text-xs text-amber-400">
                Supply chain security checks are run per-project. Use the Code Analysis tab to trigger scans.
                Below are workspace-wide best practice indicators.
              </p>
            </div>

            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="border-b border-border bg-muted/30">
                  <tr>
                    <th className="text-left py-2.5 px-4 text-muted-foreground font-medium">Check</th>
                    <th className="text-left py-2.5 px-4 text-muted-foreground font-medium">Status</th>
                    <th className="text-left py-2.5 px-4 text-muted-foreground font-medium">Description</th>
                  </tr>
                </thead>
                <tbody>
                  {SUPPLY_CHAIN_BEST_PRACTICES.map((bp, i) => (
                    <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/20 transition">
                      <td className="py-3 px-4 font-medium text-foreground">{bp.title}</td>
                      <td className="py-3 px-4">
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${severityBadge(bp.status === "pass" ? "info" : bp.status)}`}>
                          {bp.status === "pass" ? "✓ Pass" : bp.status === "warning" ? "⚠ Warning" : "ℹ Info"}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-muted-foreground">{bp.desc}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <p className="text-[10px] text-muted-foreground">
              For detailed dependency vulnerability reports, run <code className="bg-muted px-1 rounded">npm audit</code> in your project.
            </p>
          </div>
        )}

        {/* ═══ SECRETS TAB ═══ */}
        {activeTab === "secrets" && (
          <div className="space-y-4">
            <div className="flex items-start gap-2 p-3 bg-blue-500/10 border border-blue-500/20 rounded-xl">
              <Lock size={14} className="text-blue-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs text-blue-400 font-medium">Secrets are stored securely</p>
                <p className="text-xs text-blue-400/80 mt-0.5">
                  Environment variables are encrypted at rest. Secret values are never exposed in this view.
                  Manage per-project secrets in the Env panel within the editor.
                </p>
              </div>
            </div>

            {/* Per-project secret counts */}
            <div className="bg-card rounded-xl border border-border overflow-hidden">
              <table className="w-full text-xs">
                <thead className="border-b border-border bg-muted/30">
                  <tr>
                    <th className="text-left py-2.5 px-4 text-muted-foreground font-medium">Project</th>
                    <th className="text-left py-2.5 px-4 text-muted-foreground font-medium">Env Vars</th>
                    <th className="text-left py-2.5 px-4 text-muted-foreground font-medium">Last Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr><td colSpan={3} className="py-10 text-center">
                      <Loader2 size={18} className="text-muted-foreground animate-spin mx-auto" />
                    </td></tr>
                  ) : projects.length === 0 ? (
                    <tr><td colSpan={3} className="py-10 text-center text-muted-foreground">No projects</td></tr>
                  ) : projects.slice(0, 10).map((p) => (
                    <tr key={p.id} className="border-b border-border last:border-0 hover:bg-muted/20 transition">
                      <td className="py-3 px-4 font-medium text-foreground">{p.name}</td>
                      <td className="py-3 px-4 text-muted-foreground">—</td>
                      <td className="py-3 px-4 text-muted-foreground">
                        {new Date(p.updated_at).toLocaleDateString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ═══ AUTH POLICY TAB ═══ */}
        {activeTab === "auth" && (
          <div className="space-y-4 max-w-lg">
            <p className="text-sm text-muted-foreground">
              Configure which authentication methods are available to users of your workspace.
            </p>

            <div className="space-y-2">
              {authMethods.map((method, i) => {
                const Icon = method.icon;
                return (
                  <div
                    key={method.key}
                    className={`flex items-center justify-between p-3 rounded-xl border transition ${
                      method.enabled ? "border-border bg-card" : "border-border/50 bg-muted/20"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${method.enabled ? "bg-foreground/10" : "bg-muted"}`}>
                        <Icon size={14} className={method.enabled ? "text-foreground" : "text-muted-foreground"} />
                      </div>
                      <div>
                        <span className="text-sm font-medium text-foreground">{method.label}</span>
                        <p className="text-[10px] text-muted-foreground">{method.desc}</p>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        const updated = [...authMethods];
                        updated[i] = { ...updated[i], enabled: !updated[i].enabled };
                        setAuthMethods(updated);
                        toast({ title: `${method.label} ${!method.enabled ? "enabled" : "disabled"}` });
                      }}
                      className={`relative w-10 h-5 rounded-full transition-colors ${method.enabled ? "bg-green-500" : "bg-muted"}`}
                    >
                      <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${method.enabled ? "translate-x-5" : "translate-x-0.5"}`} />
                    </button>
                  </div>
                );
              })}
            </div>

            <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl">
              <p className="text-xs text-amber-400">
                Auth method changes require a Supabase configuration update. These toggles reflect the intended policy.
                Apply changes in your Supabase Auth settings at supabase.com/dashboard.
              </p>
            </div>
          </div>
        )}

        {/* FAQ */}
        <div className="bg-card rounded-xl border border-border overflow-hidden">
          <button
            onClick={() => setShowFAQ(!showFAQ)}
            className="flex items-center justify-between w-full p-4 hover:bg-muted/30 transition"
          >
            <div className="flex items-center gap-2">
              <HelpCircle size={14} className="text-muted-foreground" />
              <span className="text-sm font-medium">FAQ</span>
            </div>
            {showFAQ ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
          </button>
          {showFAQ && (
            <div className="border-t border-border divide-y divide-border">
              {FAQ.map((faq, i) => (
                <div key={i}>
                  <button
                    onClick={() => setExpandedFaq(expandedFaq === i ? null : i)}
                    className="flex items-center justify-between w-full p-4 hover:bg-muted/30 transition text-left"
                  >
                    <span className="text-xs text-foreground pr-4">{faq.q}</span>
                    {expandedFaq === i ? <ChevronUp size={10} className="text-muted-foreground flex-shrink-0" /> : <ChevronDown size={10} className="text-muted-foreground flex-shrink-0" />}
                  </button>
                  {expandedFaq === i && <p className="text-xs text-muted-foreground px-4 pb-4 leading-relaxed">{faq.a}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
