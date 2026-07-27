"use client";

import { useState, useRef, useEffect } from "react";
import { Database, Play, Loader2, Copy, Check, Trash2, ChevronDown, ChevronUp, Clock, AlertCircle, History, BookOpen, Sparkles, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";

interface DbQueryPanelProps {
  projectId: string;
}

interface QueryResult {
  rows: Record<string, unknown>[];
  count: number;
  durationMs: number;
  error?: string;
}

interface HistoryEntry {
  sql: string;
  ts: number;
  ok: boolean;
  durationMs?: number;
  rowCount?: number;
}

const EXAMPLE_QUERIES = [
  { label: "List tables", sql: "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name;" },
  { label: "Row counts", sql: "SELECT relname AS table_name, n_live_tup AS row_count\nFROM pg_stat_user_tables\nORDER BY n_live_tup DESC;" },
  { label: "Recent messages", sql: "SELECT id, role, content, created_at FROM messages ORDER BY created_at DESC LIMIT 20;" },
  { label: "Project files", sql: "SELECT path, language, length(content) AS bytes FROM project_files WHERE project_id = '<your-project-id>' ORDER BY path;" },
  { label: "Active users", sql: "SELECT id, email, created_at FROM auth.users ORDER BY created_at DESC LIMIT 10;" },
];

function formatValue(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "object") return JSON.stringify(val);
  return String(val);
}

export function DbQueryPanel({ projectId }: DbQueryPanelProps) {
  const [sql, setSql] = useState("SELECT table_name\nFROM information_schema.tables\nWHERE table_schema = 'public'\nORDER BY table_name;");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [running, setRunning] = useState(false);
  const [activeTab, setActiveTab] = useState<"editor" | "history" | "examples">("editor");
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [copiedCell, setCopiedCell] = useState<string | null>(null);
  const [copiedQuery, setCopiedQuery] = useState(false);
  const [expandedRow, setExpandedRow] = useState<number | null>(null);
  const [nlPrompt, setNlPrompt] = useState("");
  const [nlLoading, setNlLoading] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  async function generateSql() {
    if (!nlPrompt.trim()) return;
    setNlLoading(true);
    try {
      const res = await fetch("/api/ai/sql", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: nlPrompt, projectId }),
      });
      const data = await res.json() as { sql?: string; error?: string };
      if (!res.ok || !data.sql) throw new Error(data.error ?? "No SQL returned");
      setSql(data.sql);
      setNlPrompt("");
      toast({ title: "SQL generated", description: "Review and run when ready." });
    } catch (err) {
      toast({ title: "SQL generation failed", description: String(err), variant: "destructive" });
    } finally {
      setNlLoading(false);
    }
  }

  // Tab-key support in textarea
  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Tab") {
      e.preventDefault();
      const ta = textareaRef.current;
      if (!ta) return;
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      const newVal = sql.slice(0, start) + "  " + sql.slice(end);
      setSql(newVal);
      requestAnimationFrame(() => {
        ta.selectionStart = ta.selectionEnd = start + 2;
      });
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      runQuery();
    }
  }

  async function runQuery() {
    const trimmed = sql.trim();
    if (!trimmed || running) return;
    setRunning(true);
    setResult(null);
    const start = Date.now();
    try {
      const res = await fetch(`/api/projects/${projectId}/db-query`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sql: trimmed }),
      });
      const data = await res.json() as { rows?: Record<string, unknown>[]; error?: string };
      const durationMs = Date.now() - start;
      if (!res.ok || data.error) {
        const errResult: QueryResult = { rows: [], count: 0, durationMs, error: data.error ?? "Query failed" };
        setResult(errResult);
        setHistory((h) => [{ sql: trimmed, ts: Date.now(), ok: false, durationMs }, ...h.slice(0, 49)]);
      } else {
        const rows = data.rows ?? [];
        const qr: QueryResult = { rows, count: rows.length, durationMs };
        setResult(qr);
        setHistory((h) => [{ sql: trimmed, ts: Date.now(), ok: true, durationMs, rowCount: rows.length }, ...h.slice(0, 49)]);
      }
    } catch (err: unknown) {
      const durationMs = Date.now() - start;
      const message = err instanceof Error ? err.message : "Network error";
      setResult({ rows: [], count: 0, durationMs, error: message });
      setHistory((h) => [{ sql: trimmed, ts: Date.now(), ok: false, durationMs }, ...h.slice(0, 49)]);
    } finally {
      setRunning(false);
    }
  }

  function copyQuery() {
    navigator.clipboard.writeText(sql);
    setCopiedQuery(true);
    setTimeout(() => setCopiedQuery(false), 2000);
  }

  function copyCell(key: string, val: string) {
    navigator.clipboard.writeText(val);
    setCopiedCell(key);
    setTimeout(() => setCopiedCell(null), 1500);
  }

  function clearHistory() {
    setHistory([]);
    toast({ title: "History cleared" });
  }

  const columns = result && result.rows.length > 0 ? Object.keys(result.rows[0]) : [];

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Database className="w-4 h-4 text-sky-400" />
          <h2 className="font-semibold text-foreground">DB Query Playground</h2>
          {result && !result.error && (
            <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-emerald-500/30 text-emerald-400">
              {result.count} rows
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">Run SQL queries against your Supabase database</p>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 p-2 border-b border-border">
        {(["editor", "history", "examples"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${
              activeTab === tab ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "history" ? `History (${history.length})` : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {activeTab === "editor" && (
        <div className="flex flex-col flex-1 overflow-hidden">
          {/* NL → SQL bar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-violet-500/5">
            <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <input
              value={nlPrompt}
              onChange={(e) => setNlPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") generateSql(); }}
              placeholder="Ask in English... e.g. 'show all users who signed up this week'"
              className="flex-1 bg-transparent text-xs text-foreground placeholder:text-muted-foreground/50 focus:outline-none min-w-0"
            />
            <button
              onClick={generateSql}
              disabled={!nlPrompt.trim() || nlLoading}
              className="shrink-0 text-violet-400 hover:text-violet-300 disabled:opacity-40 transition-colors"
            >
              {nlLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <ArrowRight className="w-3.5 h-3.5" />}
            </button>
          </div>

          {/* SQL Editor */}
          <div className="relative border-b border-border">
            <textarea
              ref={textareaRef}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={handleKeyDown}
              spellCheck={false}
              className="w-full h-40 p-3 text-xs font-mono bg-[#0d1117] text-foreground resize-none focus:outline-none placeholder:text-muted-foreground/40"
              placeholder="SELECT * FROM ..."
            />
            <div className="absolute top-2 right-2 flex gap-1">
              <button
                onClick={copyQuery}
                className="text-muted-foreground hover:text-foreground transition-colors p-1 rounded"
                title="Copy SQL"
              >
                {copiedQuery ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>

          {/* Run bar */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/10">
            <Button size="sm" className="gap-1.5 h-7" onClick={runQuery} disabled={running || !sql.trim()}>
              {running ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              {running ? "Running…" : "Run"}
            </Button>
            <span className="text-[10px] text-muted-foreground">⌘↵ to run</span>
            {result && (
              <div className="ml-auto flex items-center gap-2">
                <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" /> {result.durationMs}ms
                </span>
                {result.error && <AlertCircle className="w-3.5 h-3.5 text-red-400" />}
              </div>
            )}
          </div>

          {/* Results */}
          <div className="flex-1 overflow-auto">
            {!result && !running && (
              <div className="flex flex-col items-center gap-3 py-12 text-center">
                <Database className="w-7 h-7 text-muted-foreground/30" />
                <p className="text-xs text-muted-foreground">Run a query to see results</p>
              </div>
            )}

            {result?.error && (
              <div className="m-3 rounded-xl border border-red-500/30 bg-red-500/5 p-3">
                <div className="flex items-center gap-2 mb-1">
                  <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />
                  <span className="text-xs font-semibold text-red-400">Query Error</span>
                </div>
                <pre className="text-[10px] text-red-300 whitespace-pre-wrap font-mono">{result.error}</pre>
              </div>
            )}

            {result && !result.error && result.rows.length === 0 && (
              <div className="flex flex-col items-center gap-2 py-10 text-center">
                <p className="text-sm font-medium text-foreground">No rows returned</p>
                <p className="text-xs text-muted-foreground">Query executed in {result.durationMs}ms</p>
              </div>
            )}

            {result && !result.error && result.rows.length > 0 && (
              <div className="overflow-auto">
                <table className="w-full text-[11px] border-collapse">
                  <thead className="sticky top-0 bg-muted/80 backdrop-blur-sm">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-medium text-muted-foreground border-b border-border w-8">#</th>
                      {columns.map((col) => (
                        <th key={col} className="px-2 py-1.5 text-left font-medium text-muted-foreground border-b border-border whitespace-nowrap">
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {result.rows.map((row, ri) => (
                      <>
                        <tr
                          key={ri}
                          className="hover:bg-muted/20 cursor-pointer transition-colors"
                          onClick={() => setExpandedRow(expandedRow === ri ? null : ri)}
                        >
                          <td className="px-2 py-1 text-muted-foreground/50 border-b border-border/50">{ri + 1}</td>
                          {columns.map((col) => {
                            const raw = formatValue(row[col]);
                            const display = raw.length > 40 ? raw.slice(0, 40) + "…" : raw;
                            const cellKey = `${ri}-${col}`;
                            return (
                              <td
                                key={col}
                                className="px-2 py-1 border-b border-border/50 font-mono text-foreground/80 group relative"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="flex items-center gap-1">
                                  <span className={raw === "NULL" ? "text-muted-foreground/40 italic" : ""}>{display}</span>
                                  <button
                                    className="hidden group-hover:block ml-1 shrink-0"
                                    onClick={() => copyCell(cellKey, raw)}
                                  >
                                    {copiedCell === cellKey
                                      ? <Check className="w-2.5 h-2.5 text-emerald-400" />
                                      : <Copy className="w-2.5 h-2.5 text-muted-foreground hover:text-foreground" />}
                                  </button>
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                        {expandedRow === ri && (
                          <tr key={`${ri}-expand`}>
                            <td colSpan={columns.length + 1} className="px-3 py-2 bg-muted/30 border-b border-border">
                              <pre className="text-[10px] font-mono text-foreground/80 whitespace-pre-wrap">
                                {JSON.stringify(row, null, 2)}
                              </pre>
                            </td>
                          </tr>
                        )}
                      </>
                    ))}
                  </tbody>
                </table>
                <div className="px-3 py-2 text-[10px] text-muted-foreground border-t border-border">
                  {result.count} row{result.count !== 1 ? "s" : ""} · {result.durationMs}ms · Click row to expand JSON
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === "history" && (
        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {history.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-10 text-center">
              <History className="w-7 h-7 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground">No queries run yet</p>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-between mb-2">
                <span className="text-[10px] text-muted-foreground">{history.length} queries</span>
                <button onClick={clearHistory} className="text-[10px] text-muted-foreground hover:text-red-400 flex items-center gap-1">
                  <Trash2 className="w-3 h-3" /> Clear
                </button>
              </div>
              {history.map((entry, i) => (
                <button
                  key={i}
                  onClick={() => { setSql(entry.sql); setActiveTab("editor"); }}
                  className="w-full text-left rounded-lg border border-border bg-muted/10 p-2.5 hover:bg-muted/20 transition-colors space-y-1"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Badge variant="outline" className={`text-[9px] h-4 px-1 shrink-0 ${entry.ok ? "border-emerald-500/40 text-emerald-400" : "border-red-500/40 text-red-400"}`}>
                      {entry.ok ? "OK" : "ERR"}
                    </Badge>
                    <span className="text-[9px] text-muted-foreground ml-auto">
                                 {new Date(entry.ts).toLocaleTimeString()}
                    </span>
                  </div>
                  <p className="text-xs font-mono text-foreground/70 truncate">{entry.sql.slice(0, 80)}{entry.sql.length > 80 ? "..." : ""}</p>
                  <p className="text-[10px] text-muted-foreground">{entry.rowCount ?? 0} row{(entry.rowCount ?? 0) !== 1 ? "s" : ""}</p>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
