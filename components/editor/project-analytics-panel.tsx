"use client";

import { useState, useEffect, useCallback } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from "recharts";
import {
  BarChart2, RefreshCw, Loader2, Zap, Rocket, FileCode2,
  Coins, Clock, Globe, TrendingUp, Eye, Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Project } from "@/types/database";

interface AnalyticsSummary {
  totalMessages: number;
  buildGenerations: number;
  chatMessages: number;
  totalDeployments: number;
  liveDeployments: number;
  totalFiles: number;
  totalSnapshots: number;
  totalTokensUsed: number;
  projectAge: string;
  totalViews: number;
  recentViews: number;
  uniqueVisitors: number;
}

interface ActivityDay {
  date: string;
  builds: number;
  chats: number;
  deploys: number;
  views: number;
}

interface LangBreakdown {
  language: string;
  count: number;
}

interface RecentDeploy {
  id: string;
  status: string;
  created_at: string;
  deployed_at: string | null;
}

interface TopCountry {
  country: string;
  count: number;
}

interface AnalyticsData {
  summary: AnalyticsSummary;
  activityByDay: ActivityDay[];
  languageBreakdown: LangBreakdown[];
  recentDeploys: RecentDeploy[];
  topCountries: TopCountry[];
}

const LANG_COLORS = [
  "#6366f1", "#22d3ee", "#f59e0b", "#10b981",
  "#f43f5e", "#a78bfa", "#34d399", "#fb923c",
];

function kFormat(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function projectAgeDays(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function KpiCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-foreground",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="w-3.5 h-3.5" />
        <span className="text-[11px] font-medium uppercase tracking-wide">{label}</span>
      </div>
      <div className={`text-2xl font-bold tabular-nums ${color}`}>{value}</div>
      {sub && <div className="text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-lg border border-border bg-popover px-3 py-2 text-xs shadow-lg">
      <p className="font-medium mb-1">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} style={{ color: p.color }}>
          {p.name}: {p.value}
        </p>
      ))}
    </div>
  );
};

export function ProjectAnalyticsPanel({ project }: { project: Project }) {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${project.id}/analytics`);
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, [project.id]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-border shrink-0">
        <BarChart2 className="w-4 h-4" />
        <span className="text-sm font-semibold">Analytics</span>
        <Button
          variant="ghost"
          size="icon"
          className="ml-auto w-6 h-6"
          onClick={load}
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} />
        </Button>
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
          {/* Project age */}
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>
              Project created {projectAgeDays(data.summary.projectAge)} days ago
            </span>
            {project.deployed_url && (
              <>
                <span>·</span>
                <Globe className="w-3.5 h-3.5 text-emerald-400" />
                <a
                  href={project.deployed_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-emerald-400 hover:underline truncate max-w-[140px] font-mono"
                >
                  Live
                </a>
              </>
            )}
          </div>

          {/* KPI grid */}
          <div className="grid grid-cols-2 gap-2">
            <KpiCard
              icon={Zap}
              label="AI Builds"
              value={kFormat(data.summary.buildGenerations)}
              sub={`${data.summary.chatMessages} chats`}
              color="text-violet-400"
            />
            <KpiCard
              icon={Rocket}
              label="Deploys"
              value={kFormat(data.summary.totalDeployments)}
              sub={`${data.summary.liveDeployments} live`}
              color="text-emerald-400"
            />
            <KpiCard
              icon={FileCode2}
              label="Files"
              value={data.summary.totalFiles}
              sub={`${data.summary.totalSnapshots} snapshots`}
              color="text-blue-400"
            />
            <KpiCard
              icon={Coins}
              label="Tokens"
              value={kFormat(data.summary.totalTokensUsed)}
              sub="total used"
              color="text-amber-400"
            />
            <KpiCard
              icon={Eye}
              label="Page Views"
              value={kFormat(data.summary.totalViews)}
              sub={`${data.summary.recentViews} last 30d`}
              color="text-pink-400"
            />
            <KpiCard
              icon={Users}
              label="Unique Visitors"
              value={kFormat(data.summary.uniqueVisitors)}
              sub="last 30 days"
              color="text-orange-400"
            />
          </div>

          {/* Activity chart */}
          {data.activityByDay.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <TrendingUp className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Activity — last 30 days
                </span>
              </div>
              <ResponsiveContainer width="100%" height={140}>
                <BarChart
                  data={data.activityByDay}
                  margin={{ top: 0, right: 0, left: -28, bottom: 0 }}
                  barSize={6}
                  barGap={1}
                >
                  <XAxis
                    dataKey="date"
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    tickFormatter={(d) => d.slice(5)} // MM-DD
                    interval="preserveStartEnd"
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
                    allowDecimals={false}
                    axisLine={false}
                    tickLine={false}
                  />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="builds" name="Builds"  fill="#6366f1" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="chats"  name="Chats"   fill="#22d3ee" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="deploys" name="Deploys" fill="#10b981" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="views"  name="Views"   fill="#f472b6" radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
              {/* legend */}
              <div className="flex gap-3 mt-1 justify-center flex-wrap">
                {[
                  { label: "Builds",  color: "#6366f1" },
                  { label: "Chats",   color: "#22d3ee" },
                  { label: "Deploys", color: "#10b981" },
                  { label: "Views",   color: "#f472b6" },
                ].map((l) => (
                  <div key={l.label} className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <span className="w-2 h-2 rounded-full inline-block" style={{ background: l.color }} />
                    {l.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Language breakdown */}
          {data.languageBreakdown.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <FileCode2 className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Languages
                </span>
              </div>
              <div className="flex items-center gap-3">
                <PieChart width={90} height={90}>
                  <Pie
                    data={data.languageBreakdown}
                    cx={40}
                    cy={40}
                    innerRadius={22}
                    outerRadius={40}
                    paddingAngle={2}
                    dataKey="count"
                    strokeWidth={0}
                  >
                    {data.languageBreakdown.map((_, i) => (
                      <Cell key={i} fill={LANG_COLORS[i % LANG_COLORS.length]} />
                    ))}
                  </Pie>
                </PieChart>
                <div className="flex-1 space-y-1.5">
                  {data.languageBreakdown.map((l, i) => {
                    const total = data.languageBreakdown.reduce((s, x) => s + x.count, 0);
                    const pct = Math.round((l.count / total) * 100);
                    return (
                      <div key={l.language} className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full shrink-0"
                          style={{ background: LANG_COLORS[i % LANG_COLORS.length] }}
                        />
                        <span className="text-[11px] text-muted-foreground flex-1 truncate capitalize">
                          {l.language}
                        </span>
                        <span className="text-[11px] text-muted-foreground tabular-nums">
                          {l.count} <span className="opacity-60">({pct}%)</span>
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Top countries */}
          {data.topCountries?.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <Globe className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Top Countries — last 30 days
                </span>
              </div>
              <div className="space-y-2">
                {data.topCountries.map((c) => {
                  const maxCount = data.topCountries[0].count;
                  const pct = Math.round((c.count / maxCount) * 100);
                  return (
                    <div key={c.country} className="flex items-center gap-2 text-xs">
                      <span className="w-7 shrink-0 font-mono text-muted-foreground uppercase">
                        {c.country}
                      </span>
                      <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                        <div
                          className="h-full bg-pink-400/70 rounded-full"
                          style={{ width: `${pct}%` }}
                        />
                      </div>
                      <span className="w-6 text-right tabular-nums text-muted-foreground shrink-0">
                        {c.count}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Recent deploys */}
          {data.recentDeploys.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-3">
                <Rocket className="w-3.5 h-3.5 text-muted-foreground" />
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                  Recent Deploys
                </span>
              </div>
              <div className="space-y-1.5">
                {data.recentDeploys.map((d, i) => {
                  const isLive = d.status === "live";
                  return (
                    <div
                      key={d.id}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <span
                        className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                          isLive ? "bg-emerald-400" : "bg-red-400"
                        }`}
                      />
                      <span className={isLive ? "text-emerald-400" : "text-red-400"}>
                        {d.status}
                      </span>
                      <span className="opacity-50">·</span>
                      <span>{new Date(d.created_at).toLocaleDateString()}</span>
                      {i === 0 && (
                        <span className="ml-auto text-[10px] px-1.5 py-0.5 bg-muted rounded-full">
                          latest
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Empty state */}
          {data.summary.totalMessages === 0 && data.activityByDay.length === 0 && (
            <div className="text-center py-8 text-sm text-muted-foreground">
              <BarChart2 className="w-8 h-8 mx-auto mb-2 opacity-20" />
              <p>No activity yet</p>
              <p className="text-xs mt-1 opacity-60">
                Start building to see analytics here
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
