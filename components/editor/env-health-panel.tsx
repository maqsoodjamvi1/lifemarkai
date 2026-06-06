"use client";

import { useState, useEffect } from "react";
import { Activity, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Loader2, Eye, EyeOff, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

interface EnvHealthPanelProps {
  projectId: string;
}

type Status = "ok" | "missing" | "invalid" | "warning" | "unknown";

interface EnvCheck {
  key: string;
  status: Status;
  value?: string;           // masked value
  hint: string;             // what it should look like
  docUrl?: string;
  category: string;
  required: boolean;
}

const STATUS_ICON: Record<Status, React.ReactNode> = {
  ok:      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />,
  missing: <XCircle      className="w-3.5 h-3.5 text-red-400 shrink-0" />,
  invalid: <AlertTriangle className="w-3.5 h-3.5 text-orange-400 shrink-0" />,
  warning: <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />,
  unknown: <AlertTriangle className="w-3.5 h-3.5 text-muted-foreground shrink-0" />,
};

const STATUS_LABEL: Record<Status, string> = {
  ok:      "OK",
  missing: "Missing",
  invalid: "Invalid",
  warning: "Warning",
  unknown: "Unknown",
};

const STATUS_COLORS: Record<Status, string> = {
  ok:      "border-emerald-500/30 text-emerald-400",
  missing: "border-red-500/30 text-red-400",
  invalid: "border-orange-500/30 text-orange-400",
  warning: "border-yellow-500/30 text-yellow-400",
  unknown: "border-border text-muted-foreground",
};

interface EnvHealthResult {
  checks: EnvCheck[];
  score: number;          // 0–100
  checkedAt: string;
}

function maskValue(val: string): string {
  if (!val) return "";
  if (val.length <= 8) return "••••••••";
  return val.slice(0, 4) + "••••" + val.slice(-4);
}

export function EnvHealthPanel({ projectId }: EnvHealthPanelProps) {
  const [result, setResult] = useState<EnvHealthResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [revealKeys, setRevealKeys] = useState<Set<string>>(new Set());
  const [expandedCategory, setExpandedCategory] = useState<string | null>(null);
  const [filter, setFilter] = useState<Status | "all">("all");

  async function runCheck() {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/env-health`);
      if (!res.ok) throw new Error("Health check failed");
      const data = await res.json() as EnvHealthResult;
      setResult(data);
      if (data.checks.some((c) => c.status === "missing")) {
        setFilter("missing");
      } else {
        setFilter("all");
      }
    } catch {
      toast({ title: "Health check failed", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { runCheck(); }, [projectId]);

  function toggleReveal(key: string) {
    setRevealKeys((s) => {
      const next = new Set(s);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  if (!result && loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Checking environment variables…</p>
      </div>
    );
  }

  const filteredChecks = result?.checks.filter((c) => filter === "all" || c.status === filter) ?? [];

  const categories = Array.from(new Set((result?.checks ?? []).map((c) => c.category)));
  const catCounts = (cat: string) => {
    const cats = (result?.checks ?? []).filter((c) => c.category === cat);
    const issues = cats.filter((c) => c.status !== "ok" && c.status !== "unknown").length;
    return { total: cats.length, issues };
  };

  const scoreColor = !result ? "text-muted-foreground" :
    result.score >= 80 ? "text-emerald-400" :
    result.score >= 50 ? "text-yellow-400" : "text-red-400";

  const statusCounts = result
    ? (["ok", "missing", "invalid", "warning", "unknown"] as Status[]).reduce((acc, s) => {
        acc[s] = result.checks.filter((c) => c.status === s).length;
        return acc;
      }, {} as Record<Status, number>)
    : {} as Record<Status, number>;

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Activity className="w-4 h-4 text-teal-400" />
          <h2 className="font-semibold text-foreground">Env Health</h2>
          {result && (
            <span className={`text-sm font-bold ml-auto ${scoreColor}`}>{result.score}/100</span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Validate all environment variables at runtime</p>
      </div>

      {result && (
        <>
          {/* Score bar */}
          <div className="px-4 py-3 border-b border-border space-y-2">
            <div className="w-full h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-500 ${result.score >= 80 ? "bg-emerald-500" : result.score >= 50 ? "bg-yellow-500" : "bg-red-500"}`}
                style={{ width: `${result.score}%` }}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              {(["ok", "missing", "invalid", "warning"] as Status[]).map((s) => (
                statusCounts[s] > 0 && (
                  <button
                    key={s}
                    onClick={() => setFilter(filter === s ? "all" : s)}
                    className={`inline-flex items-center gap-1 text-[10px] border rounded-full px-2 py-0.5 transition-all ${filter === s ? STATUS_COLORS[s] + " bg-muted/30" : "border-border text-muted-foreground hover:border-muted-foreground"}`}
                  >
                    {STATUS_ICON[s]}
                    {statusCounts[s]} {STATUS_LABEL[s]}
                  </button>
                )
              ))}
              <button
                onClick={() => setFilter("all")}
                className={`text-[10px] px-2 py-0.5 border rounded-full transition-all ${filter === "all" ? "border-border text-foreground bg-muted/30" : "border-transparent text-muted-foreground hover:border-border"}`}
              >
                All ({result.checks.length})
              </button>
            </div>
          </div>

          {/* Checks list */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {categories.map((cat) => {
              const catChecks = filteredChecks.filter((c) => c.category === cat);
              if (catChecks.length === 0) return null;
              const { issues } = catCounts(cat);
              const isExpanded = expandedCategory === cat || filter !== "all";

              return (
                <div key={cat} className="rounded-xl border border-border overflow-hidden">
                  <button
                    className="w-full flex items-center justify-between px-3 py-2 hover:bg-muted/20 transition-colors"
                    onClick={() => setExpandedCategory(isExpanded && expandedCategory === cat ? null : cat)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-foreground">{cat}</span>
                      {issues > 0 && (
                        <Badge variant="outline" className="text-[9px] h-4 px-1 border-red-500/40 text-red-400">
                          {issues} issue{issues !== 1 ? "s" : ""}
                        </Badge>
                      )}
                    </div>
                    {isExpanded && expandedCategory === cat
                      ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" />
                      : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                  </button>

                  {(isExpanded || filter !== "all") && (
                    <div className="divide-y divide-border/50">
                      {catChecks.map((check) => (
                        <div key={check.key} className="px-3 py-2.5 space-y-1">
                          <div className="flex items-center gap-2">
                            {STATUS_ICON[check.status]}
                            <code className="text-xs font-mono font-semibold text-foreground flex-1 truncate">{check.key}</code>
                            <Badge variant="outline" className={`text-[9px] h-4 px-1 shrink-0 ${STATUS_COLORS[check.status]}`}>
                              {STATUS_LABEL[check.status]}
                            </Badge>
                            {!check.required && (
                              <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0 border-border text-muted-foreground">
                                optional
                              </Badge>
                            )}
                          </div>

                          {check.value && (
                            <div className="flex items-center gap-1.5">
                              <code className="text-[10px] font-mono text-muted-foreground flex-1 truncate">
                                {revealKeys.has(check.key) ? check.value : maskValue(check.value)}
                              </code>
                              <button onClick={() => toggleReveal(check.key)} className="text-muted-foreground hover:text-foreground">
                                {revealKeys.has(check.key) ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
                              </button>
                            </div>
                          )}

                          <p className="text-[10px] text-muted-foreground">{check.hint}</p>

                          {check.docUrl && (
                            <a
                              href={check.docUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-[10px] text-sky-400 hover:underline"
                            >
                              <ExternalLink className="w-2.5 h-2.5" /> Docs
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}

            {filteredChecks.length === 0 && (
              <div className="flex flex-col items-center gap-3 py-10 text-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-400/60" />
                <p className="text-sm font-medium text-foreground">All variables look good!</p>
                <p className="text-xs text-muted-foreground">No issues found for the selected filter.</p>
              </div>
            )}
          </div>

          {result.checkedAt && (
            <div className="px-4 py-2 border-t border-border text-[10px] text-muted-foreground">
              Last checked: {new Date(result.checkedAt).toLocaleTimeString()}
            </div>
          )}
        </>
      )}

      <div className="p-3 border-t border-border">
        <Button size="sm" className="w-full gap-1.5" onClick={runCheck} disabled={loading}>
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {loading ? "Checking…" : "Re-run health check"}
        </Button>
      </div>
    </div>
  );
}
