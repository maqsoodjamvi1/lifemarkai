// @ts-nocheck
"use client";

import { useMemo, useState, useEffect } from "react";
import { BarChart3, Zap, Rocket, Code2, TrendingUp, Calendar, Activity, Cpu, TrendingDown } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend, LineChart, Line, XAxis, YAxis, CartesianGrid, BarChart, Bar } from "recharts";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import type { Profile, Project, CreditLog, Deployment } from "@/types/database";

interface AnalyticsPageProps {
  profile: Profile | null;
  projects: Array<Pick<Project, "id" | "name" | "created_at" | "status" | "framework">>;
  creditLogs: CreditLog[];
  deployments: Array<Deployment & { projects: { name: string } | null }>;
}

function StatCard({
  icon: Icon,
  label,
  value,
  sub,
  color = "text-primary",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
}) {
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div className={`p-2 rounded-lg bg-primary/10 ${color}`}>
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-sm text-muted-foreground">{label}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function groupByDay(items: Array<{ created_at: string }>, days = 30) {
  const map: Record<string, number> = {};
  const now = new Date();
  for (let i = 0; i < days; i++) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    map[d.toLocaleDateString("en-US", { month: "short", day: "numeric" })] = 0;
  }
  items.forEach((item) => {
    const date = new Date(item.created_at);
    const key = date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    if (key in map) map[key] = (map[key] || 0) + 1;
  });
  return Object.entries(map).reverse();
}

export function AnalyticsPage({ profile, projects, creditLogs, deployments }: AnalyticsPageProps) {
  const [usageData, setUsageData] = useState<{
    burnByDay: Array<{date:string;credits:number}>;
    byModel: Array<{model:string;count:number;tokens:number}>;
    byMode: Array<{mode:string;count:number}>;
    totalCredits: number;
    totalGenerations: number;
  } | null>(null);

  useEffect(() => {
    fetch("/api/analytics/usage")
      .then((r) => r.json())
      .then((d) => setUsageData(d))
      .catch(() => {});
  }, []);

  const totalCreditsUsed = useMemo(
    () => creditLogs.filter((l) => l.amount < 0).reduce((sum, l) => sum + Math.abs(l.amount), 0),
    [creditLogs]
  );

  // "live" is a DEPLOYMENT status, not a project status (projects are
  // active/archived/building) — derive live projects from deployments.
  const liveProjects = new Set(
    deployments.filter((d) => d.status === "live").map((d) => d.project_id)
  ).size;
  const totalDeployments = deployments.length;
  // deployments.status CHECK is ('building','live','failed','cancelled') —
  // "success" was never a real value, so this stat was permanently 0.
  const successDeployments = deployments.filter((d) => d.status === "live").length;

  const recentActivity = [...projects.map((p) => ({
    type: "project" as const,
    name: p.name,
    date: p.created_at,
    status: p.status,
  })), ...deployments.slice(0, 10).map((d) => ({
    type: "deployment" as const,
    name: d.projects?.name || "Unknown",
    date: d.created_at,
    status: d.status,
  }))].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 15);

  const frameworkCounts = projects.reduce<Record<string, number>>((acc, p) => {
    const fw = p.framework || "other";
    acc[fw] = (acc[fw] || 0) + 1;
    return acc;
  }, {});

  const topFrameworks = Object.entries(frameworkCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 5);

  const creditUsageByDay = groupByDay(
    creditLogs.filter((l) => l.amount < 0).map((l) => ({ created_at: l.created_at }))
  );

  // AI mode breakdown from credit_logs action field
  const modeBreakdown = useMemo(() => {
    const map: Record<string, number> = { chat: 0, build: 0, agent: 0, plan: 0, other: 0 };
    creditLogs.filter((l) => l.amount < 0).forEach((l) => {
      const action = (l.action || "").toLowerCase();
      if (action.includes("chat")) map.chat += Math.abs(l.amount);
      else if (action.includes("build")) map.build += Math.abs(l.amount);
      else if (action.includes("agent")) map.agent += Math.abs(l.amount);
      else if (action.includes("plan")) map.plan += Math.abs(l.amount);
      else map.other += Math.abs(l.amount);
    });
    return [
      { name: "Chat", value: map.chat, color: "#a78bfa" },
      { name: "Build", value: map.build, color: "#60a5fa" },
      { name: "Agent", value: map.agent, color: "#34d399" },
      { name: "Plan", value: map.plan, color: "#fbbf24" },
      { name: "Other", value: map.other, color: "#94a3b8" },
    ].filter((d) => d.value > 0);
  }, [creditLogs]);

  const maxDayUsage = Math.max(...creditUsageByDay.map(([, v]) => v), 1);

  const planLimits: Record<string, number> = { free: 100, pro: 1000, business: 5000, enterprise: 99999 };
  const planLimit = planLimits[profile?.plan || "free"];
  const creditsLeft = profile?.credits ?? 0;
  const creditsUsedPct = Math.min(100, Math.round(((planLimit - creditsLeft) / planLimit) * 100));

  return (
    <div className="flex-1 p-8 space-y-8 overflow-y-auto">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Analytics</h1>
        <p className="text-muted-foreground mt-1">Track your usage, projects, and deployments.</p>
      </div>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard icon={Code2} label="Total Projects" value={projects.length} sub={`${liveProjects} live`} />
        <StatCard icon={Rocket} label="Deployments" value={totalDeployments} sub={`${successDeployments} successful`} color="text-green-500" />
        <StatCard icon={Zap} label="Credits Used" value={totalCreditsUsed} sub="all time" color="text-yellow-500" />
        <StatCard icon={Activity} label="Credits Left" value={creditsLeft} sub={`${profile?.plan || "free"} plan`} color="text-violet-500" />
      </div>

      {/* Credit Usage Bar */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BarChart3 className="h-4 w-4" /> Credit Usage (Last 30 Days)
          </CardTitle>
          <CardDescription>Daily AI credit consumption</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-1 h-32">
            {creditUsageByDay.map(([label, count]) => (
              <div key={label} className="flex-1 flex flex-col items-center gap-1 group">
                <div
                  className="w-full rounded-t bg-primary/60 hover:bg-primary transition-all"
                  style={{ height: `${Math.max(2, (count / maxDayUsage) * 100)}%` }}
                  title={`${label}: ${count} credits`}
                />
              </div>
            ))}
          </div>
          <div className="flex justify-between mt-2">
            <span className="text-xs text-muted-foreground">{creditUsageByDay[0]?.[0]}</span>
            <span className="text-xs text-muted-foreground">{creditUsageByDay[creditUsageByDay.length - 1]?.[0]}</span>
          </div>

          <div className="mt-4 space-y-1">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Plan usage</span>
              <span className="font-medium">{creditsUsedPct}%</span>
            </div>
            <Progress value={creditsUsedPct} className="h-2" />
            <p className="text-xs text-muted-foreground">{creditsLeft} credits remaining of {planLimit} on {profile?.plan || "free"} plan</p>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Framework breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Frameworks Used
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {topFrameworks.length === 0 ? (
              <p className="text-sm text-muted-foreground">No projects yet.</p>
            ) : (
              topFrameworks.map(([fw, count]) => (
                <div key={fw} className="space-y-1">
                  <div className="flex justify-between text-sm">
                    <span className="capitalize">{fw}</span>
                    <span className="font-medium">{count}</span>
                  </div>
                  <Progress value={Math.round((count / projects.length) * 100)} className="h-1.5" />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        {/* Recent Activity */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Calendar className="h-4 w-4" /> Recent Activity
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recentActivity.length === 0 ? (
                <p className="text-sm text-muted-foreground">No activity yet.</p>
              ) : (
                recentActivity.slice(0, 10).map((item, i) => (
                  <div key={i} className="flex items-center gap-3 text-sm">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      item.type === "deployment"
                        ? item.status === "success" ? "bg-green-500" : item.status === "failed" ? "bg-red-500" : "bg-yellow-500"
                        : "bg-primary"
                    }`} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{item.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.type === "deployment" ? "Deployed" : "Project created"} ·{" "}
                        {new Date(item.date).toLocaleDateString()}
                      </p>
                    </div>
                    <Badge
                      variant={item.status === "live" || item.status === "active" ? "default" : "secondary"}
                      className="text-xs"
                    >
                      {item.status}
                    </Badge>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* AI Usage Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="h-4 w-4" /> AI Usage by Mode
            </CardTitle>
            <CardDescription>Credits consumed per AI mode</CardDescription>
          </CardHeader>
          <CardContent>
            {modeBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground">No AI usage recorded yet.</p>
            ) : (
              <div className="flex flex-col items-center gap-4">
                <ResponsiveContainer width="100%" height={180}>
                  <PieChart>
                    <Pie
                      data={modeBreakdown}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={3}
                      dataKey="value"
                    >
                      {modeBreakdown.map((entry) => (
                        <Cell key={entry.name} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(value: number) => [`${value} credits`, ""]}
                      contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    />
                    <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="w-full space-y-1.5">
                  {modeBreakdown.map((entry) => (
                    <div key={entry.name} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-1.5">
                        <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: entry.color }} />
                        <span className="text-muted-foreground">{entry.name}</span>
                      </div>
                      <span className="font-medium tabular-nums">{entry.value} cr</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
      {/* Credit Burn Rate Line Chart */}
      {usageData && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <TrendingDown className="h-4 w-4 text-violet-400" /> Credit Burn Rate (30 days)
            </CardTitle>
            <CardDescription>Daily credits consumed — {usageData.totalCredits} total in 30 days</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={usageData.burnByDay} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} tickFormatter={(v) => v.slice(5)} interval={4} />
                <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                  formatter={(v) => [v + " credits", ""]}
                />
                <Line type="monotone" dataKey="credits" stroke="#a78bfa" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Per-Model Usage Bar Chart */}
      {usageData && usageData.byModel.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <Cpu className="h-4 w-4 text-sky-400" /> Generations by Model
              </CardTitle>
              <CardDescription>{usageData.totalGenerations} AI generations in 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={usageData.byModel} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="model" tick={{ fontSize: 9 }} tickFormatter={(v) => v.split("-")[1] ?? v} />
                  <YAxis tick={{ fontSize: 10 }} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
                    formatter={(v, name) => [v, name === "count" ? "Generations" : "Tokens"]}
                  />
                  <Bar dataKey="count" fill="#60a5fa" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                <BarChart3 className="h-4 w-4 text-emerald-400" /> Usage by Mode
              </CardTitle>
              <CardDescription>How you use AI generation modes</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 pt-1">
                {usageData.byMode.sort((a,b) => b.count - a.count).map((item) => {
                  const total = usageData.byMode.reduce((s, m) => s + m.count, 0);
                  const pct = total > 0 ? Math.round((item.count / total) * 100) : 0;
                  const colors: Record<string,string> = { chat: "bg-violet-400", build: "bg-blue-400", agent: "bg-emerald-400", plan: "bg-amber-400" };
                  return (
                    <div key={item.mode} className="space-y-1">
                      <div className="flex justify-between text-xs">
                        <span className="capitalize font-medium">{item.mode}</span>
                        <span className="text-muted-foreground">{item.count} × ({pct}%)</span>
                      </div>
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className={"h-full rounded-full " + (colors[item.mode] ?? "bg-gray-400")} style={{ width: pct + "%" }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
