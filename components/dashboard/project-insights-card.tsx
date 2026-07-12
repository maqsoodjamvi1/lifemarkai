"use client";

/**
 * ProjectInsightsCard
 * Fetches the last 7 days of usage data from /api/analytics/usage and renders
 * a natural-language summary of the most active week, plus sparkline stats.
 */

import { useState, useEffect } from "react";
import {
  Sparkles, TrendingUp, Zap, GitBranch, Code2,
  Loader2, RefreshCw, ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

// ─── Types ────────────────────────────────────────────────────────────────────

interface BurnDay {
  date: string;
  credits: number;
}

interface UsageData {
  burnByDay: BurnDay[];
  totalCredits: number;
  totalGenerations: number;
  byModel: Array<{ model: string; count: number; tokens: number }>;
  byMode: Array<{ mode: string; count: number }>;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function last7Days(data: BurnDay[]): BurnDay[] {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);
  return data.filter((d) => new Date(d.date) >= cutoff);
}

function buildInsightSentence(data: UsageData, days: BurnDay[]): string {
  const totalCredits = days.reduce((s, d) => s + d.credits, 0);
  const totalGen = data.totalGenerations;

  if (totalCredits === 0 && totalGen === 0) {
    return "No AI activity this week. Try building something new!";
  }

  const topModel = data.byModel[0];
  const topMode = data.byMode[0];
  const peakDay = [...days].sort((a, b) => b.credits - a.credits)[0];

  const parts: string[] = [];

  if (totalGen > 0) {
    parts.push(`You ran ${totalGen} AI generation${totalGen !== 1 ? "s" : ""} this week`);
  }
  if (totalCredits > 0) {
    parts.push(`using ${totalCredits} credit${totalCredits !== 1 ? "s" : ""}`);
  }
  if (topModel) {
    const modelLabel = topModel.model.includes("claude") ? "Claude" : topModel.model.includes("gpt") ? "GPT-4o" : topModel.model;
    parts.push(`mostly with ${modelLabel}`);
  }
  if (topMode) {
    parts.push(`in ${topMode.mode} mode`);
  }
  if (peakDay && peakDay.credits > 0) {
    const dayName = new Date(peakDay.date).toLocaleDateString("en", { weekday: "long" });
    parts.push(`— busiest day was ${dayName}`);
  }

  return parts.join(" ") + ".";
}

// ─── Sparkline ───────────────────────────────────────────────────────────────

function Sparkline({ days }: { days: BurnDay[] }) {
  if (days.length < 2) return null;
  const max = Math.max(...days.map((d) => d.credits), 1);
  const W = 120;
  const H = 32;
  const pts = days.map((d, i) => {
    const x = (i / (days.length - 1)) * W;
    const y = H - (d.credits / max) * H;
    return `${x},${y}`;
  });

  return (
    <svg width={W} height={H} className="overflow-visible">
      <polyline
        points={pts.join(" ")}
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        opacity={0.7}
      />
      {/* Area fill */}
      <polyline
        points={`0,${H} ${pts.join(" ")} ${W},${H}`}
        fill="hsl(var(--primary))"
        opacity={0.08}
      />
    </svg>
  );
}

// ─── Stat Pill ────────────────────────────────────────────────────────────────

function StatPill({ icon: Icon, value, label, color }: {
  icon: React.ElementType;
  value: string | number;
  label: string;
  color: string;
}) {
  return (
    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/40 border border-border/60">
      <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${color}`}>
        <Icon className="w-3.5 h-3.5" />
      </div>
      <div>
        <p className="text-sm font-bold leading-none">{value}</p>
        <p className="text-[10px] text-muted-foreground mt-0.5">{label}</p>
      </div>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ProjectInsightsCardProps {
  projectId?: string; // optional — link to most active project
  projectName?: string;
}

export function ProjectInsightsCard({ projectId, projectName }: ProjectInsightsCardProps) {
  const [data, setData] = useState<UsageData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    setLoading(true);
    setError(false);
    fetch("/api/analytics/usage")
      .then((r) => {
        if (!r.ok) throw new Error("Failed");
        return r.json() as Promise<UsageData>;
      })
      .then((d) => { setData(d); setLoading(false); })
      .catch(() => { setError(true); setLoading(false); });
  }, [refreshKey]);

  const weekDays = data ? last7Days(data.burnByDay) : [];
  const weekCredits = weekDays.reduce((s, d) => s + d.credits, 0);
  const topMode = data?.byMode[0];
  const topModel = data?.byModel[0];

  // ── Skeleton ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 space-y-3 animate-pulse">
        <div className="h-4 bg-muted rounded w-32" />
        <div className="h-3 bg-muted rounded w-3/4" />
        <div className="flex gap-2 mt-3">
          {[1, 2, 3].map((i) => <div key={i} className="h-12 bg-muted rounded-xl flex-1" />)}
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-border bg-card p-5 flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Could not load weekly insights.</p>
        <Button size="sm" variant="ghost" onClick={() => setRefreshKey((k) => k + 1)}>
          <RefreshCw className="w-3.5 h-3.5 mr-1" /> Retry
        </Button>
      </div>
    );
  }

  // Nothing to show yet
  if (data.totalGenerations === 0 && weekCredits === 0) {
    return null; // Don't render the card if there's genuinely no activity
  }

  const insightText = buildInsightSentence(data, weekDays);

  return (
    <div className="rounded-2xl border border-border bg-card overflow-hidden">
      {/* Header strip */}
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-border/60 bg-gradient-to-r from-violet-500/5 to-transparent">
        <div className="w-7 h-7 rounded-lg bg-violet-500/15 flex items-center justify-center">
          <Sparkles className="w-3.5 h-3.5 text-violet-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold">Weekly Insights</p>
          <p className="text-[10px] text-muted-foreground">Last 7 days</p>
        </div>
        {projectId && (
          <Link href={`/editor/${projectId}`}>
            <Button size="sm" variant="ghost" className="h-6 text-[10px] gap-1 px-2">
              {projectName ?? "Open project"} <ChevronRight className="w-3 h-3" />
            </Button>
          </Link>
        )}
        <Button
          size="sm" variant="ghost"
          className="h-6 w-6 p-0"
          onClick={() => setRefreshKey((k) => k + 1)}
        >
          <RefreshCw className="w-3 h-3 text-muted-foreground" />
        </Button>
      </div>

      <div className="px-5 py-4 space-y-4">
        {/* Insight sentence */}
        <div className="flex items-start gap-3">
          <TrendingUp className="w-4 h-4 text-violet-400 shrink-0 mt-0.5" />
          <p className="text-sm text-foreground/90 leading-relaxed">{insightText}</p>
        </div>

        {/* Stat pills */}
        <div className="grid grid-cols-3 gap-2">
          <StatPill
            icon={Zap}
            value={data.totalGenerations}
            label="generations"
            color="bg-violet-500/15 text-violet-400"
          />
          <StatPill
            icon={Code2}
            value={weekCredits}
            label="credits used"
            color="bg-amber-500/15 text-amber-400"
          />
          <StatPill
            icon={GitBranch}
            value={topMode ? topMode.mode : "—"}
            label="top mode"
            color="bg-sky-500/15 text-sky-400"
          />
        </div>

        {/* Sparkline + model badges */}
        <div className="flex items-end justify-between gap-4">
          <div className="flex-1">
            <p className="text-[10px] text-muted-foreground mb-1.5">Credit usage — last 7 days</p>
            {weekDays.length >= 2 ? (
              <Sparkline days={weekDays} />
            ) : (
              <p className="text-[10px] text-muted-foreground/50">Not enough data yet</p>
            )}
          </div>
          {data.byModel.length > 0 && (
            <div className="flex flex-col items-end gap-1 shrink-0">
              <p className="text-[10px] text-muted-foreground">Models used</p>
              {data.byModel.slice(0, 3).map((m) => {
                const label = m.model.includes("claude") ? "Claude" : m.model.includes("gpt") ? "GPT-4o" : m.model.split("-")[0];
                return (
                  <Badge key={m.model} variant="outline" className="text-[9px] h-4 px-1.5">
                    {label} <span className="ml-1 text-muted-foreground/60">{m.count}×</span>
                  </Badge>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
