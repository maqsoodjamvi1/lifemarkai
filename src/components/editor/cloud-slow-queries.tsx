/**
 * CloudSlowQueries — "Performance" section of the Lifemark Cloud panel.
 * Lists the managed backend's slowest statements (pg_stat_statements) with
 * AI index suggestions ("Suggest index") and one-click apply.
 */

import { useState,useEffect,useCallback } from "react";
import { Gauge,Loader2,RefreshCw,Sparkles,Check,Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface SlowQuery {
  query: string;
  calls: number;
  mean_exec_time_ms: number;
  total_exec_time_ms: number;
  rows: number;
}

interface IndexSuggestion {
  sql: string;
  reason: string;
  applied?: boolean;
}

interface SuggestionState {
  analysis: string;
  indexes: IndexSuggestion[];
  canApply: boolean;
  permission: string;
}

export function CloudSlowQueries({ projectId }: { projectId: string }) {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [available, setAvailable] = useState(true);
  const [reason, setReason] = useState<string | null>(null);
  const [queries, setQueries] = useState<SlowQuery[]>([]);
  // Keyed by the query's own SQL text, not its array position. pg_stat_statements
  // doesn't return queries in a stable order across calls (it rotates/evicts), so
  // an index-keyed suggestion could survive a refresh and render — including its
  // clickable "Apply index" button — under an entirely different query than the
  // one it was actually generated for.
  const [suggestions, setSuggestions] = useState<Record<string, SuggestionState>>({});
  const [suggestingKey, setSuggestingKey] = useState<string | null>(null);
  const [applyingSql, setApplyingSql] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/cloud/slow-queries?projectId=${projectId}`);
      const data = await res.json();
      if (!res.ok) {
        setAvailable(false);
        setReason(data.error ?? "Failed to load slow queries");
        return;
      }
      setAvailable(data.available !== false);
      setReason(data.reason ?? null);
      setQueries(data.queries ?? []);
      // Old suggestions are keyed against queries that may no longer be in
      // this refreshed list at all — drop them rather than risk a stale
      // match against a coincidentally-identical query text.
      setSuggestions({});
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  async function suggestIndex(query: string) {
    setSuggestingKey(query);
    try {
      const res = await fetch("/api/cloud/slow-queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, query }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Suggestion failed", description: data.error, variant: "destructive" });
        return;
      }
      setSuggestions((s) => ({ ...s, [query]: data }));
      if ((data.indexes ?? []).length === 0) {
        toast({ title: "No index needed", description: data.analysis || "The AI found no index that would help this query." });
      }
    } finally {
      setSuggestingKey(null);
    }
  }

  async function applyIndex(query: string, sql: string) {
    setApplyingSql(sql);
    try {
      const res = await fetch("/api/cloud/slow-queries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, apply: true, sql }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Apply failed", description: data.error, variant: "destructive" });
        return;
      }
      toast({ title: "Index created", description: "The index was applied to your backend." });
      setSuggestions((s) => ({
        ...s,
        [query]: {
          ...s[query],
          indexes: s[query].indexes.map((i) => (i.sql === sql ? { ...i, applied: true } : i)),
        },
      }));
    } finally {
      setApplyingSql(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Gauge className="w-4 h-4 text-amber-400" />
            <span className="text-sm font-medium">Slow queries</span>
          </div>
          <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5" onClick={() => void load()} disabled={loading}>
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Refresh
          </Button>
        </div>

        {loading && queries.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">Scanning pg_stat_statements…</p>
        ) : !available ? (
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {reason ?? "Slow-query stats aren't available for this backend."}
          </p>
        ) : queries.length === 0 ? (
          <p className="text-[11px] text-muted-foreground">
            No slow queries recorded yet. Stats accumulate as your app talks to the database.
          </p>
        ) : (
          <ul className="space-y-2">
            {queries.map((q, idx) => {
              const sug = suggestions[q.query];
              return (
                <li key={idx} className="rounded-lg border border-border bg-muted/10 p-2.5">
                  <pre className="text-[10px] font-mono whitespace-pre-wrap break-all text-foreground/90 max-h-24 overflow-y-auto">
                    {q.query}
                  </pre>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-muted-foreground tabular-nums">
                    <span className="text-amber-700 dark:text-amber-300">{q.mean_exec_time_ms} ms avg</span>
                    <span>{q.total_exec_time_ms} ms total</span>
                    <span>{q.calls} calls</span>
                    <span>{q.rows} rows</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] gap-1 ml-auto"
                      onClick={() => void suggestIndex(q.query)}
                      disabled={suggestingKey !== null}
                    >
                      {suggestingKey === q.query ? <Loader2 className="w-3 h-3 animate-spin" /> : <Sparkles className="w-3 h-3" />}
                      Suggest index
                    </Button>
                  </div>

                  {sug && (
                    <div className="mt-2 rounded-md border border-violet-500/25 bg-violet-500/[0.05] p-2 space-y-2">
                      {sug.analysis && (
                        <p className="text-[10px] text-muted-foreground leading-relaxed">{sug.analysis}</p>
                      )}
                      {sug.indexes.length === 0 ? (
                        <p className="text-[10px] text-muted-foreground">No index suggested for this query.</p>
                      ) : (
                        sug.indexes.map((i) => (
                          <div key={i.sql} className="space-y-1">
                            <pre className="text-[10px] font-mono whitespace-pre-wrap break-all text-violet-800 dark:text-violet-200">{i.sql}</pre>
                            {i.reason && <p className="text-[10px] text-muted-foreground/70">{i.reason}</p>}
                            {i.applied ? (
                              <span className="inline-flex items-center gap-1 text-[10px] text-emerald-700 dark:text-emerald-300">
                                <Check className="w-3 h-3" /> Applied
                              </span>
                            ) : sug.canApply ? (
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-6 text-[10px] gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/10"
                                onClick={() => void applyIndex(q.query, i.sql)}
                                disabled={applyingSql !== null}
                              >
                                {applyingSql === i.sql ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
                                Apply
                              </Button>
                            ) : (
                              <p className="text-[10px] text-amber-700/80 dark:text-amber-300/80">
                                Set Database to Allow in Cloud → Advanced to apply indexes from here.
                              </p>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
