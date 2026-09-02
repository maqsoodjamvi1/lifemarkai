import { useCallback,useEffect,useState } from "react";
import { Activity,Loader2,RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ActivityRow {
  pid: number;
  usename: string | null;
  application_name: string | null;
  state: string | null;
  query: string | null;
  query_start: string | null;
}

interface LogRow {
  timestamp?: string;
  event_message?: string;
  error_severity?: string;
}

export function CloudLogsPanel({ projectId }: { projectId: string }) {
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [reason, setReason] = useState<string | null>(null);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [logsSource, setLogsSource] = useState<"analytics" | "pg_stat_activity" | null>(null);
  const [source, setSource] = useState<"postgres_logs" | "edge_logs">("postgres_logs");

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const res = await fetch(
        `/api/cloud/health?projectId=${encodeURIComponent(projectId)}&view=logs&source=${source}`,
        { signal },
      );
      const data = await res.json().catch(() => ({}));
      if (signal?.aborted) return;
      if (!res.ok) {
        setAvailable(false);
        setReason(data.error ?? "Failed to load logs");
        return;
      }
      setAvailable(data.available !== false);
      setReason(data.reason ?? null);
      setActivity(Array.isArray(data.activity) ? data.activity : []);
      setLogs(Array.isArray(data.logs) ? data.logs : []);
      setLogsSource(data.logsSource === "pg_stat_activity" ? "pg_stat_activity" : data.logsSource === "analytics" ? "analytics" : null);
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [projectId, source]);

  useEffect(() => {
    const ac = new AbortController();
    void load(ac.signal);
    return () => ac.abort();
  }, [load]);

  if (loading) {
    return (
      <div className="flex h-40 items-center justify-center text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" />
      </div>
    );
  }

  if (!available) {
    return (
      <div className="rounded-xl border border-border bg-card p-4 text-xs text-muted-foreground">
        {reason ?? "Postgres logs need a dedicated managed Cloud backend."}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-sky-400" />
          <span className="text-sm font-medium">Database activity</span>
        </div>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => void load()}>
          <RefreshCw className="h-3 w-3" /> Refresh
        </Button>
      </div>
      {activity.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">No active queries right now.</p>
      ) : (
        <ul className="space-y-2 max-h-56 overflow-auto">
          {activity.map((row) => (
            <li key={row.pid} className="rounded-lg border border-border bg-muted/20 p-2 text-[11px]">
              <div className="flex gap-2 text-muted-foreground">
                <span className="font-mono">pid {row.pid}</span>
                <span>{row.usename ?? "—"}</span>
                <span className="ml-auto">{row.state ?? ""}</span>
              </div>
              <pre className="mt-1 whitespace-pre-wrap break-all font-mono text-[10px] text-foreground/80">
                {(row.query ?? "").slice(0, 400)}
              </pre>
            </li>
          ))}
        </ul>
      )}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium">Recent logs (last hour)</span>
          {logsSource === "pg_stat_activity" ? (
            <span className="text-[10px] text-muted-foreground">from live Postgres (analytics API unavailable)</span>
          ) : null}
          <button
            type="button"
            className={`text-[10px] px-2 py-0.5 rounded-full border ${source === "postgres_logs" ? "border-sky-500/50 text-foreground" : "border-border text-muted-foreground"}`}
            onClick={() => setSource("postgres_logs")}
          >
            Postgres
          </button>
          <button
            type="button"
            className={`text-[10px] px-2 py-0.5 rounded-full border ${source === "edge_logs" ? "border-sky-500/50 text-foreground" : "border-border text-muted-foreground"}`}
            onClick={() => setSource("edge_logs")}
          >
            API
          </button>
        </div>
        {logs.length === 0 ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {reason
              ? `Log history: ${reason}`
              : "No log lines in the last hour. Live sessions still show above."}
          </p>
        ) : (
          <ul className="mt-2 space-y-1 max-h-48 overflow-auto font-mono text-[10px]">
            {logs.map((row, i) => (
              <li key={`${row.timestamp ?? i}-${i}`} className="border-b border-border/60 py-1">
                <span className="text-muted-foreground">{row.timestamp ?? ""} </span>
                <span>{(row.event_message ?? "").slice(0, 300)}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
