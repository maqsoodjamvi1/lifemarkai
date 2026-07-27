/**
 * Self-contained dashboard page bodies for the TanStack shell.
 * Full Next BillingPage/TeamPage trees depend on many platform libs;
 * these render real loader data and call proxied `/api/*` endpoints.
 */
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import type { Profile } from "@/types/database";
import type { User } from "@supabase/supabase-js";

export function ProjectsShellPage({
  user,
  profile,
  projects,
}: {
  user: User;
  profile: Profile | null;
  projects: any[];
}) {
  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <DashboardHeader user={user} profile={profile} />
      <div className="flex-1 overflow-y-auto p-6 md:p-8">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold">All Projects</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {projects.length} project{projects.length !== 1 ? "s" : ""} total
            </p>
          </div>
          <Link to="/dashboard" search={{ new: "true" } as never}>
            <Button>New project</Button>
          </Link>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {projects.map((p) => (
            <Link
              key={p.id}
              to="/editor/$projectId"
              params={{ projectId: p.id }}
              className="rounded-xl border border-border bg-card p-4 hover:border-violet-500/40 transition-colors"
            >
              <div className="font-semibold truncate">{p.name}</div>
              <div className="text-xs text-muted-foreground mt-1">
                {p.framework ?? "react"} · {p.status ?? "draft"}
              </div>
            </Link>
          ))}
          {projects.length === 0 && (
            <p className="text-sm text-muted-foreground col-span-full">No projects yet.</p>
          )}
        </div>
      </div>
    </div>
  );
}

export function BillingShellPage({
  user,
  profile,
  creditLogs,
  teams,
}: {
  user: User;
  profile: Profile | null;
  creditLogs: any[];
  teams: { id: string; name: string; credits: number; role: string }[];
}) {
  const credits = (profile as any)?.credits ?? 0;
  const plan = (profile as any)?.plan ?? "free";

  async function openPortal() {
    const res = await fetch("/api/billing/portal", { method: "POST" });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  }

  async function checkout(planKey: string) {
    const res = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ plan: planKey, billing: "monthly" }),
    });
    const data = await res.json();
    if (data.url) window.location.href = data.url;
  }

  return (
    <div className="flex-1 overflow-auto">
      <DashboardHeader user={user} profile={profile} compact />
      <div className="max-w-3xl mx-auto px-6 py-8 space-y-8">
        <div>
          <h1 className="text-2xl font-bold">Billing & Credits</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Plan <span className="text-foreground font-medium">{plan}</span> ·{" "}
            <span className="text-violet-400 font-semibold">{credits}</span> credits
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => checkout("pro")}>Upgrade to Pro</Button>
          <Button variant="outline" onClick={() => checkout("team")}>
            Team plan
          </Button>
          <Button variant="outline" onClick={openPortal}>
            Stripe portal
          </Button>
        </div>
        {teams.length > 0 && (
          <div>
            <h2 className="font-semibold mb-2">Team credit pools</h2>
            <ul className="space-y-2 text-sm">
              {teams.map((t) => (
                <li key={t.id} className="rounded-lg border border-border px-3 py-2 flex justify-between">
                  <span>
                    {t.name} <span className="text-muted-foreground">({t.role})</span>
                  </span>
                  <span className="text-violet-400">{t.credits} credits</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <h2 className="font-semibold mb-2">Recent credit activity</h2>
          <ul className="space-y-1 text-sm max-h-80 overflow-y-auto">
            {creditLogs.slice(0, 40).map((log) => (
              <li
                key={log.id ?? `${log.created_at}-${log.reason}`}
                className="flex justify-between border-b border-border/40 py-1.5"
              >
                <span className="text-muted-foreground">{log.reason ?? "usage"}</span>
                <span>{log.amount}</span>
              </li>
            ))}
            {creditLogs.length === 0 && (
              <li className="text-muted-foreground">No credit logs yet.</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function AnalyticsShellPage({
  user,
  profile,
  projects,
  creditLogs,
  deployments,
}: {
  user: User;
  profile: Profile | null;
  projects: any[];
  creditLogs: any[];
  deployments: any[];
}) {
  const spent = creditLogs
    .filter((l) => Number(l.amount) < 0)
    .reduce((s, l) => s + Math.abs(Number(l.amount) || 0), 0);

  return (
    <div className="flex-1 overflow-auto">
      <DashboardHeader user={user} profile={profile} compact />
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: "Projects", value: projects.length },
            { label: "Credits spent", value: spent.toFixed(1) },
            { label: "Deployments", value: deployments.length },
            { label: "Plan", value: (profile as any)?.plan ?? "free" },
          ].map((s) => (
            <div key={s.label} className="rounded-xl border border-border p-4">
              <div className="text-xs text-muted-foreground">{s.label}</div>
              <div className="text-xl font-semibold mt-1">{s.value}</div>
            </div>
          ))}
        </div>
        <div>
          <h2 className="font-semibold mb-2">Projects</h2>
          <ul className="text-sm space-y-1">
            {projects.map((p) => (
              <li key={p.id} className="flex justify-between border-b border-border/40 py-1.5">
                <Link to="/editor/$projectId" params={{ projectId: p.id }} className="hover:underline">
                  {p.name}
                </Link>
                <span className="text-muted-foreground">{p.framework}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}

export function TeamShellPage({
  user,
  profile,
  personalProjects,
  teams,
}: {
  user: User;
  profile: Profile | null;
  personalProjects: any[];
  teams: Array<{ team: any; members: any[]; projects: any[] }>;
}) {
  return (
    <div className="flex-1 overflow-auto">
      <DashboardHeader user={user} profile={profile} compact />
      <div className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Team</h1>
          <Link to="/dashboard/people">
            <Button variant="outline" size="sm">
              People
            </Button>
          </Link>
        </div>
        {teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            You are not on a team yet. Invite collaborators from People, or start a Team plan
            under Billing.
          </p>
        ) : (
          teams.map(({ team, members, projects }) => (
            <div key={team.id} className="rounded-xl border border-border p-5 space-y-3">
              <div className="flex justify-between items-baseline">
                <h2 className="font-semibold text-lg">{team.name}</h2>
                <span className="text-xs text-muted-foreground">
                  {team.plan} · {team.credits} credits
                </span>
              </div>
              <p className="text-sm text-muted-foreground">
                {members.length} members · {projects.length} team projects ·{" "}
                {personalProjects.length} personal projects
              </p>
              <ul className="text-sm space-y-1">
                {members.slice(0, 12).map((m) => (
                  <li key={m.id} className="flex justify-between">
                    <span>
                      {(m.profiles as any)?.full_name ||
                        m.invited_email ||
                        (m.profiles as any)?.email ||
                        "Member"}
                    </span>
                    <span className="text-muted-foreground">{m.role}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
