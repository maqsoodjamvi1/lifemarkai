"use client";

/**
 * Lovable-style site analytics panel.
 *
 * Mirrors the "More → Analytics" view from Lovable: a live current-visitors count,
 * a Last 7/30/90-day picker, five primary KPI tiles (Visitors, Pageviews,
 * Views per Visit, Visit Duration, Bounce Rate), an area chart of visitors,
 * and four breakdown tiles at the bottom (Source / Page / Country / Device).
 *
 * Backed by the existing /api/projects/[id]/analytics endpoint, which was
 * extended in migration 054 to expose per-view path, referrer, country and
 * device (derived from user-agent).
 *
 * The existing "ProjectAnalyticsPanel" (builder KPIs — AI Builds / Tokens /
 * Files etc.) is preserved and now lives under the "activity" panel slot.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import { BarChart2, Loader2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Project } from "@/types/database";

type Range = 7 | 30 | 90;

interface BreakdownItem {
  label: string;
  count: number;
}

interface SiteAnalyticsResponse {
  range: number;
  activeVisitors: number;
  site: {
    visitors: number;
    pageviews: number;
    viewsPerVisit: number;
    avgVisitDurationSec: number;
    bounceRatePct: number;
  };
  visitorsByDay: { date: string; visitors: number; pageviews: number }[];
  sources: BreakdownItem[];
  pages: BreakdownItem[];
  countries: BreakdownItem[];
  devices: BreakdownItem[];
}

const RANGE_LABEL: Record<Range, string> = {
  7: "Last 7 days",
  30: "Last 30 days",
  90: "Last 90 days",
};

function formatDuration(totalSec: number): string {
  if (!totalSec || totalSec < 1) return "0s";
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return s ? `${m}m ${s}s` : `${m}m`;
}

function formatDay(iso: string): string {
  // "2026-05-23" -> "23 May"
  const d = new Date(iso + "T00:00:00Z");
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short", timeZone: "UTC" });
}

function KpiTile({
  label,
  value,
  selected,
  onClick,
}: {
  label: string;
  value: string;
  selected?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 min-w-[120px] text-left rounded-xl border p-3 transition-colors ${
        selected
          ? "border-[#0066FF]/50 bg-[#0066FF]/5"
          : "border-border/60 hover:bg-muted/30"
      }`}
    >
      <div className="text-[11px] text-muted-foreground mb-1">{label}</div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
    </button>
  );
}

function BreakdownTile({
  title,
  rows,
  countLabel = "Visitors",
  emptyHint = "No data yet",
}: {
  title: string;
  rows: BreakdownItem[];
  countLabel?: string;
  emptyHint?: string;
}) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <div className="rounded-xl border border-border/60 p-3 bg-muted/10">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-semibold">{title}</span>
        <span className="text-[11px] text-muted-foreground">{countLabel}</span>
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/70 py-3 text-center">{emptyHint}</p>
      ) : (
        <div className="space-y-1.5">
          {rows.map((r) => {
            const pct = total > 0 ? Math.round((r.count / total) * 100) : 0;
            return (
              <div key={r.label} className="relative">
                <div
                  className="absolute inset-y-0 left-0 rounded-md bg-[#0066FF]/15"
                  style={{ width: `${pct}%` }}
                />
                <div className="relative flex items-center justify-between px-2 py-1 text-[11px]">
                  <span className="truncate text-foreground/90">{r.label}</span>
                  <span className="tabular-nums text-muted-foreground shrink-0 ml-2">{r.count}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function ProjectSiteAnalyticsPanel({ project }: { project: Project }) {
  const [range, setRange] = useState<Range>(7);
  const [data, setData] = useState<SiteAnalyticsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  // The five KPI tiles in Lovable are click-selectable and highlight the chart.
  // We track the active metric so the area chart updates accordingly.
  const [activeMetric, setActiveMetric] = useState<"visitors" | "pageviews">("visitors");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/analytics?range=${range}`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [project.id, range]);

  useEffect(() => { void load(); }, [load]);

  // Poll the live counter every 15s so the "current visitors" pill stays fresh.
  useEffect(() => {
    const id = setInterval(() => {
      void fetch(`/api/projects/${project.id}/analytics?range=${range}`)
        .then((r) => r.ok ? r.json() : null)
        .then((d: SiteAnalyticsResponse | null) => {
          if (d) setData(d);
        })
        .catch(() => {});
    }, 15_000);
    return () => clearInterval(id);
  }, [project.id, range]);

  const chartData = useMemo(() => {
    if (!data) return [];
    return data.visitorsByDay.map((d) => ({
      date: formatDay(d.date),
      visitors: d.visitors,
      pageviews: d.pageviews,
    }));
  }, [data]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <BarChart2 className="w-4 h-4" />
        <span className="text-sm font-semibold">Analytics</span>

        {/* Live current-visitors indicator (matches Lovable's "0 current visitors" pill) */}
        <div className="ml-3 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <span
            className={`w-1.5 h-1.5 rounded-full ${
              data && data.activeVisitors > 0 ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/40"
            }`}
          />
          <span>{data?.activeVisitors ?? 0} current visitors</span>
        </div>

        <div className="ml-auto flex items-center gap-1">
          {/* Date-range picker */}
          <div className="flex rounded-lg border border-border/60 overflow-hidden">
            {([7, 30, 90] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={`px-2.5 h-7 text-[11px] font-medium transition-colors ${
                  range === r
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {RANGE_LABEL[r]}
              </button>
            ))}
          </div>
          <Button variant="ghost" size="icon" className="w-7 h-7" onClick={load} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </div>

      {loading && !data ? (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : !data ? (
        <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
          Failed to load analytics
        </div>
      ) : (
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {/* KPI row — five tiles, click to switch chart series */}
          <div className="flex flex-wrap gap-2">
            <KpiTile
              label="Visitors"
              value={String(data.site.visitors)}
              selected={activeMetric === "visitors"}
              onClick={() => setActiveMetric("visitors")}
            />
            <KpiTile
              label="Pageviews"
              value={String(data.site.pageviews)}
              selected={activeMetric === "pageviews"}
              onClick={() => setActiveMetric("pageviews")}
            />
            <KpiTile
              label="Views Per Visit"
              value={data.site.viewsPerVisit ? data.site.viewsPerVisit.toFixed(1) : "0"}
            />
            <KpiTile label="Visit Duration" value={formatDuration(data.site.avgVisitDurationSec)} />
            <KpiTile label="Bounce Rate" value={`${data.site.bounceRatePct}%`} />
          </div>

          {/* Area chart */}
          <div className="rounded-xl border border-border/60 p-3">
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -22, bottom: 0 }}>
                <defs>
                  <linearGradient id="visitorsArea" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#0066FF" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#0066FF" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  interval="preserveStartEnd"
                />
                <YAxis
                  tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                  axisLine={false}
                  tickLine={false}
                  allowDecimals={false}
                  width={28}
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 11,
                  }}
                />
                <Area
                  type="monotone"
                  dataKey={activeMetric}
                  stroke="#0066FF"
                  strokeWidth={2}
                  fill="url(#visitorsArea)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Breakdown tiles — Source / Page / Country / Device */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <BreakdownTile title="Source" rows={data.sources} />
            <BreakdownTile title="Page" rows={data.pages} />
            <BreakdownTile title="Country" rows={data.countries} />
            <BreakdownTile title="Device" rows={data.devices} />
          </div>
        </div>
      )}
    </div>
  );
}
