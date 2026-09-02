/**
 * CloudJobsPanel — "Jobs" section of the Lifemark Cloud panel.
 * Scheduled cron tasks (pg_cron) on Lifemark Cloud or a linked Supabase project:
 * list, create (name / cron schedule / SQL command), delete.
 */

import { useState,useEffect,useCallback } from "react";
import { CalendarClock,Loader2,RefreshCw,Plus,Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface CronJob {
  jobid: number;
  jobname: string | null;
  schedule: string;
  command: string;
  active: boolean;
}

const CRON_FIELD_RE = /^[\dA-Za-z*,/-]+$/;

function isValidCron(expr: string): boolean {
  const fields = expr.trim().split(/\s+/);
  return fields.length === 5 && fields.every((f) => CRON_FIELD_RE.test(f));
}

const SCHEDULE_PRESETS = [
  { label: "Every 5 min", value: "*/5 * * * *" },
  { label: "Hourly", value: "0 * * * *" },
  { label: "Daily 3 AM", value: "0 3 * * *" },
  { label: "Weekly", value: "0 3 * * 0" },
];

export function CloudJobsPanel({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [reason, setReason] = useState<string | null>(null);
  const [jobs, setJobs] = useState<CronJob[]>([]);
  const [busy, setBusy] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [schedule, setSchedule] = useState("0 3 * * *");
  const [command, setCommand] = useState("");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cloud/jobs?projectId=${projectId}`, { signal });
      const data = await res.json();
      if (signal?.aborted) return;
      if (!res.ok) {
        setAvailable(false);
        setReason(data.error ?? "Failed to load jobs");
        return;
      }
      setAvailable(data.available !== false);
      setReason(data.reason ?? null);
      setJobs(data.jobs ?? []);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  async function createJob() {
    if (!/^[A-Za-z0-9_-]{1,64}$/.test(name)) {
      toast({ title: "Invalid name", description: "Use letters, numbers, _ or - (max 64 chars).", variant: "destructive" });
      return;
    }
    if (!isValidCron(schedule)) {
      toast({ title: "Invalid schedule", description: 'Cron expressions need 5 fields, e.g. "*/5 * * * *".', variant: "destructive" });
      return;
    }
    if (!command.trim()) {
      toast({ title: "SQL command required", variant: "destructive" });
      return;
    }
    setBusy(true);
    try {
      const res = await fetch("/api/cloud/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, name, schedule, command }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Failed to create job", description: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Job scheduled", description: `${name} runs on "${schedule}".` });
      setShowForm(false);
      setName("");
      setCommand("");
      await load();
    } finally {
      setBusy(false);
    }
  }

  async function deleteJob(jobName: string) {
    if (!window.confirm(`Remove the scheduled job "${jobName}"?`)) return;
    setBusy(true);
    try {
      const res = await fetch(
        `/api/cloud/jobs?projectId=${projectId}&name=${encodeURIComponent(jobName)}`,
        { method: "DELETE" }
      );
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Failed to remove job", description: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Job removed", description: `${jobName} is no longer scheduled.` });
      await load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <CalendarClock className="w-4 h-4 text-cyan-400" />
            <span className="text-sm font-medium">Scheduled jobs</span>
          </div>
          <div className="flex items-center gap-1.5">
            <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => void load()} disabled={loading}>
              {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
              Refresh
            </Button>
            {available && (
              <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => setShowForm((v) => !v)} disabled={busy}>
                <Plus className="w-3 h-3" />
                New job
              </Button>
            )}
          </div>
        </div>

        <p className="text-[11px] text-muted-foreground leading-relaxed mb-3">
          Cron tasks run SQL on your managed backend via pg_cron — cleanups, digests, materialized-view refreshes.
        </p>

        {showForm && (
          <div className="rounded-lg border border-border bg-muted/10 p-3 mb-3 space-y-2">
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="nightly-cleanup"
                className="w-full text-xs px-2 py-1.5 rounded-md border border-border bg-background font-mono"
              />
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground">Schedule (cron, 5 fields)</label>
              <input
                value={schedule}
                onChange={(e) => setSchedule(e.target.value)}
                placeholder="0 3 * * *"
                className={`w-full text-xs px-2 py-1.5 rounded-md border bg-background font-mono ${
                  schedule && !isValidCron(schedule) ? "border-red-500/50" : "border-border"
                }`}
              />
              <div className="flex flex-wrap gap-1">
                {SCHEDULE_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    onClick={() => setSchedule(p.value)}
                    className="text-[10px] px-1.5 py-0.5 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-accent transition-colors"
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <label className="text-[10px] font-medium text-muted-foreground">SQL command</label>
              <textarea
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                placeholder="DELETE FROM sessions WHERE expires_at < now();"
                rows={3}
                className="w-full text-xs px-2 py-1.5 rounded-md border border-border bg-background font-mono resize-y"
              />
            </div>
            <div className="flex gap-1.5">
              <Button size="sm" className="h-7 text-xs" onClick={() => void createJob()} disabled={busy}>
                {busy ? <Loader2 className="w-3 h-3 mr-1.5 animate-spin" /> : <Plus className="w-3 h-3 mr-1.5" />}
                Schedule job
              </Button>
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowForm(false)} disabled={busy}>
                Cancel
              </Button>
            </div>
          </div>
        )}

        {loading && jobs.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Loading cron jobs…</p>
        ) : !available ? (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {reason ?? "Scheduled jobs aren't available for this backend."}
          </p>
        ) : jobs.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">No scheduled jobs yet.</p>
        ) : (
          <ul className="space-y-1.5">
            {jobs.map((j) => (
              <li key={j.jobid} className="rounded-lg border border-border bg-muted/10 p-2.5">
                <div className="flex items-center gap-2">
                  <span className={`w-1.5 h-1.5 rounded-full ${j.active ? "bg-emerald-400" : "bg-muted-foreground/40"}`} />
                  <span className="text-[11px] font-medium">{j.jobname ?? `job #${j.jobid}`}</span>
                  <span className="text-[10px] font-mono text-cyan-700 dark:text-cyan-300 ml-auto">{j.schedule}</span>
                  {j.jobname && (
                    <button
                      onClick={() => void deleteJob(j.jobname!)}
                      disabled={busy}
                      className="text-muted-foreground hover:text-red-400 transition-colors disabled:opacity-50"
                      title="Remove job"
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  )}
                </div>
                <pre className="text-[10px] font-mono text-muted-foreground whitespace-pre-wrap break-all mt-1 max-h-16 overflow-y-auto">
                  {j.command}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
