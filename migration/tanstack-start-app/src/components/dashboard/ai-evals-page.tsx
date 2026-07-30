
/**
 * AiEvalsPage — read-only observability dashboard over `ai_eval_log`
 * (migration 080, written by lib/ai/eval-log.ts). Self-hosted stand-in for a
 * vendor eval platform: shows per-model call volume, success rate, latency
 * percentiles, and token usage so model-tier changes in model-defaults.ts are
 * visible instead of shipping blind.
 *
 * Rows are RLS-scoped to the signed-in user (policy ai_eval_log_select_own), so
 * this is "my AI usage" — aggregation happens client-side over the window.
 */

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  Activity, Gauge, CheckCircle2, AlertTriangle, Cpu, Loader2, RefreshCw,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

interface EvalRow {
  id: number;
  created_at: string;
  model: string;
  task: string | null;
  latency_ms: number | null;
  tokens_used: number | null;
  tool_calls: number;
  success: boolean;
  error: string | null;
  via_gateway: boolean;
}

const TIME_RANGES = [
  { key: "24h", label: "Last 24h", ms: 86_400_000 },
  { key: "7d", label: "Last 7 days", ms: 7 * 86_400_000 },
  { key: "30d", label: "Last 30 days", ms: 30 * 86_400_000 },
  { key: "all", label: "All time", ms: 0 },
] as const;

type RangeKey = typeof TIME_RANGES[number]["key"];

interface ModelStat {
  model: string;
  calls: number;
  successRate: number; // 0–100
  p50: number | null;
  p95: number | null;
  avgTokens: number | null;
  gatewayPct: number; // 0–100
}

function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1));
  return sorted[idx];
}

function fmtMs(v: number | null): string {
  if (v == null) return "—";
  return v >= 1000 ? `${(v / 1000).toFixed(1)}s` : `${Math.round(v)}ms`;
}

function fmtNum(v: number | null): string {
  if (v == null) return "—";
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(Math.round(v));
}

function timeAgo(date: string): string {
  const s = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export function AiEvalsPage({ userId: _userId }: { userId: string }) {
  const [rows, setRows] = useState<EvalRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [range, setRange] = useState<RangeKey>("7d");
  // Per-request drill-down filters
  const [requestFilter, setRequestFilter] = useState<"all" | "failed">("all");
  const [requestModel, setRequestModel] = useState("");
  const [requestLimit, setRequestLimit] = useState(50);

  const fetchRows = useCallback(async () => {
    setLoading(true);
    try {
      const supabase = createClient();
      const rangeDef = TIME_RANGES.find((r) => r.key === range)!;
      const sinceIso = rangeDef.ms ? new Date(Date.now() - rangeDef.ms).toISOString() : null;
      // ai_eval_log isn't in the generated Database types yet — query via a
      // loosened client. RLS still scopes rows to the signed-in user.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      let q: any = (supabase as any).from("ai_eval_log").select("*");
      if (sinceIso) q = q.gte("created_at", sinceIso);
      q = q.order("created_at", { ascending: false }).limit(2000);
      const { data } = (await q) as { data: EvalRow[] | null };
      setRows(data ?? []);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [range]);

  useEffect(() => { void fetchRows(); }, [fetchRows]);

  const { totals, perModel, recentErrors } = useMemo(() => {
    const total = rows.length;
    const ok = rows.filter((r) => r.success).length;
    const latencies = rows.map((r) => r.latency_ms).filter((v): v is number => v != null).sort((a, b) => a - b);
    const tokens = rows.map((r) => r.tokens_used).filter((v): v is number => v != null);
    const totals = {
      calls: total,
      successRate: total ? (ok / total) * 100 : 0,
      p95: percentile(latencies, 95),
      totalTokens: tokens.reduce((a, b) => a + b, 0),
    };

    const byModel = new Map<string, EvalRow[]>();
    for (const r of rows) {
      const list = byModel.get(r.model) ?? [];
      list.push(r);
      byModel.set(r.model, list);
    }
    const perModel: ModelStat[] = [...byModel.entries()]
      .map(([model, list]) => {
        const lat = list.map((r) => r.latency_ms).filter((v): v is number => v != null).sort((a, b) => a - b);
        const tok = list.map((r) => r.tokens_used).filter((v): v is number => v != null);
        const okCount = list.filter((r) => r.success).length;
        const gw = list.filter((r) => r.via_gateway).length;
        return {
          model,
          calls: list.length,
          successRate: (okCount / list.length) * 100,
          p50: percentile(lat, 50),
          p95: percentile(lat, 95),
          avgTokens: tok.length ? tok.reduce((a, b) => a + b, 0) / tok.length : null,
          gatewayPct: (gw / list.length) * 100,
        };
      })
      .sort((a, b) => b.calls - a.calls);

    const recentErrors = rows.filter((r) => !r.success).slice(0, 12);
    return { totals, perModel, recentErrors };
  }, [rows]);

  const filteredRequests = useMemo(
    () => rows.filter((r) =>
      (requestFilter === "all" || !r.success) &&
      (!requestModel || r.model === requestModel),
    ),
    [rows, requestFilter, requestModel],
  );

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-violet-400" />
          <h1 className="text-xl font-semibold">AI Metrics</h1>
          <span className="text-xs text-muted-foreground">observability over your model calls</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-border overflow-hidden">
            {TIME_RANGES.map((r) => (
              <button
                key={r.key}
                onClick={() => setRange(r.key)}
                className={`px-2.5 py-1 text-xs transition-colors ${range === r.key ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}
              >
                {r.label}
              </button>
            ))}
          </div>
          <button
            onClick={() => void fetchRows()}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-2.5 py-1 text-xs text-muted-foreground hover:bg-muted transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh
          </button>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <SummaryCard icon={<Cpu className="w-4 h-4" />} label="Calls" value={fmtNum(totals.calls)} />
        <SummaryCard icon={<CheckCircle2 className="w-4 h-4" />} label="Success rate" value={`${totals.successRate.toFixed(1)}%`} tone={totals.successRate >= 99 ? "good" : totals.successRate >= 95 ? "warn" : "bad"} />
        <SummaryCard icon={<Gauge className="w-4 h-4" />} label="p95 latency" value={fmtMs(totals.p95)} />
        <SummaryCard icon={<Activity className="w-4 h-4" />} label="Tokens" value={fmtNum(totals.totalTokens)} />
      </div>

      {loading && rows.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading metrics…
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-muted/20 p-8 text-center text-sm text-muted-foreground">
          <p className="font-medium text-foreground mb-1">No AI calls recorded in this window.</p>
          <p>Rows land here once the <code className="px-1 rounded bg-muted">ai_eval_log</code> migration (080) is applied and an AI call runs through <code className="px-1 rounded bg-muted">generateAI</code>.</p>
        </div>
      ) : (
        <>
          {/* Per-model table */}
          <div className="rounded-xl border border-border overflow-hidden mb-6">
            <div className="px-4 py-2 border-b border-border bg-muted/30 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              By model
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    <th className="text-left font-medium px-4 py-2">Model</th>
                    <th className="text-right font-medium px-4 py-2">Calls</th>
                    <th className="text-right font-medium px-4 py-2">Success</th>
                    <th className="text-right font-medium px-4 py-2">p50</th>
                    <th className="text-right font-medium px-4 py-2">p95</th>
                    <th className="text-right font-medium px-4 py-2">Avg tokens</th>
                    <th className="text-right font-medium px-4 py-2">Gateway</th>
                  </tr>
                </thead>
                <tbody>
                  {perModel.map((m) => (
                    <tr key={m.model} className="border-t border-border/60">
                      <td className="px-4 py-2 font-mono text-xs truncate max-w-[240px]" title={m.model}>{m.model}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{m.calls}</td>
                      <td className={`px-4 py-2 text-right tabular-nums ${m.successRate >= 99 ? "text-green-400" : m.successRate >= 95 ? "text-amber-400" : "text-red-400"}`}>{m.successRate.toFixed(0)}%</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{fmtMs(m.p50)}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{fmtMs(m.p95)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{fmtNum(m.avgTokens)}</td>
                      <td className="px-4 py-2 text-right tabular-nums text-muted-foreground">{m.gatewayPct.toFixed(0)}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Per-request drill-down (Lovable AI-activity parity): every call
              with status, model, task, tokens, latency, and route. */}
          <div className="rounded-xl border border-border overflow-hidden mb-6">
            <div className="px-4 py-2 border-b border-border bg-muted/30 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Requests</span>
              <div className="flex gap-1 ml-auto">
                {(["all", "failed"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setRequestFilter(f)}
                    className={`px-2 py-0.5 rounded-md text-[11px] transition-colors ${requestFilter === f ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:bg-muted"}`}
                  >
                    {f === "all" ? "All" : "Failed only"}
                  </button>
                ))}
                <select
                  value={requestModel}
                  onChange={(e) => setRequestModel(e.target.value)}
                  className="text-[11px] bg-muted/40 border border-border/60 rounded-md px-1.5 py-0.5 text-muted-foreground max-w-[180px]"
                >
                  <option value="">All models</option>
                  {perModel.map((m) => <option key={m.model} value={m.model}>{m.model}</option>)}
                </select>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="text-left font-medium px-4 py-1.5">When</th>
                    <th className="text-left font-medium px-4 py-1.5">Status</th>
                    <th className="text-left font-medium px-4 py-1.5">Model</th>
                    <th className="text-left font-medium px-4 py-1.5">Task</th>
                    <th className="text-right font-medium px-4 py-1.5">Tokens</th>
                    <th className="text-right font-medium px-4 py-1.5">Latency</th>
                    <th className="text-right font-medium px-4 py-1.5">Route</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRequests.slice(0, requestLimit).map((r) => (
                    <tr key={r.id} className="border-t border-border/60 hover:bg-muted/20">
                      <td className="px-4 py-1.5 text-muted-foreground whitespace-nowrap">{timeAgo(r.created_at)}</td>
                      <td className="px-4 py-1.5">
                        {r.success
                          ? <span className="inline-flex items-center gap-1 text-green-400"><CheckCircle2 className="w-3 h-3" /> ok</span>
                          : <span className="inline-flex items-center gap-1 text-red-400" title={r.error ?? ""}><AlertTriangle className="w-3 h-3" /> failed</span>}
                      </td>
                      <td className="px-4 py-1.5 font-mono truncate max-w-[200px]" title={r.model}>{r.model}</td>
                      <td className="px-4 py-1.5 text-muted-foreground truncate max-w-[140px]" title={r.task ?? ""}>{r.task ?? "—"}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums text-muted-foreground">{fmtNum(r.tokens_used)}</td>
                      <td className="px-4 py-1.5 text-right tabular-nums">{fmtMs(r.latency_ms)}</td>
                      <td className="px-4 py-1.5 text-right text-muted-foreground">{r.via_gateway ? "gateway" : "direct"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {filteredRequests.length === 0 && (
                <p className="px-4 py-4 text-xs text-muted-foreground text-center">No requests match the filter.</p>
              )}
              {filteredRequests.length > requestLimit && (
                <button
                  onClick={() => setRequestLimit((n) => n + 50)}
                  className="w-full px-4 py-2 text-[11px] text-muted-foreground hover:bg-muted/40 border-t border-border/60 transition-colors"
                >
                  Show more ({filteredRequests.length - requestLimit} remaining)
                </button>
              )}
            </div>
          </div>

          {/* Recent errors */}
          {recentErrors.length > 0 && (
            <div className="rounded-xl border border-border overflow-hidden">
              <div className="px-4 py-2 border-b border-border bg-muted/30 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <AlertTriangle className="w-3.5 h-3.5 text-red-400" /> Recent failures
              </div>
              <ul className="divide-y divide-border/60">
                {recentErrors.map((r) => (
                  <li key={r.id} className="px-4 py-2 flex items-start gap-3 text-xs">
                    <span className="font-mono text-muted-foreground shrink-0">{timeAgo(r.created_at)}</span>
                    <span className="font-mono text-foreground shrink-0 truncate max-w-[180px]" title={r.model}>{r.model}</span>
                    <span className="text-red-400/90 truncate" title={r.error ?? ""}>{r.error ?? "(no message)"}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function SummaryCard({ icon, label, value, tone }: { icon: ReactNode; label: string; value: string; tone?: "good" | "warn" | "bad" }) {
  const toneClass = tone === "good" ? "text-green-400" : tone === "warn" ? "text-amber-400" : tone === "bad" ? "text-red-400" : "text-foreground";
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1.5">{icon}{label}</div>
      <div className={`text-2xl font-semibold tabular-nums ${toneClass}`}>{value}</div>
    </div>
  );
}
