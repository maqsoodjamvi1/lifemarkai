import { useState, useEffect, useCallback } from "react";
import {
  AlertTriangle,
  Loader2,
  CheckCircle2,
  RotateCcw,
  Trash2,
  Globe,
  ChevronDown,
} from "lucide-react";

/**
 * Visitor errors from the PUBLISHED app (migration 158 + /api/embed/error).
 *
 * Distinct from ProblemsPanel, which shows compile-time markers from the editor's
 * own Monaco instance. This shows what real visitors hit in production - the thing
 * the owner otherwise only learns from a complaint.
 *
 * Occurrences are shown as prominently as the message on purpose: one error seen
 * 900 times is a different emergency from one seen twice, and a list that treats
 * them alike buries the signal.
 */

interface AppError {
  id: string;
  message: string;
  stack: string | null;
  path: string | null;
  browser: string | null;
  occurrences: number;
  first_seen: string;
  last_seen: string;
  resolved_at: string | null;
}

function timeAgo(iso: string): string {
  const secs = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return "just now";
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

/** Loud for repeat offenders, quiet for one-offs. */
function countTone(n: number): string {
  if (n >= 100) return "bg-red-500/15 text-red-300 border-red-500/30";
  if (n >= 10) return "bg-amber-500/15 text-amber-300 border-amber-500/30";
  return "bg-muted/40 text-muted-foreground border-border/60";
}

export function AppErrorsPanel({ projectId }: { projectId: string }) {
  const [errors, setErrors] = useState<AppError[]>([]);
  const [loading, setLoading] = useState(true);
  const [showResolved, setShowResolved] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch(
        `/api/projects/${projectId}/app-errors?includeResolved=${showResolved}`,
      );
      if (!res.ok) {
        // Say what actually happened. "No errors" and "could not load errors" look
        // identical in an empty list, and conflating them is how a monitoring panel
        // ends up quietly lying.
        setLoadError(res.status === 401 ? "Not signed in." : `Could not load (HTTP ${res.status}).`);
        setErrors([]);
        return;
      }
      const data = await res.json();
      setErrors(data.errors ?? []);
    } catch {
      setLoadError("Could not reach the server.");
      setErrors([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, showResolved]);

  useEffect(() => {
    void load();
  }, [load]);

  async function toggleResolved(err: AppError) {
    setBusy(err.id);
    try {
      await fetch(`/api/projects/${projectId}/app-errors`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ errorId: err.id, resolved: !err.resolved_at }),
      });
      await load();
    } finally {
      setBusy(null);
    }
  }

  async function remove(err: AppError) {
    setBusy(err.id);
    try {
      await fetch(`/api/projects/${projectId}/app-errors?errorId=${err.id}`, { method: "DELETE" });
      await load();
    } finally {
      setBusy(null);
    }
  }

  const totalOccurrences = errors.reduce((n, e) => n + e.occurrences, 0);

  return (
    <div className="flex flex-col h-full text-xs">
      <div className="flex items-center justify-between px-3 py-2 border-b border-border/60">
        <div className="flex items-center gap-2">
          <Globe className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="font-medium">Visitor errors</span>
          {!loading && errors.length > 0 && (
            <span className="text-muted-foreground">
              {errors.length} {errors.length === 1 ? "issue" : "issues"} · {totalOccurrences} total
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-muted-foreground cursor-pointer">
            <input
              type="checkbox"
              checked={showResolved}
              onChange={(e) => setShowResolved(e.target.checked)}
              className="accent-current"
            />
            Resolved
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="text-muted-foreground hover:text-foreground"
            title="Refresh"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center gap-2 p-4 text-muted-foreground">
            <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading…
          </div>
        ) : loadError ? (
          <div className="p-4 text-amber-400">{loadError}</div>
        ) : errors.length === 0 ? (
          <div className="p-4 text-muted-foreground">
            <p>No visitor errors recorded.</p>
            <p className="mt-1 text-[11px]">
              Reporting only runs on a published app. If yours is published and you expected
              errors here, check that the page includes{" "}
              <code className="text-[10px]">/embed/errors.js</code>.
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-border/40">
            {errors.map((err) => (
              <li key={err.id} className={err.resolved_at ? "opacity-50" : ""}>
                <div className="flex items-start gap-2 px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <button
                      type="button"
                      onClick={() => setExpanded(expanded === err.id ? null : err.id)}
                      className="text-left w-full"
                    >
                      <span className="break-words">{err.message}</span>
                    </button>
                    <div className="flex items-center gap-2 mt-1 text-[11px] text-muted-foreground">
                      <span className={`px-1.5 rounded border ${countTone(err.occurrences)}`}>
                        {err.occurrences}×
                      </span>
                      {err.path && <span className="truncate">{err.path}</span>}
                      {err.browser && <span>{err.browser}</span>}
                      <span>{timeAgo(err.last_seen)}</span>
                    </div>

                    {expanded === err.id && err.stack && (
                      <pre className="mt-2 p-2 rounded bg-muted/30 overflow-auto text-[10px] whitespace-pre-wrap">
                        {err.stack}
                      </pre>
                    )}
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      disabled={busy === err.id}
                      onClick={() => void toggleResolved(err)}
                      className="text-muted-foreground hover:text-emerald-400 disabled:opacity-40"
                      title={err.resolved_at ? "Mark unresolved" : "Mark resolved"}
                    >
                      {busy === err.id ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={busy === err.id}
                      onClick={() => void remove(err)}
                      className="text-muted-foreground hover:text-red-400 disabled:opacity-40"
                      title="Delete permanently"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
