
import { useState,useEffect,useCallback,useMemo } from "react";
import {
HeartPulse,Loader2,RefreshCw,Wrench,Check,X,
ShieldAlert,AlertTriangle,AlertCircle,Info,Sparkles,Lock,
ChevronDown,ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import { DiffViewer,computeFileDiff,type FileState } from "@/components/editor/diff-viewer";
import type { ProjectFile } from "@/types/database";

interface SelfHealingPanelProps {
  projectId: string;
  files?: ProjectFile[];
  isLocked?: boolean; // Live environment — apply_fix blocked (migration 046)
  onFilesRefresh?: () => Promise<void> | void;
}

type Severity = "critical" | "error" | "warning" | "info";
type FindingStatus = "open" | "fix_proposed" | "fixed" | "dismissed";

interface HealthFinding {
  id: string;
  category: "build" | "runtime" | "dependency" | "security" | "performance" | "accessibility";
  severity: Severity;
  title: string;
  detail: string | null;
  file_path: string | null;
  status: FindingStatus;
  proposed_fix: { summary?: string; files?: Array<{ path: string; content: string }> } | null;
  created_at: string;
}

const SEVERITY_ORDER: Severity[] = ["critical", "error", "warning", "info"];

const SEVERITY_META: Record<Severity, { label: string; icon: React.ReactNode; badge: string }> = {
  critical: {
    label: "Critical",
    icon: <ShieldAlert className="w-3.5 h-3.5 text-red-400 shrink-0" />,
    badge: "border-red-500/40 text-red-400",
  },
  error: {
    label: "Error",
    icon: <AlertCircle className="w-3.5 h-3.5 text-orange-400 shrink-0" />,
    badge: "border-orange-500/40 text-orange-400",
  },
  warning: {
    label: "Warning",
    icon: <AlertTriangle className="w-3.5 h-3.5 text-yellow-400 shrink-0" />,
    badge: "border-yellow-500/40 text-yellow-400",
  },
  info: {
    label: "Info",
    icon: <Info className="w-3.5 h-3.5 text-sky-400 shrink-0" />,
    badge: "border-sky-500/40 text-sky-400",
  },
};

const CATEGORY_LABEL: Record<HealthFinding["category"], string> = {
  build: "Build",
  runtime: "Runtime",
  dependency: "Dependency",
  security: "Security",
  performance: "Performance",
  accessibility: "A11y",
};

export function SelfHealingPanel({ projectId, files = [], isLocked, onFilesRefresh }: SelfHealingPanelProps) {
  const [findings, setFindings] = useState<HealthFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [showResolved, setShowResolved] = useState(false);
  const [expandedDiffId, setExpandedDiffId] = useState<string | null>(null);
  /** Per-finding accept/revert state for proposed fix files. */
  const [fixFileStates, setFixFileStates] = useState<Record<string, Record<string, FileState>>>({});

  const fileContentByPath = useMemo(() => {
    const map = new Map<string, string>();
    for (const f of files) map.set(f.path, f.content ?? "");
    return map;
  }, [files]);
  type MonitoringState = {
    enabled: boolean;
    cadence: "daily" | "weekly";
    last_run_at?: string | null;
    last_email_at?: string | null;
    history?: Array<{ at: string; findings: number; emailed: boolean }>;
  };
  const [monitoring, setMonitoring] = useState<MonitoringState | null>(null);

  useEffect(() => {
    void fetch(`/api/projects/${projectId}/monitoring`)
      .then(async (res) => {
        if (!res.ok) return;
        const data = await res.json();
        const m = data.monitoring as {
          enabled?: boolean;
          cadence?: string;
          last_run_at?: string;
          last_email_at?: string;
          history?: Array<{ at: string; findings: number; emailed: boolean }>;
        } | undefined;
        setMonitoring({
          enabled: !!m?.enabled,
          cadence: m?.cadence === "weekly" ? "weekly" : "daily",
          last_run_at: m?.last_run_at ?? null,
          last_email_at: m?.last_email_at ?? null,
          history: Array.isArray(m?.history) ? m.history.slice(0, 10) : [],
        });
      })
      .catch(() => {});
  }, [projectId]);

  async function saveMonitoring(enabled: boolean, cadence: "daily" | "weekly") {
    setMonitoring((prev) => ({
      enabled,
      cadence,
      last_run_at: prev?.last_run_at,
      last_email_at: prev?.last_email_at,
      history: prev?.history ?? [],
    }));
    try {
      const res = await fetch(`/api/projects/${projectId}/monitoring`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled, cadence }),
      });
      if (!res.ok) throw new Error();
      toast({ title: enabled ? `Monitoring on (${cadence})` : "Monitoring off" });
    } catch {
      setMonitoring((m) => (m ? { ...m, enabled: !enabled } : m));
      toast({ title: "Couldn't update monitoring", variant: "destructive" });
    }
  }

  function formatMonitorTime(iso?: string | null) {
    if (!iso) return "—";
    try {
      return new Date(iso).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return "—";
    }
  }

  const loadFindings = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/health`);
      if (!res.ok) throw new Error("load failed");
      const data = await res.json();
      setFindings(data.findings ?? []);
    } catch {
      toast({ title: "Failed to load health findings", variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { loadFindings(); }, [loadFindings]);

  async function postAction(body: Record<string, unknown>): Promise<Response> {
    return fetch(`/api/projects/${projectId}/health`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  async function runScan() {
    setScanning(true);
    try {
      const res = await postAction({ action: "scan" });
      if (!res.ok) throw new Error((await res.json()).error ?? "Scan failed");
      const data = await res.json();
      toast({ title: `Scan complete — ${data.findings} issue${data.findings !== 1 ? "s" : ""} detected` });
      await loadFindings();
    } catch (err) {
      toast({
        title: "Scan failed",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setScanning(false);
    }
  }

  async function proposeFix(finding: HealthFinding) {
    setBusyId(finding.id);
    try {
      const res = await postAction({ action: "propose_fix", findingId: finding.id });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Propose fix failed");
      toast({ title: "Fix proposed", description: data.finding?.proposed_fix?.summary });
      await loadFindings();
    } catch (err) {
      toast({
        title: "Could not propose a fix",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  function ensureFixStates(finding: HealthFinding): Record<string, FileState> {
    const existing = fixFileStates[finding.id];
    if (existing) return existing;
    const next: Record<string, FileState> = {};
    for (const f of finding.proposed_fix?.files ?? []) next[f.path] = "accepted";
    return next;
  }

  function setPathState(findingId: string, path: string, state: FileState) {
    setFixFileStates((prev) => ({
      ...prev,
      [findingId]: { ...(prev[findingId] ?? {}), [path]: state },
    }));
  }

  async function applyFix(finding: HealthFinding) {
    const states = ensureFixStates(finding);
    const acceptedPaths = (finding.proposed_fix?.files ?? [])
      .map((f) => f.path)
      .filter((p) => (states[p] ?? "accepted") !== "reverted");
    if (acceptedPaths.length === 0) {
      toast({
        title: "Nothing to apply",
        description: "Accept at least one file in the diff, or dismiss the finding.",
        variant: "destructive",
      });
      return;
    }

    setBusyId(finding.id);
    try {
      const res = await postAction({
        action: "apply_fix",
        findingId: finding.id,
        paths: acceptedPaths,
      });
      const data = await res.json();
      if (res.status === 423) {
        toast({
          title: "Project is Live",
          description: "Switch to the Test environment to apply fixes.",
          variant: "destructive",
        });
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "Apply failed");
      toast({ title: `Fix applied — ${data.applied} file${data.applied !== 1 ? "s" : ""} updated` });
      setExpandedDiffId(null);
      setFixFileStates((prev) => {
        const next = { ...prev };
        delete next[finding.id];
        return next;
      });
      await loadFindings();
      await onFilesRefresh?.();
    } catch (err) {
      toast({
        title: "Could not apply the fix",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(finding: HealthFinding) {
    setBusyId(finding.id);
    try {
      const res = await postAction({ action: "dismiss", findingId: finding.id });
      if (!res.ok) throw new Error((await res.json()).error ?? "Dismiss failed");
      await loadFindings();
    } catch (err) {
      toast({
        title: "Could not dismiss",
        description: err instanceof Error ? err.message : undefined,
        variant: "destructive",
      });
    } finally {
      setBusyId(null);
    }
  }

  const active = findings.filter((f) => f.status === "open" || f.status === "fix_proposed");
  const resolved = findings.filter((f) => f.status === "fixed" || f.status === "dismissed");

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-3">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        <p className="text-xs text-muted-foreground">Loading health findings…</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <HeartPulse className="w-4 h-4 text-rose-400" />
          <h2 className="font-semibold text-foreground">Self-Healing</h2>
          {active.length > 0 && (
            <Badge variant="outline" className="ml-auto text-[10px] h-5 px-1.5 border-rose-500/40 text-rose-400">
              {active.length} open
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          Static health scans over your codebase — fixes are only applied after your approval.
        </p>
        {isLocked && (
          <div className="mt-2 flex items-center gap-1.5 text-[10px] text-yellow-400">
            <Lock className="w-3 h-3" /> Live environment — fixes can be proposed but not applied.
          </div>
        )}
      </div>

      {/* Findings grouped by severity */}
      <div className="flex-1 overflow-y-auto p-3 space-y-4">
        {active.length === 0 && (
          <div className="flex flex-col items-center gap-3 py-10 text-center">
            <Check className="w-7 h-7 text-emerald-400/60" />
            <p className="text-sm font-medium text-foreground">No open findings</p>
            <p className="text-xs text-muted-foreground">Run a scan to check build, dependencies, security, and performance.</p>
          </div>
        )}

        {SEVERITY_ORDER.map((sev) => {
          const group = active.filter((f) => f.severity === sev);
          if (group.length === 0) return null;
          const meta = SEVERITY_META[sev];
          return (
            <div key={sev} className="space-y-2">
              <div className="flex items-center gap-1.5 px-1">
                {meta.icon}
                <span className="text-xs font-semibold text-foreground">{meta.label}</span>
                <span className="text-[10px] text-muted-foreground">({group.length})</span>
              </div>
              {group.map((finding) => {
                const busy = busyId === finding.id;
                return (
                  <div key={finding.id} className="rounded-xl border border-border p-3 space-y-1.5">
                    <div className="flex items-start gap-2">
                      <p className="text-xs font-medium text-foreground flex-1">{finding.title}</p>
                      <Badge variant="outline" className={`text-[9px] h-4 px-1 shrink-0 ${meta.badge}`}>
                        {meta.label}
                      </Badge>
                      <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0 border-border text-muted-foreground">
                        {CATEGORY_LABEL[finding.category]}
                      </Badge>
                    </div>
                    {finding.file_path && (
                      <code className="block text-[10px] font-mono text-muted-foreground truncate">{finding.file_path}</code>
                    )}
                    {finding.detail && (
                      <p className="text-[10px] text-muted-foreground leading-relaxed">{finding.detail}</p>
                    )}

                    {finding.status === "fix_proposed" && finding.proposed_fix && (
                      <div className="rounded-lg bg-muted/30 border border-border/60 px-2 py-1.5 space-y-1.5">
                        <button
                          type="button"
                          className="w-full flex items-center gap-1 text-[10px] font-medium text-sky-400 hover:text-sky-300 transition-colors"
                          onClick={() => {
                            setExpandedDiffId((id) => (id === finding.id ? null : finding.id));
                            setFixFileStates((prev) =>
                              prev[finding.id] ? prev : { ...prev, [finding.id]: ensureFixStates(finding) },
                            );
                          }}
                        >
                          {expandedDiffId === finding.id
                            ? <ChevronDown className="w-3 h-3" />
                            : <ChevronRight className="w-3 h-3" />}
                          <Sparkles className="w-3 h-3" /> Review proposed fix
                          <span className="text-muted-foreground font-normal ml-auto">
                            {(finding.proposed_fix.files ?? []).length} file
                            {(finding.proposed_fix.files ?? []).length === 1 ? "" : "s"}
                          </span>
                        </button>
                        {finding.proposed_fix.summary && (
                          <p className="text-[10px] text-muted-foreground">{finding.proposed_fix.summary}</p>
                        )}
                        {expandedDiffId !== finding.id &&
                          (finding.proposed_fix.files ?? []).map((f) => (
                            <code key={f.path} className="block text-[10px] font-mono text-muted-foreground truncate">→ {f.path}</code>
                          ))}
                        {expandedDiffId === finding.id && (finding.proposed_fix.files ?? []).length > 0 && (
                          <div className="max-h-64 overflow-auto rounded-md border border-border/50 bg-background/60 p-1">
                            <DiffViewer
                              compact
                              diffs={(finding.proposed_fix.files ?? []).map((f) =>
                                computeFileDiff(
                                  f.path,
                                  fileContentByPath.get(f.path) ?? "",
                                  f.content,
                                ),
                              )}
                              fileStates={ensureFixStates(finding)}
                              onAccept={(path) => setPathState(finding.id, path, "accepted")}
                              onRevert={(path) => setPathState(finding.id, path, "reverted")}
                              onReApply={(path) => setPathState(finding.id, path, "accepted")}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center gap-1.5 pt-1">
                      {finding.status === "open" && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-[10px] gap-1"
                          disabled={busy}
                          onClick={() => proposeFix(finding)}
                        >
                          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Wrench className="w-3 h-3" />}
                          Propose fix (1 credit)
                        </Button>
                      )}
                      {finding.status === "fix_proposed" && (
                        <Button
                          size="sm"
                          className="h-6 px-2 text-[10px] gap-1"
                          disabled={busy || isLocked}
                          title={isLocked ? "Switch to Test environment to apply" : "Review the diff, then apply accepted files"}
                          onClick={() => {
                            if (expandedDiffId !== finding.id) {
                              setExpandedDiffId(finding.id);
                              setFixFileStates((prev) =>
                                prev[finding.id] ? prev : { ...prev, [finding.id]: ensureFixStates(finding) },
                              );
                            }
                            void applyFix(finding);
                          }}
                        >
                          {busy ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                          Apply accepted
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 text-[10px] gap-1 text-muted-foreground"
                        disabled={busy}
                        onClick={() => dismiss(finding)}
                      >
                        <X className="w-3 h-3" /> Dismiss
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })}

        {resolved.length > 0 && (
          <div className="pt-2">
            <button
              onClick={() => setShowResolved((v) => !v)}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors"
            >
              {showResolved ? "Hide" : "Show"} resolved ({resolved.length})
            </button>
            {showResolved && (
              <div className="mt-2 space-y-1.5">
                {resolved.map((finding) => (
                  <div key={finding.id} className="rounded-lg border border-border/50 px-3 py-2 flex items-center gap-2 opacity-60">
                    {finding.status === "fixed"
                      ? <Check className="w-3 h-3 text-emerald-400 shrink-0" />
                      : <X className="w-3 h-3 text-muted-foreground shrink-0" />}
                    <p className="text-[10px] text-muted-foreground flex-1 truncate">{finding.title}</p>
                    <Badge variant="outline" className="text-[9px] h-4 px-1 shrink-0 border-border text-muted-foreground">
                      {finding.status === "fixed" ? "fixed" : "dismissed"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Project monitoring (Lovable parity: scheduled checks + owner email) */}
      <div className="px-3 py-2.5 border-t border-border">
        <div className="flex items-center gap-2">
          <HeartPulse className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
          <span className="text-xs font-medium flex-1">Project monitoring</span>
          {monitoring?.enabled && (
            <select
              value={monitoring.cadence}
              onChange={(e) => void saveMonitoring(true, e.target.value as "daily" | "weekly")}
              className="text-[10px] bg-muted/40 border border-border/60 rounded-md px-1.5 py-0.5 text-muted-foreground"
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
            </select>
          )}
          <button
            role="switch"
            aria-checked={!!monitoring?.enabled}
            onClick={() => void saveMonitoring(!monitoring?.enabled, monitoring?.cadence ?? "daily")}
            className={`relative w-8 h-[18px] rounded-full transition-colors ${monitoring?.enabled ? "bg-emerald-500/80" : "bg-muted"}`}
          >
            <span className={`absolute top-0.5 w-3.5 h-3.5 rounded-full bg-white transition-all ${monitoring?.enabled ? "left-4" : "left-0.5"}`} />
          </button>
        </div>
        <p className="mt-1 text-[10px] text-muted-foreground">
          {monitoring?.enabled
            ? `Scheduled ${monitoring.cadence} checks — you'll get an email when important issues are found.`
            : "Turn on to have LifemarkAI check this app on a schedule and email you about important issues."}
        </p>
        {monitoring?.enabled && (
          <div className="mt-2 space-y-1.5">
            <div className="flex gap-3 text-[10px] text-muted-foreground">
              <span>Last check: {formatMonitorTime(monitoring.last_run_at)}</span>
              <span>Last email: {formatMonitorTime(monitoring.last_email_at)}</span>
            </div>
            {(monitoring.history?.length ?? 0) > 0 && (
              <ul className="rounded-lg border border-border/60 bg-muted/20 divide-y divide-border/40 max-h-28 overflow-y-auto">
                {monitoring.history!.slice(0, 5).map((h) => (
                  <li key={h.at} className="px-2 py-1 flex items-center gap-2 text-[10px]">
                    <span className="text-muted-foreground shrink-0">{formatMonitorTime(h.at)}</span>
                    <span className="flex-1">{h.findings} finding{h.findings === 1 ? "" : "s"}</span>
                    <span className={h.emailed ? "text-emerald-400" : "text-muted-foreground/70"}>
                      {h.emailed ? "emailed" : "no email"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      {/* Scan button */}
      <div className="p-3 border-t border-border">
        <Button size="sm" className="w-full gap-1.5" onClick={runScan} disabled={scanning}>
          {scanning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
          {scanning ? "Scanning…" : "Scan now"}
        </Button>
        <p className="mt-1.5 text-[10px] text-muted-foreground text-center">
          Checks: build · dependencies · security · performance — scans are free.
        </p>
      </div>
    </div>
  );
}
