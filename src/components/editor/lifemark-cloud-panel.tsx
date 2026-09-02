/**
 * LifemarkCloudPanel — managed-backend hub modeled on Lovable Cloud.
 *
 * Tabs:
 *   - Overview      → status + region + instance + health summary
 *   - Database      → DatabaseManagerPanel (tables + SQL on the app backend)
 *   - Users & Auth  → wraps Supabase Auth UI
 *   - Storage       → links to existing storage-panel
 *   - Edge Functions → links to existing edge-functions-panel
 *   - Jobs          → pg_cron
 *   - Emails        → custom domain + auth templates (same as Lovable Cloud Emails)
 *   - AI            → built-in AI permission + secrets for LIFEMARK_API_KEY
 *   - Secrets       → links to existing secrets-vault-panel
 *   - Logs          → links to existing analytics
 *   - Usage         → segmented-bar breakdown by category
 *   - Advanced      → instance tier upgrade, region (read-only), danger zone
 */

import { useState,useEffect,useCallback } from "react";
import {
Cloud,Database,Lock,FolderOpen,Zap,Sparkles,KeyRound,
Activity,BarChart3,Settings,Loader2,MapPin,Cpu,
AlertCircle,RefreshCw,Server,
HeartPulse,ShieldCheck,Gauge,CalendarClock,Mail
} from "lucide-react";
import { CloudSlowQueries } from "./cloud-slow-queries";
import { CloudJobsPanel } from "./cloud-jobs-panel";
import { CloudLogsPanel } from "./cloud-logs-panel";
import { DatabaseManagerPanel } from "./database-manager-panel";
import { AppAuthPanel } from "./app-auth-panel";
import { StoragePanel } from "./storage-panel";
import { EdgeFunctionsPanel } from "./edge-functions-panel";
import { EnvPanel } from "./env-panel";
import { SecretsVaultPanel } from "./secrets-vault-panel";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import type { Project } from "@/types/database";
import {
CLOUD_TOOL_LABELS,
DEFAULT_CLOUD_TOOL_PERMISSIONS,
type CloudToolId,
type CloudToolPermission,
} from "@/lib/cloud/permissions";

interface LifemarkCloudPanelProps {
  project: Project & {
    cloud_enabled?: boolean;
    cloud_region?: string | null;
    cloud_instance?: string | null;
    cloud_status?: string | null;
    cloud_provisioned_at?: string | null;
  };
  files?: Array<{ path: string; content: string }>;
  onUpdateEnvFile?: (path: string, content: string) => void | Promise<void>;
}

interface Tier {
  tier: string;
  display_name: string;
  monthly_cents: number;
  ram_mb: number;
  cpu_units: number;
  description: string;
}

interface CloudStatus {
  project: any;
  tiers: Tier[];
  backups: Array<{ id: string; snapshot_id: string | null; run_date: string; status: string; notes: string | null }>;
}

/**
 * Shape of GET /api/cloud/health.
 *
 * `measured` is the important field. The route used to synthesize RAM, CPU and
 * disk from unrelated counts (file count, deploy count) and this panel rendered
 * them as live readings. Those fields no longer exist; everything below is read
 * from the managed Postgres instance, and `unavailable` names what genuinely
 * cannot be measured so the panel shows "n/a" rather than a number.
 */
interface HealthResp {
  status: "healthy" | "warning" | "unknown";
  measured: boolean;
  flags: string[];
  metrics: {
    uptime_hours?: number;
    db_size_mb?: number;
    active_connections?: number;
    max_connections?: number;
    connections_used_pct?: number;
    cache_hit_pct?: number | null;
    rollback_pct?: number | null;
    deadlocks?: number;
    table_count?: number;
  };
  capacity?: { ram_mb: number | null; cpu_units: number | null };
  unavailable?: string[];
  error?: string;
  summary: string;
}

interface UsageResp {
  days: number;
  totalCents: number;
  breakdown: Array<{ category: string; cents: number; pct: number; label: string }>;
}

const REGIONS = [
  { id: "americas",     label: "Americas",     flag: "🌎" },
  { id: "europe",       label: "Europe",       flag: "🇪🇺" },
  { id: "asia-pacific", label: "Asia Pacific", flag: "🌏" },
];

const TABS = [
  { id: "overview",  label: "Overview",       icon: Cloud },
  { id: "database",  label: "Database",       icon: Database },
  { id: "auth",      label: "Users & Auth",   icon: Lock },
  { id: "storage",   label: "Storage",        icon: FolderOpen },
  { id: "edge",      label: "Edge Functions", icon: Zap },
  { id: "jobs",      label: "Jobs",           icon: CalendarClock },
  { id: "emails",    label: "Emails",         icon: Mail },
  { id: "env",       label: "Env",            icon: KeyRound },
  { id: "ai",        label: "AI",             icon: Sparkles },
  { id: "secrets",   label: "Secrets",        icon: KeyRound },
  { id: "logs",      label: "Logs",           icon: Activity },
  { id: "performance", label: "Performance",  icon: Gauge },
  { id: "usage",     label: "Usage",          icon: BarChart3 },
  { id: "advanced",  label: "Advanced",       icon: Settings },
] as const;

type TabId = typeof TABS[number]["id"];

interface UserSupabaseProject {
  ref: string;
  name: string;
  region: string;
  status: string;
}

/**
 * "Bring your own Supabase project" — an alternative to provisioning a new
 * one through Lifemark Cloud above. Connects the user's own Supabase
 * account via OAuth (src/routes/api/oauth/start/$connector, connector
 * "supabase"), lists their existing projects, and links the chosen one's
 * URL + keys into this project's env vars (src/routes/api/supabase-connect).
 */
function ConnectExistingSupabase({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [projects, setProjects] = useState<UserSupabaseProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(false);
  const [linking, setLinking] = useState<string | null>(null);

  const checkConnected = useCallback(() => {
    fetch("/api/oauth/status")
      .then((r) => (r.ok ? r.json() : { connectors: [] }))
      .then((data: { connectors: string[] }) => setConnected((data.connectors ?? []).includes("supabase")))
      .catch(() => setConnected(false));
  }, []);

  useEffect(() => { checkConnected(); }, [checkConnected]);

  useEffect(() => {
    // Landed back here from /api/oauth/callback/supabase's redirect.
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth_success") === "supabase" || params.get("oauth_error")) {
      if (params.get("oauth_success") === "supabase") {
        toast({ title: "Connected", description: "Your Supabase account is connected." });
        checkConnected();
      } else {
        toast({ title: "Connection failed", description: `Couldn't connect Supabase (${params.get("oauth_error")}).`, variant: "destructive" });
      }
      params.delete("oauth_success");
      params.delete("oauth_error");
      const query = params.toString();
      window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!connected) return;
    setLoadingProjects(true);
    fetch("/api/supabase-connect/projects")
      .then((r) => (r.ok ? r.json() : { projects: [] }))
      .then((data: { projects: UserSupabaseProject[] }) => setProjects(data.projects ?? []))
      .catch(() => setProjects([]))
      .finally(() => setLoadingProjects(false));
  }, [connected]);

  async function linkProject(ref: string) {
    setLinking(ref);
    try {
      const res = await fetch("/api/supabase-connect/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, ref }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Couldn't link project", description: data.error ?? "Try again.", variant: "destructive" });
        return;
      }
      toast({ title: "Linked", description: `This project now points at ${data.url}. Its URL and keys are saved to Secrets.` });
    } finally {
      setLinking(null);
    }
  }

  if (connected === null) return null;

  if (!connected) {
    return (
      <Button
        variant="outline"
        className="w-full text-xs"
        onClick={() => {
          const returnTo = `${window.location.pathname}${window.location.search}`;
          window.location.href = `/api/oauth/start/supabase?returnTo=${encodeURIComponent(returnTo)}`;
        }}
      >
        Connect an existing Supabase project
      </Button>
    );
  }

  return (
    <div className="rounded-lg border border-border p-3 space-y-2">
      <p className="text-xs font-medium">Link an existing Supabase project</p>
      {loadingProjects ? (
        <div className="flex items-center justify-center py-3"><Loader2 className="w-4 h-4 animate-spin text-muted-foreground" /></div>
      ) : projects.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No Supabase projects found on your connected account.</p>
      ) : (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {projects.map((p) => (
            <button
              key={p.ref}
              disabled={linking !== null}
              onClick={() => linkProject(p.ref)}
              className="w-full flex items-center justify-between gap-2 text-left text-xs px-2 py-1.5 rounded-md border border-border hover:border-violet-500/40 hover:bg-violet-500/5 disabled:opacity-50"
            >
              <span className="truncate">{p.name}</span>
              {linking === p.ref ? <Loader2 className="w-3 h-3 animate-spin shrink-0" /> : <span className="text-[10px] text-muted-foreground shrink-0">{p.region}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function LifemarkCloudPanel({ project, files = [], onUpdateEnvFile }: LifemarkCloudPanelProps) {
  const { toast } = useToast();
  const [active, setActive] = useState<TabId>(() => {
    if (typeof window === "undefined") return "overview";
    try {
      const t = sessionStorage.getItem("lifemark-cloud-tab");
      if (t && TABS.some((x) => x.id === t)) {
        sessionStorage.removeItem("lifemark-cloud-tab");
        return t as TabId;
      }
    } catch { /* private mode */ }
    return "overview";
  });
  const [status, setStatus] = useState<CloudStatus | null>(null);
  const [health, setHealth] = useState<HealthResp | null>(null);
  const [usage, setUsage] = useState<UsageResp | null>(null);
  const [busy, setBusy] = useState(false);
  const [provisioningRegion, setProvisioningRegion] = useState<string>("americas");
  const [toolPermissions, setToolPermissions] = useState<Record<CloudToolId, CloudToolPermission>>(
    DEFAULT_CLOUD_TOOL_PERMISSIONS
  );
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);

  const loadStatus = useCallback(async () => {
    const res = await fetch(`/api/cloud/status?projectId=${project.id}`);
    if (res.ok) setStatus(await res.json());
  }, [project.id]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  useEffect(() => {
    const onTab = (event: Event) => {
      const id = (event as CustomEvent<string>).detail;
      if (TABS.some((tab) => tab.id === id)) setActive(id as TabId);
    };
    window.addEventListener("lifemark-cloud-open-tab", onTab);
    return () => window.removeEventListener("lifemark-cloud-open-tab", onTab);
  }, []);

  const cloudActive = !!project.cloud_enabled && project.cloud_status === "active";

  async function provision() {
    setBusy(true);
    try {
      const res = await fetch("/api/cloud/provision", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, region: provisioningRegion, instance: "tiny" }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Provisioning failed", description: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Cloud provisioned", description: data.message });
      await loadStatus();
    } finally { setBusy(false); }
  }

  async function upgradeTier(tier: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/cloud/provision", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: project.id, instance: tier }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Upgrade failed", description: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Instance updated", description: `Now on ${tier} tier.` });
      await loadStatus();
    } finally { setBusy(false); }
  }

  async function restoreBackup(snapshotId: string, runDate: string) {
    // Lovable-style restore: dry-run first to surface schema-affecting
    // changes, then confirm with the user before applying.
    setBusy(true);
    try {
      const dry = await fetch("/api/projects/snapshots/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId, projectId: project.id, dryRun: true }),
      });
      const dryData = await dry.json();
      if (!dry.ok) {
        toast({ title: "Restore failed", description: dryData.error, variant: "destructive" });
        return;
      }
      const schemaPaths: string[] = dryData?.schemaChanges?.schemaPaths ?? [];
      const warning = schemaPaths.length > 0
        ? `\n\nWarning: this restore changes schema files (${schemaPaths.slice(0, 3).join(", ")}${schemaPaths.length > 3 ? "…" : ""}). Your app may need patching afterwards.`
        : "";
      if (!window.confirm(
        `Restore the ${runDate} backup?\n\nRestoring is permanent — files changed after this backup will be lost.${warning}`
      )) return;

      const res = await fetch("/api/projects/snapshots/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ snapshotId, projectId: project.id, confirmSchema: true }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Restore failed", description: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Backup restored", description: `Project rolled back to ${runDate}. Reload the editor to see the restored files.` });
      window.dispatchEvent(new CustomEvent("lifemark-refresh-preview"));
    } finally { setBusy(false); }
  }

  async function runHealthCheck() {
    setBusy(true);
    setHealth(null);
    try {
      const res = await fetch(`/api/cloud/health?projectId=${project.id}`);
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Health check failed", description: data.error, variant: "destructive" });
        return;
      }
      setHealth(data);
    } finally { setBusy(false); }
  }

  async function loadUsage() {
    const res = await fetch(`/api/cloud/usage?projectId=${project.id}&days=7`);
    if (res.ok) setUsage(await res.json());
  }

  useEffect(() => {
    if (active === "usage") void loadUsage();
  }, [active, project.id]);

  async function loadPermissions() {
    const res = await fetch("/api/cloud/permissions");
    if (res.ok) {
      const data = await res.json();
      setToolPermissions(data.permissions ?? DEFAULT_CLOUD_TOOL_PERMISSIONS);
    }
    setPermissionsLoaded(true);
  }

  useEffect(() => {
    if (active === "advanced" && !permissionsLoaded) void loadPermissions();
  }, [active, permissionsLoaded]);

  async function savePermission(tool: CloudToolId, value: CloudToolPermission) {
    const next = { ...toolPermissions, [tool]: value };
    setToolPermissions(next);
    const res = await fetch("/api/cloud/permissions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ permissions: { [tool]: value } }),
    });
    if (!res.ok) {
      toast({ title: "Failed to save permission", variant: "destructive" });
      void loadPermissions();
      return;
    }
    toast({ title: "Permission updated", description: `${CLOUD_TOOL_LABELS[tool].label}: ${value}` });
  }

  // ── Render: not provisioned yet → enablement card ────────────────────────────
  if (!cloudActive) {
    return (
      <div className="flex flex-col h-full bg-background">
        <div className="px-4 py-3 border-b border-border shrink-0 flex items-center gap-2">
          <Cloud className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold">Lifemark Cloud</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/15 text-violet-700 dark:text-violet-300 ml-auto">Inactive</span>
        </div>
        <div className="flex-1 overflow-y-auto p-5">
          <div className="max-w-md mx-auto space-y-5">
            <div className="text-center">
              <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-violet-500/20 to-purple-500/20 border border-violet-500/30 flex items-center justify-center mx-auto mb-3">
                <Cloud className="w-7 h-7 text-violet-700 dark:text-violet-300" />
              </div>
              <h2 className="text-lg font-semibold">Enable Lifemark Cloud</h2>
              <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                Hosted Postgres, auth, storage, edge functions, and built-in AI — no infrastructure setup. Starts on the Tiny tier (free).
              </p>
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">Hosting region</label>
              <div className="grid grid-cols-3 gap-1.5">
                {REGIONS.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => setProvisioningRegion(r.id)}
                    className={`text-xs px-2 py-2 rounded-lg border transition-all ${
                      provisioningRegion === r.id
                        ? "border-violet-500/50 bg-violet-500/10 text-violet-800 dark:text-violet-200"
                        : "border-border hover:border-violet-500/30 text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    <div className="text-base">{r.flag}</div>
                    <div className="mt-0.5">{r.label}</div>
                  </button>
                ))}
              </div>
              <p className="text-[10px] text-muted-foreground/60 mt-1">Region cannot be changed after provisioning.</p>
            </div>

            <div className="rounded-lg border border-amber-500/25 bg-amber-500/[0.04] p-3">
              <div className="flex items-start gap-2">
                <AlertCircle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-amber-800/80 dark:text-amber-200/80 leading-relaxed">
                  Enabling Cloud creates a managed backend bundle. You can switch tiers later but the region is locked.
                </p>
              </div>
            </div>

            <Button
              onClick={provision}
              disabled={busy}
              className="w-full bg-gradient-to-r from-violet-600 to-purple-600 hover:opacity-90"
            >
              {busy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Cloud className="w-4 h-4 mr-2" />}
              Enable Cloud
            </Button>

            <div className="relative py-1 text-center">
              <div className="absolute inset-x-0 top-1/2 h-px bg-border" />
              <span className="relative bg-background px-2 text-[10px] text-muted-foreground">or</span>
            </div>

            <ConnectExistingSupabase projectId={project.id} />

            {onUpdateEnvFile && (
              <div className="rounded-xl border border-border overflow-hidden min-h-[16rem]">
                <EnvPanel projectId={project.id} files={files} onUpdateFile={onUpdateEnvFile} />
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Render: provisioned → tabbed interface ──────────────────────────────────
  const region = REGIONS.find((r) => r.id === project.cloud_region);
  const instance = status?.tiers.find((t) => t.tier === project.cloud_instance);

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border shrink-0">
        <div className="flex items-center gap-2 mb-1.5">
          <Cloud className="w-4 h-4 text-violet-400" />
          <span className="text-sm font-semibold">Lifemark Cloud</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 ml-auto flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Active
          </span>
        </div>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1"><MapPin className="w-2.5 h-2.5" /> {region?.flag} {region?.label}</span>
          <span className="text-muted-foreground/40">·</span>
          <span className="flex items-center gap-1"><Cpu className="w-2.5 h-2.5" /> {instance?.display_name ?? project.cloud_instance}</span>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex flex-wrap border-b border-border shrink-0 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setActive(t.id as TabId)}
            className={`flex items-center gap-1.5 px-3 py-2 text-[11px] font-medium border-b-2 transition-colors whitespace-nowrap ${
              active === t.id
                ? "border-violet-500 text-violet-700 dark:text-violet-300"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <t.icon className="w-3 h-3" />
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {active === "overview" && (
          <div className="space-y-4">
            {/* Health-check card */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <HeartPulse className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm font-medium">Database health</span>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={runHealthCheck} disabled={busy}>
                  {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
                  Run check
                </Button>
              </div>
              {health ? (
                <div className="space-y-2">
                  <div className={`text-xs ${health.status === "healthy" ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>
                    {health.status === "healthy" ? "✓ " : "⚠ "}{health.summary}
                  </div>
                  {/* Only measured values. RAM and CPU tiles are gone: the route
                      used to derive them from file and deploy counts, so they were
                      confident-looking numbers about nothing. What replaces them
                      comes from pg_stat_database on the real instance. */}
                  {health.measured === false ? (
                    <div className="text-[11px] text-muted-foreground">
                      No live metrics available for this project.
                      {health.error ? ` (${health.error})` : ""}
                    </div>
                  ) : (
                    <div className="grid grid-cols-3 gap-2 text-[11px]">
                      <Metric label="Uptime" value={`${health.metrics.uptime_hours ?? "–"}h`} sub="since restart" />
                      <Metric label="DB size" value={`${health.metrics.db_size_mb ?? "–"} MB`} sub="on disk" />
                      <Metric label="Conns"  value={`${health.metrics.active_connections ?? "–"}/${health.metrics.max_connections ?? "–"}`} sub={`${health.metrics.connections_used_pct ?? 0}% used`} />
                      <Metric label="Cache hit" value={health.metrics.cache_hit_pct == null ? "n/a" : `${health.metrics.cache_hit_pct}%`} sub="buffer cache" />
                      <Metric label="Rollbacks" value={health.metrics.rollback_pct == null ? "n/a" : `${health.metrics.rollback_pct}%`} sub={`${health.metrics.deadlocks ?? 0} deadlocks`} />
                      <Metric label="Tables" value={`${health.metrics.table_count ?? "–"}`} sub="public schema" />
                    </div>
                  )}
                  {health.capacity?.ram_mb ? (
                    <div className="text-[10px] text-muted-foreground">
                      Instance capacity: {health.capacity.ram_mb} MB RAM
                      {health.capacity.cpu_units ? `, ${health.capacity.cpu_units} CPU units` : ""}.
                      {health.unavailable?.length
                        ? ` Live ${health.unavailable.join(" and ").replace(/_/g, " ")} are not measurable from here.`
                        : ""}
                    </div>
                  ) : null}
                </div>
              ) : (
                <p className="text-[11px] text-muted-foreground">Click <em>Run check</em> for a real-time snapshot of connections, memory, disk, and uptime.</p>
              )}
            </div>

            {/* Auto-backups */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <Server className="w-4 h-4 text-blue-400" />
                  <span className="text-sm font-medium">Daily auto-backups</span>
                </div>
                <span className="text-[10px] text-muted-foreground">~14 days retained</span>
              </div>
              {(status?.backups?.length ?? 0) === 0 ? (
                <p className="text-[11px] text-muted-foreground">
                  Auto-backups run nightly. None yet — first one will appear here after the next daily cron tick.
                </p>
              ) : (
                <ul className="space-y-1.5">
                  {status?.backups.slice(0, 7).map((b) => (
                    <li key={b.id} className="flex items-center gap-2 text-[11px]">
                      <span className={`w-1.5 h-1.5 rounded-full ${b.status === "ok" ? "bg-emerald-400" : "bg-red-400"}`} />
                      <span className="font-mono">{b.run_date}</span>
                      <span className="text-muted-foreground capitalize">{b.status}</span>
                      {b.notes && <span className="text-muted-foreground/60 text-[10px]">{b.notes}</span>}
                      {b.status === "ok" && b.snapshot_id && (
                        <button
                          onClick={() => void restoreBackup(b.snapshot_id!, b.run_date)}
                          disabled={busy}
                          className="ml-auto text-[10px] px-2 py-0.5 rounded border border-border hover:bg-accent text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                        >
                          Restore
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}

        {active === "database" && (
          <DatabaseManagerPanel
            projectId={project.id}
            isLocked={(project as { environment?: string }).environment === "live"}
          />
        )}

        {active === "auth" && (
          <AppAuthPanel project={project} />
        )}

        {active === "storage" && (
          <StoragePanel projectId={project.id} />
        )}

        {active === "edge" && (
          <EdgeFunctionsPanel projectId={project.id} />
        )}

        {active === "jobs" && <CloudJobsPanel projectId={project.id} />}

        {active === "emails" && <CustomEmailsPanel />}
        {active === "env" && onUpdateEnvFile && (
          <EnvPanel projectId={project.id} files={files} onUpdateFile={onUpdateEnvFile} />
        )}

        {active === "performance" && <CloudSlowQueries projectId={project.id} />}

        {active === "ai" && (
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <h3 className="text-sm font-medium">Built-in AI</h3>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Generated apps can call Lifemark AI through the gateway without shipping OpenAI keys.
              Usage bills the project owner&apos;s credit balance. Permission is currently{" "}
              <span className="font-medium text-foreground">{toolPermissions.ai}</span>
              {" "}(change it under Advanced).
            </p>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Store <code className="text-[10px]">LIFEMARK_API_KEY</code> in Secrets so edge functions
              can authenticate. The key is injected at provision time when the AI gateway is configured.
            </p>
            <div className="flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setActive("secrets")}
              >
                Open secrets
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setActive("env")}
              >
                App env vars
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => setActive("advanced")}
              >
                AI permission
              </Button>
            </div>
          </div>
        )}

        {active === "secrets" && (
          <SecretsVaultPanel projectId={project.id} />
        )}

        {active === "logs" && <CloudLogsPanel projectId={project.id} />}

        {active === "usage" && (
          <div className="space-y-3">
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm font-medium">Last {usage?.days ?? 7} days</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  ${(((usage?.totalCents ?? 0)) / 100).toFixed(2)}
                </span>
              </div>
              {/* Segmented bar */}
              <div className="h-2 w-full rounded-full overflow-hidden flex bg-muted/30 mb-3">
                {(usage?.breakdown ?? []).map((c, i) => (
                  <div
                    key={c.category}
                    className={[
                      "h-full",
                      ["bg-violet-500", "bg-blue-500", "bg-cyan-500", "bg-emerald-500", "bg-amber-500", "bg-pink-500", "bg-purple-500"][i % 7],
                    ].join(" ")}
                    style={{ width: `${c.pct}%` }}
                    title={`${c.label}: ${c.pct}%`}
                  />
                ))}
              </div>
              <ul className="space-y-1.5 text-[11px]">
                {(usage?.breakdown ?? []).map((c, i) => (
                  <li key={c.category} className="flex items-center gap-2">
                    <span className={[
                      "w-2 h-2 rounded-sm shrink-0",
                      ["bg-violet-500", "bg-blue-500", "bg-cyan-500", "bg-emerald-500", "bg-amber-500", "bg-pink-500", "bg-purple-500"][i % 7],
                    ].join(" ")} />
                    <span className="flex-1">{c.label}</span>
                    <span className="tabular-nums text-muted-foreground">{c.pct}%</span>
                    <span className="tabular-nums w-12 text-right">${(c.cents / 100).toFixed(2)}</span>
                  </li>
                ))}
              </ul>
              {(usage?.totalCents ?? 0) === 0 && (
                <p className="text-[11px] text-muted-foreground mt-2">No usage recorded yet. Costs update daily at 10 AM UTC.</p>
              )}
            </div>
          </div>
        )}

        {active === "advanced" && (
          <div className="space-y-4">
            {/* AI tool permissions */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-1">
                <ShieldCheck className="w-4 h-4 text-violet-400" />
                <span className="text-sm font-medium">AI tool permissions</span>
              </div>
              <p className="text-[11px] text-muted-foreground mb-3 leading-relaxed">
                Control how the AI uses Lifemark Cloud tools — Allow runs automatically, Ask prompts you first, Never blocks the action.
              </p>
              <div className="space-y-2">
                {(Object.keys(CLOUD_TOOL_LABELS) as CloudToolId[]).map((tool) => {
                  const meta = CLOUD_TOOL_LABELS[tool];
                  return (
                    <div key={tool} className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-muted/10">
                      <div className="flex-1 min-w-0">
                        <div className="text-[11px] font-medium">{meta.label}</div>
                        <div className="text-[10px] text-muted-foreground truncate">{meta.description}</div>
                      </div>
                      <select
                        value={toolPermissions[tool]}
                        onChange={(e) => void savePermission(tool, e.target.value as CloudToolPermission)}
                        disabled={busy}
                        className="text-[10px] px-2 py-1 rounded-md border border-border bg-background shrink-0"
                      >
                        <option value="allow">Allow</option>
                        <option value="ask">Ask</option>
                        <option value="never">Never</option>
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Instance tier picker */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-3">
                <Cpu className="w-4 h-4 text-blue-400" />
                <span className="text-sm font-medium">Instance tier</span>
              </div>
              <div className="grid gap-2">
                {(status?.tiers ?? []).map((t) => {
                  const isCurrent = t.tier === project.cloud_instance;
                  return (
                    <button
                      key={t.tier}
                      disabled={isCurrent || busy}
                      onClick={() => void upgradeTier(t.tier)}
                      className={`flex items-center gap-3 p-3 rounded-lg border text-left transition-all ${
                        isCurrent
                          ? "border-violet-500/50 bg-violet-500/10"
                          : "border-border hover:border-violet-500/30 hover:bg-muted/30"
                      }`}
                    >
                      <div className="flex-1">
                        <div className="text-sm font-medium flex items-center gap-2">
                          {t.display_name}
                          {isCurrent && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-500/20 text-violet-700 dark:text-violet-300">Current</span>}
                        </div>
                        <div className="text-[11px] text-muted-foreground">{t.description}</div>
                        <div className="text-[10px] text-muted-foreground/70 mt-0.5">
                          {t.ram_mb} MB RAM · {t.cpu_units} CPU
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-semibold tabular-nums">
                          {t.monthly_cents === 0 ? "Free" : `$${(t.monthly_cents / 100).toFixed(0)}`}
                        </div>
                        {t.monthly_cents > 0 && <div className="text-[10px] text-muted-foreground">/ month</div>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Region */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <MapPin className="w-4 h-4 text-emerald-400" />
                <span className="text-sm font-medium">Region</span>
                <span className="text-[10px] text-muted-foreground ml-auto">Locked</span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {region?.flag} {region?.label} — selected when Cloud was first provisioned. Region cannot be changed.
              </p>
            </div>

            {/* Export project data */}
            <div className="rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2 mb-2">
                <Database className="w-4 h-4 text-sky-400" />
                <span className="text-sm font-medium">Export project data</span>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
                Download your database as a SQL dump (schema + data) — use it before moving backend
                infrastructure outside Lifemark Cloud, or as an extra backup.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="text-xs"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const res = await fetch(`/api/cloud/export?projectId=${project.id}`);
                      if (!res.ok) {
                        const data = await res.json().catch(() => ({}));
                        toast({ title: "Export failed", description: (data as { error?: string }).error, variant: "destructive" });
                        return;
                      }
                      const blob = await res.blob();
                      const url = URL.createObjectURL(blob);
                      const a = document.createElement("a");
                      a.href = url;
                      a.download = `${project.name.replace(/[^\w-]+/g, "-")}-database-export.sql`;
                      a.click();
                      URL.revokeObjectURL(url);
                      toast({ title: "Database exported", description: "SQL dump downloaded." });
                    } finally { setBusy(false); }
                  }}
                >
                  Export database
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-xs"
                  disabled={busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const res = await fetch("/api/cloud/export", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({ projectId: project.id, email: true }),
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) {
                        toast({
                          title: "Email export failed",
                          description: (data as { error?: string }).error,
                          variant: "destructive",
                        });
                        return;
                      }
                      toast({
                        title: "Export emailed",
                        description: `Sent to ${(data as { emailedTo?: string }).emailedTo ?? "your account email"}.`,
                      });
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  Email me the dump
                </Button>
              </div>
            </div>

            {/* Pause Cloud */}
            <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.04] p-4">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-amber-400" />
                <span className="text-sm font-medium text-amber-800 dark:text-amber-200">
                  {project.cloud_status === "paused" ? "Cloud is paused" : "Pause Cloud"}
                </span>
              </div>
              <p className="text-[11px] text-amber-800/70 dark:text-amber-200/70 leading-relaxed mb-3">
                {project.cloud_status === "paused"
                  ? "The backend (database, auth, storage, functions) is offline and not using compute credits. Wake it up to bring your app back online — takes a few minutes."
                  : "Pausing stops compute usage while keeping your data. The live app stops working until you resume. Idle projects auto-pause after 14 days."}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="text-xs border-amber-500/40 text-amber-700 dark:text-amber-300 hover:bg-amber-500/10"
                disabled={busy}
                onClick={async () => {
                  const action = project.cloud_status === "paused" ? "wake" : "pause";
                  if (action === "pause" && !confirm("Pause the Cloud backend? Your deployed app can't read or write data until you resume.")) return;
                  setBusy(true);
                  try {
                    const res = await fetch("/api/cloud/pause", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ projectId: project.id, action }),
                    });
                    const data = await res.json().catch(() => ({}));
                    if (!res.ok) {
                      toast({ title: "Action failed", description: (data as { error?: string }).error, variant: "destructive" });
                      return;
                    }
                    toast({ title: action === "pause" ? "Cloud paused" : "Waking up…", description: action === "wake" ? "The backend will be online in a few minutes." : undefined });
                    await loadStatus();
                  } finally { setBusy(false); }
                }}
              >
                {project.cloud_status === "paused" ? "Wake up" : "Pause Cloud"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Metric({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/10 p-2">
      <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[9px] text-muted-foreground/60 truncate">{sub}</div>
    </div>
  );
}
