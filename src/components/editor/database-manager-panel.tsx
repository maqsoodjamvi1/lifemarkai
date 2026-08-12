/**
 * DatabaseManagerPanel — Lovable-Cloud-style manager for the DATABASE OF THE
 * APP BEING BUILT (per-project backend), not the platform DB.
 *
 * Backends (resolved server-side by /api/projects/[id]/database):
 *  ☁️ cloud    — managed Lifemark Cloud (Management API SQL; SQL tab enabled)
 *  🔌 supabase — the app's own Supabase over PostgREST (RLS note on anon key)
 *  none        — CTA pointing at the Cloud / DB tabs.
 */

import { useState,useEffect,useCallback,useMemo } from "react";
import {
Database,Loader2,RefreshCw,Trash2,Plus,Play,Lock,
Table2,KeyRound,ChevronLeft,ChevronRight,X,Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";

interface ColumnInfo { name: string; type: string; isPk: boolean }
interface TableInfo { name: string; rowCount: number; columns: ColumnInfo[] }
type Backend = "cloud" | "supabase" | "none";
type Row = Record<string, unknown>;

const PAGE_SIZE = 50;

interface DatabaseManagerPanelProps {
  projectId: string;
  isLocked?: boolean; // Live environment — writes blocked (migration 046)
}

// ── Value helpers ─────────────────────────────────────────────────────────────

function renderValue(v: unknown) {
  if (v === null || v === undefined) {
    return <span className="italic text-muted-foreground/50">null</span>;
  }
  if (typeof v === "boolean") {
    return <span className={v ? "text-emerald-400" : "text-red-400"}>{v ? "✓" : "✗"}</span>;
  }
  if (typeof v === "object") {
    const s = JSON.stringify(v);
    return (
      <span className="font-mono text-[10px] text-violet-700/90 dark:text-violet-300/90" title={s.slice(0, 500)}>
        {s.length > 80 ? `${s.slice(0, 80)}…` : s}
      </span>
    );
  }
  const s = String(v);
  return <span title={s.length > 60 ? s.slice(0, 500) : undefined}>{s.length > 120 ? `${s.slice(0, 120)}…` : s}</span>;
}

function toEditString(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/** Coerce a text input back into a sensible JSON value for the column. */
function coerceValue(raw: string, col: ColumnInfo | undefined, original?: unknown): unknown {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  if (trimmed.toLowerCase() === "null") return null;
  const type = (col?.type ?? "").toLowerCase();
  if (type.includes("bool") || typeof original === "boolean") {
    return trimmed === "true" || trimmed === "1" || trimmed === "✓";
  }
  if (
    /int|numeric|decimal|real|double|float|bigint|smallint/.test(type) ||
    (typeof original === "number" && trimmed !== "")
  ) {
    const n = Number(trimmed);
    return Number.isFinite(n) ? n : trimmed;
  }
  if (type.includes("json") || (original !== null && typeof original === "object")) {
    try { return JSON.parse(trimmed); } catch { return trimmed; }
  }
  return raw;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function DatabaseManagerPanel({ projectId, isLocked }: DatabaseManagerPanelProps) {
  const [backend, setBackend] = useState<Backend | null>(null); // null = loading
  const [backendNote, setBackendNote] = useState<string | null>(null);
  const [tables, setTables] = useState<TableInfo[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<"data" | "schema" | "sql">("data");

  const [rows, setRows] = useState<Row[]>([]);
  const [total, setTotal] = useState<number | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [loadingRows, setLoadingRows] = useState(false);
  const [loadingTables, setLoadingTables] = useState(true);

  // Inline cell editing
  const [editing, setEditing] = useState<{ rowIdx: number; col: string } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [saving, setSaving] = useState(false);

  // Insert form
  const [insertOpen, setInsertOpen] = useState(false);
  const [insertValues, setInsertValues] = useState<Record<string, string>>({});

  // SQL tab
  const [sql, setSql] = useState("");
  const [sqlRows, setSqlRows] = useState<Row[] | null>(null);
  const [sqlError, setSqlError] = useState<string | null>(null);
  const [sqlRunning, setSqlRunning] = useState(false);

  const table = useMemo(() => tables.find((t) => t.name === selected) ?? null, [tables, selected]);
  const pkColumn = useMemo(() => table?.columns.find((c) => c.isPk)?.name ?? null, [table]);
  const canEdit = !isLocked && !!pkColumn;

  const api = `/api/projects/${projectId}/database`;

  const loadTables = useCallback(async () => {
    setLoadingTables(true);
    try {
      const res = await fetch(`${api}?action=tables`);
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Failed to load tables", description: data.error, variant: "destructive" });
        setBackend((b) => b ?? "none");
        return;
      }
      setBackend(data.backend ?? "none");
      setBackendNote(data.note ?? null);
      setTables(data.tables ?? []);
      setSelected((cur) => cur ?? data.tables?.[0]?.name ?? null);
    } catch {
      toast({ title: "Failed to load tables", variant: "destructive" });
      setBackend((b) => b ?? "none");
    } finally {
      setLoadingTables(false);
    }
  }, [api]);

  useEffect(() => { void loadTables(); }, [loadTables]);

  const loadRows = useCallback(async (tableName: string, pageIdx: number) => {
    setLoadingRows(true);
    setEditing(null);
    try {
      const res = await fetch(
        `${api}?action=rows&table=${encodeURIComponent(tableName)}&limit=${PAGE_SIZE}&offset=${pageIdx * PAGE_SIZE}`,
      );
      const data = await res.json();
      if (!res.ok) {
        toast({ title: "Failed to load rows", description: data.error, variant: "destructive" });
        setRows([]);
        setTotal(undefined);
        return;
      }
      setRows(data.rows ?? []);
      setTotal(typeof data.total === "number" ? data.total : undefined);
    } catch {
      toast({ title: "Failed to load rows", variant: "destructive" });
    } finally {
      setLoadingRows(false);
    }
  }, [api]);

  useEffect(() => {
    if (selected && backend && backend !== "none") void loadRows(selected, page);
  }, [selected, page, backend, loadRows]);

  // Reset paging/insert form when switching tables
  useEffect(() => {
    setPage(0);
    setInsertOpen(false);
    setInsertValues({});
    setEditing(null);
  }, [selected]);

  async function post(body: Record<string, unknown>): Promise<{ ok: boolean; data: unknown }> {
    const res = await fetch(api, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 423) {
      toast({ title: "Project is Live", description: "Switch to Test to modify data.", variant: "destructive" });
      return { ok: false, data };
    }
    if (!res.ok) {
      toast({ title: "Write failed", description: data.error, variant: "destructive" });
      return { ok: false, data };
    }
    return { ok: true, data };
  }

  async function saveCell() {
    if (!editing || !selected || !pkColumn) return;
    const row = rows[editing.rowIdx];
    const col = table?.columns.find((c) => c.name === editing.col);
    const value = coerceValue(editValue, col, row?.[editing.col]);
    setSaving(true);
    try {
      const { ok } = await post({
        action: "update",
        table: selected,
        pk: pkColumn,
        pkValue: row?.[pkColumn],
        values: { [editing.col]: value },
      });
      if (ok) {
        setRows((prev) => prev.map((r, i) => (i === editing.rowIdx ? { ...r, [editing.col]: value } : r)));
        setEditing(null);
      }
    } finally {
      setSaving(false);
    }
  }

  async function deleteRow(rowIdx: number) {
    if (!selected || !pkColumn) return;
    const row = rows[rowIdx];
    if (!window.confirm(`Delete this row from "${selected}"?\n\n${pkColumn} = ${String(row?.[pkColumn])}`)) return;
    const { ok } = await post({ action: "delete", table: selected, pk: pkColumn, pkValue: row?.[pkColumn] });
    if (ok) {
      toast({ title: "Row deleted" });
      void loadRows(selected, page);
      void loadTables();
    }
  }

  async function insertRow() {
    if (!selected || !table) return;
    const values: Record<string, unknown> = {};
    for (const col of table.columns) {
      const raw = insertValues[col.name];
      if (raw === undefined || raw.trim() === "") continue; // empty → omitted (defaults apply)
      values[col.name] = coerceValue(raw, col);
    }
    if (Object.keys(values).length === 0) {
      toast({ title: "Nothing to insert", description: "Fill at least one column.", variant: "destructive" });
      return;
    }
    setSaving(true);
    try {
      const { ok } = await post({ action: "insert", table: selected, values });
      if (ok) {
        toast({ title: "Row inserted" });
        setInsertOpen(false);
        setInsertValues({});
        void loadRows(selected, page);
        void loadTables();
      }
    } finally {
      setSaving(false);
    }
  }

  async function runSql() {
    const trimmed = sql.trim();
    if (!trimmed) return;
    setSqlRunning(true);
    setSqlError(null);
    setSqlRows(null);
    try {
      const res = await fetch(api, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "sql", sql: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setSqlError(data.error ?? (res.status === 423 ? "Project is Live — switch to Test to run SQL." : "Query failed"));
        return;
      }
      setSqlRows(data.rows ?? []);
    } catch (err) {
      setSqlError(err instanceof Error ? err.message : "Query failed");
    } finally {
      setSqlRunning(false);
    }
  }

  // ── Loading / no-backend states ────────────────────────────────────────────

  if (backend === null) {
    return (
      <div className="h-full flex items-center justify-center gap-2 text-xs text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Detecting your app’s backend…
      </div>
    );
  }

  if (backend === "none") {
    return (
      <div className="h-full flex flex-col items-center justify-center gap-3 p-6 text-center">
        <Database className="w-8 h-8 text-muted-foreground/50" />
        <p className="text-sm font-medium">No backend connected</p>
        <p className="text-xs text-muted-foreground leading-relaxed max-w-xs">
          This app doesn’t have a database yet. Enable Lifemark Cloud in the ☁️ Cloud tab
          or connect Supabase in the 🗄 DB tab, then come back here to browse and edit data.
        </p>
        <Button size="sm" variant="outline" className="h-7 text-xs gap-1.5 mt-1" onClick={() => void loadTables()}>
          <RefreshCw className="w-3 h-3" /> Check again
        </Button>
      </div>
    );
  }

  const displayColumns: string[] =
    rows.length > 0 ? Object.keys(rows[0]) : (table?.columns.map((c) => c.name) ?? []);
  const hasNext = total !== undefined ? (page + 1) * PAGE_SIZE < total : rows.length === PAGE_SIZE;

  const grid = (gridRows: Row[], gridCols: string[], editable: boolean) => (
    <div className="flex-1 min-h-0 overflow-auto">
      <table className="text-[11px] border-collapse min-w-full">
        <thead>
          <tr>
            {gridCols.map((c) => {
              const isPk = table?.columns.find((x) => x.name === c)?.isPk;
              return (
                <th
                  key={c}
                  className="sticky top-0 z-10 bg-card text-left font-medium text-muted-foreground px-2.5 py-1.5 border-b border-r border-border whitespace-nowrap"
                >
                  <span className="inline-flex items-center gap-1">
                    {c}
                    {isPk && <KeyRound className="w-2.5 h-2.5 text-amber-400" />}
                  </span>
                </th>
              );
            })}
            {editable && (
              <th className="sticky top-0 z-10 bg-card border-b border-border px-2 py-1.5 w-8" />
            )}
          </tr>
        </thead>
        <tbody>
          {gridRows.map((row, rowIdx) => (
            <tr key={rowIdx} className="hover:bg-muted/20">
              {gridCols.map((c) => {
                const isEditingCell = editable && editing?.rowIdx === rowIdx && editing?.col === c;
                return (
                  <td
                    key={c}
                    className={`px-2.5 py-1 border-b border-r border-border/60 whitespace-nowrap max-w-[280px] overflow-hidden text-ellipsis ${
                      editable && canEdit ? "cursor-text" : ""
                    }`}
                    title={editable && !canEdit ? (isLocked ? "Project is Live — editing disabled" : "No primary key detected — editing disabled") : undefined}
                    onClick={() => {
                      if (!editable || !canEdit || isEditingCell) return;
                      setEditing({ rowIdx, col: c });
                      setEditValue(toEditString(row[c]));
                    }}
                  >
                    {isEditingCell ? (
                      <input
                        autoFocus
                        value={editValue}
                        disabled={saving}
                        onChange={(e) => setEditValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void saveCell();
                          if (e.key === "Escape") setEditing(null);
                        }}
                        className="w-full min-w-[120px] bg-background border border-primary/50 rounded px-1.5 py-0.5 text-[11px] font-mono outline-none"
                      />
                    ) : (
                      renderValue(row[c])
                    )}
                  </td>
                );
              })}
              {editable && (
                <td className="border-b border-border/60 px-1.5 py-1">
                  <button
                    onClick={() => void deleteRow(rowIdx)}
                    disabled={!canEdit}
                    title={canEdit ? "Delete row" : isLocked ? "Project is Live — writes disabled" : "No primary key — delete disabled"}
                    className="flex items-center justify-center w-5 h-5 rounded text-muted-foreground hover:text-red-400 hover:bg-red-500/10 disabled:opacity-30 transition-colors"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      {gridRows.length === 0 && (
        <p className="text-[11px] text-muted-foreground p-4 text-center">No rows.</p>
      )}
    </div>
  );

  return (
    <div className="h-full flex flex-col bg-background">
      {/* ── Header: backend badge + tabs ──────────────────────────────────── */}
      <div className="shrink-0 border-b border-border px-3 py-2 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <Database className="w-4 h-4 text-primary shrink-0" />
            <span className="text-sm font-medium">Database</span>
            <span
              className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                backend === "cloud"
                  ? "border-sky-500/40 text-sky-700 dark:text-sky-300 bg-sky-500/10"
                  : "border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-emerald-500/10"
              }`}
            >
              {backend === "cloud" ? "☁️ Managed Cloud" : "🔌 Own Supabase"}
            </span>
          </div>
          <Button
            size="sm"
            variant="outline"
            className="h-6 text-[10px] gap-1"
            onClick={() => { void loadTables(); if (selected) void loadRows(selected, page); }}
            disabled={loadingTables}
          >
            {loadingTables ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            Refresh
          </Button>
        </div>

        {isLocked && (
          <div className="flex items-center gap-1.5 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 text-[10px] text-amber-700 dark:text-amber-300">
            <Lock className="w-3 h-3 shrink-0" />
            Live environment — data is read-only. Switch to Test to edit.
          </div>
        )}
        {backendNote && (
          <p className="text-[10px] text-muted-foreground leading-relaxed">{backendNote}</p>
        )}

        <div className="flex items-center gap-1">
          {(["data", "schema", ...(backend === "cloud" ? (["sql"] as const) : [])] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`px-2.5 py-1 rounded-md text-[11px] font-medium transition-colors ${
                tab === t ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {t === "data" ? "Data" : t === "schema" ? "Schema" : "SQL"}
            </button>
          ))}
        </div>
      </div>

      {/* ── SQL tab (managed Cloud only) ──────────────────────────────────── */}
      {tab === "sql" && backend === "cloud" ? (
        <div className="flex-1 min-h-0 flex flex-col p-3 gap-2">
          <textarea
            value={sql}
            onChange={(e) => setSql(e.target.value)}
            placeholder="SELECT * FROM your_table LIMIT 20;"
            spellCheck={false}
            className="h-32 shrink-0 w-full rounded-lg border border-border bg-card p-2.5 text-[11px] font-mono resize-y outline-none focus:border-primary/50"
          />
          <div className="flex items-center gap-2 shrink-0">
            <Button size="sm" className="h-7 text-xs gap-1.5" onClick={() => void runSql()} disabled={sqlRunning || !sql.trim() || isLocked}>
              {sqlRunning ? <Loader2 className="w-3 h-3 animate-spin" /> : <Play className="w-3 h-3" />}
              Run
            </Button>
            {isLocked && <span className="text-[10px] text-amber-700 dark:text-amber-300">Live environment — SQL disabled.</span>}
            {sqlRows && !sqlError && (
              <span className="text-[10px] text-muted-foreground">
                {sqlRows.length} row{sqlRows.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {sqlError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-2.5 text-[11px] text-red-700 dark:text-red-300 font-mono whitespace-pre-wrap break-all shrink-0">
              {sqlError}
            </div>
          )}
          {sqlRows && sqlRows.length > 0 && (
            <div className="flex-1 min-h-0 flex flex-col rounded-lg border border-border bg-card overflow-hidden">
              {grid(sqlRows, Object.keys(sqlRows[0]), false)}
            </div>
          )}
          {sqlRows && sqlRows.length === 0 && !sqlError && (
            <p className="text-[11px] text-muted-foreground">Statement executed — no rows returned.</p>
          )}
        </div>
      ) : (
        /* ── Data / Schema tabs — table sidebar + main area ───────────────── */
        <div className="flex-1 min-h-0 flex">
          {/* Sidebar: table list */}
          <div className="w-44 shrink-0 border-r border-border overflow-y-auto py-1.5">
            {loadingTables && tables.length === 0 ? (
              <p className="text-[10px] text-muted-foreground px-3 py-2">Loading tables…</p>
            ) : tables.length === 0 ? (
              <p className="text-[10px] text-muted-foreground px-3 py-2 leading-relaxed">
                No tables in the public schema yet. Ask the AI to build a feature that needs a database.
              </p>
            ) : (
              tables.map((t) => (
                <button
                  key={t.name}
                  onClick={() => setSelected(t.name)}
                  className={`w-full flex items-center gap-1.5 px-3 py-1.5 text-left text-[11px] transition-colors ${
                    selected === t.name
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/40"
                  }`}
                >
                  <Table2 className="w-3 h-3 shrink-0" />
                  <span className="truncate flex-1">{t.name}</span>
                  <span className="text-[9px] text-muted-foreground/70 tabular-nums">~{t.rowCount}</span>
                </button>
              ))
            )}
          </div>

          {/* Main area */}
          <div className="flex-1 min-w-0 flex flex-col">
            {!table ? (
              <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground">
                Select a table to browse its {tab === "schema" ? "schema" : "data"}.
              </div>
            ) : tab === "schema" ? (
              /* Schema tab */
              <div className="flex-1 overflow-y-auto p-3">
                <div className="rounded-xl border border-border bg-card p-3">
                  <p className="text-xs font-medium mb-2 flex items-center gap-1.5">
                    <Table2 className="w-3.5 h-3.5 text-primary" /> {table.name}
                    <span className="text-[10px] text-muted-foreground font-normal">~{table.rowCount} rows</span>
                  </p>
                  <ul className="space-y-1">
                    {table.columns.map((c) => (
                      <li key={c.name} className="flex items-center gap-2 text-[11px] py-1 border-b border-border/40 last:border-0">
                        <span className="font-mono">{c.name}</span>
                        <span className="text-muted-foreground text-[10px]">{c.type}</span>
                        {c.isPk && (
                          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-amber-500/40 text-amber-700 dark:text-amber-300 px-1.5 py-px text-[9px]">
                            <KeyRound className="w-2.5 h-2.5" /> PK
                          </span>
                        )}
                      </li>
                    ))}
                    {table.columns.length === 0 && (
                      <li className="text-[11px] text-muted-foreground">No column metadata available.</li>
                    )}
                  </ul>
                </div>
              </div>
            ) : (
              /* Data tab */
              <>
                {/* Toolbar */}
                <div className="shrink-0 flex items-center gap-2 px-3 py-1.5 border-b border-border">
                  <span className="text-[11px] font-medium truncate">{table.name}</span>
                  {loadingRows && <Loader2 className="w-3 h-3 animate-spin text-muted-foreground" />}
                  <div className="ml-auto flex items-center gap-1.5">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 text-[10px] gap-1"
                      onClick={() => setInsertOpen((v) => !v)}
                      disabled={isLocked}
                      title={isLocked ? "Project is Live — writes disabled" : undefined}
                    >
                      {insertOpen ? <X className="w-3 h-3" /> : <Plus className="w-3 h-3" />}
                      {insertOpen ? "Cancel" : "Insert row"}
                    </Button>
                    <div className="flex items-center gap-0.5 text-[10px] text-muted-foreground tabular-nums">
                      <button
                        onClick={() => setPage((p) => Math.max(0, p - 1))}
                        disabled={page === 0 || loadingRows}
                        className="flex items-center justify-center w-5 h-5 rounded hover:bg-muted disabled:opacity-30"
                      >
                        <ChevronLeft className="w-3 h-3" />
                      </button>
                      <span className="px-1">
                        {page * PAGE_SIZE + (rows.length ? 1 : 0)}–{page * PAGE_SIZE + rows.length}
                        {total !== undefined ? ` of ${total}` : ""}
                      </span>
                      <button
                        onClick={() => setPage((p) => p + 1)}
                        disabled={!hasNext || loadingRows}
                        className="flex items-center justify-center w-5 h-5 rounded hover:bg-muted disabled:opacity-30"
                      >
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Inline insert form */}
                {insertOpen && !isLocked && (
                  <div className="shrink-0 border-b border-border bg-muted/10 p-2.5 space-y-1.5 max-h-56 overflow-y-auto">
                    <p className="text-[10px] text-muted-foreground">
                      New row in <span className="font-mono">{table.name}</span> — empty fields are omitted (defaults apply).
                    </p>
                    <div className="grid grid-cols-2 gap-1.5">
                      {table.columns.filter((c) => !c.isPk).map((c) => (
                        <label key={c.name} className="flex flex-col gap-0.5">
                          <span className="text-[9px] text-muted-foreground font-mono">
                            {c.name} <span className="opacity-60">({c.type})</span>
                          </span>
                          <input
                            value={insertValues[c.name] ?? ""}
                            onChange={(e) => setInsertValues((v) => ({ ...v, [c.name]: e.target.value }))}
                            className="rounded border border-border bg-background px-1.5 py-1 text-[11px] font-mono outline-none focus:border-primary/50"
                          />
                        </label>
                      ))}
                    </div>
                    <Button size="sm" className="h-6 text-[10px] gap-1" onClick={() => void insertRow()} disabled={saving}>
                      {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                      Insert
                    </Button>
                  </div>
                )}

                {/* Row grid */}
                {grid(rows, displayColumns, true)}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
