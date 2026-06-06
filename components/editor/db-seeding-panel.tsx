"use client";

import { useState, useEffect } from "react";
import { Database, Play, RefreshCw, Copy, Check, ChevronDown, Loader2, Sparkles, Table2, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { toast } from "@/hooks/use-toast";
import type { ProjectFile } from "@/types/database";

interface DbSeedingPanelProps {
  projectId: string;
  files: ProjectFile[];
  onInsertSQL?: (sql: string) => void;
}

interface TableColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimary: boolean;
}

interface TableInfo {
  name: string;
  columns: TableColumn[];
}

interface SeedRow {
  [key: string]: string | number | boolean | null;
}

// ─── Parse tables from migration SQL files ────────────────────────────────────

function parseTables(files: ProjectFile[]): TableInfo[] {
  const tables: TableInfo[] = [];
  const sqlFiles = files.filter(
    (f) => f.path.includes("migration") || f.path.endsWith(".sql") || f.path.includes("schema")
  );

  const createTableRegex = /CREATE TABLE(?:\s+IF NOT EXISTS)?\s+(?:"?(\w+)"?\.)?\"?(\w+)\"?\s*\(([\s\S]*?)\);/gi;
  const columnRegex = /^\s+"?(\w+)"?\s+([\w\[\]()]+(?:\s+\w+)?)\s*(.*?)(?:,|$)/;

  for (const file of sqlFiles) {
    const content = file.content ?? "";
    let match: RegExpExecArray | null;
    while ((match = createTableRegex.exec(content)) !== null) {
      const tableName = match[2];
      if (tableName.startsWith("_") || tableName === "schema_migrations") continue;

      const colBlock = match[3];
      const columns: TableColumn[] = [];
      for (const line of colBlock.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("--") || trimmed.startsWith("CONSTRAINT") ||
            trimmed.startsWith("PRIMARY") || trimmed.startsWith("UNIQUE") ||
            trimmed.startsWith("CHECK") || trimmed.startsWith("FOREIGN")) continue;

        const colMatch = columnRegex.exec(line);
        if (!colMatch) continue;
        const colName = colMatch[1];
        const colType = colMatch[2].toLowerCase();
        const rest = colMatch[3].toLowerCase();
        if (colName === "primary" || colName === "unique" || colName === "check") continue;

        columns.push({
          name: colName,
          type: colType,
          nullable: !rest.includes("not null"),
          isPrimary: rest.includes("primary key") || colName === "id",
        });
      }

      if (columns.length > 0) {
        tables.push({ name: tableName, columns });
      }
    }
  }

  // Fallback: well-known tables
  if (tables.length === 0) {
    tables.push(
      { name: "profiles", columns: [
        { name: "id", type: "uuid", nullable: false, isPrimary: true },
        { name: "full_name", type: "text", nullable: true, isPrimary: false },
        { name: "email", type: "text", nullable: false, isPrimary: false },
      ]},
      { name: "projects", columns: [
        { name: "id", type: "uuid", nullable: false, isPrimary: true },
        { name: "name", type: "text", nullable: false, isPrimary: false },
        { name: "description", type: "text", nullable: true, isPrimary: false },
        { name: "user_id", type: "uuid", nullable: false, isPrimary: false },
      ]},
    );
  }

  return tables;
}

// ─── Generate seed rows via a simple client-side faker ───────────────────────

const FIRST_NAMES = ["Alice", "Bob", "Carol", "David", "Eva", "Frank", "Grace", "Henry", "Iris", "Jack"];
const LAST_NAMES  = ["Smith", "Jones", "Williams", "Taylor", "Brown", "Davis", "Wilson", "Moore", "Anderson", "Thomas"];
const DOMAINS     = ["gmail.com", "outlook.com", "yahoo.com", "company.io", "work.com"];
const LOREM       = "Lorem ipsum dolor sit amet consectetur adipiscing elit sed do eiusmod tempor incididunt ut labore".split(" ");

function randomInt(min: number, max: number) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function loremPhrase(words = 5) { return Array.from({ length: words }, () => pick(LOREM)).join(" "); }
function fakeEmail(first: string, last: string) { return `${first.toLowerCase()}.${last.toLowerCase()}@${pick(DOMAINS)}`; }
function fakeUUID() { return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; return (c === "x" ? r : (r & 0x3 | 0x8)).toString(16); }); }

function generateValueForColumn(col: TableColumn, rowIdx: number): string | number | boolean | null {
  const n = col.name.toLowerCase();
  const t = col.type;

  if (col.isPrimary && (t.includes("uuid") || t === "uuid")) return `'${fakeUUID()}'`;
  if (col.isPrimary && t.includes("int")) return rowIdx + 1;
  if (n === "user_id" || n === "owner_id" || n === "created_by") return `'${fakeUUID()}'`;

  if (n.includes("email")) {
    const fn = pick(FIRST_NAMES); const ln = pick(LAST_NAMES);
    return `'${fakeEmail(fn, ln)}'`;
  }
  if (n === "full_name" || n === "name" || n === "display_name") {
    return `'${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}'`;
  }
  if (n === "first_name" || n === "firstname") return `'${pick(FIRST_NAMES)}'`;
  if (n === "last_name"  || n === "lastname")  return `'${pick(LAST_NAMES)}'`;
  if (n.includes("title")) return `'${loremPhrase(3)}'`;
  if (n.includes("description") || n.includes("bio") || n.includes("body") || n.includes("content")) {
    return `'${loremPhrase(randomInt(6, 14))}'`;
  }
  if (n.includes("url") || n.includes("link") || n.includes("website")) return `'https://example.com/${loremPhrase(1)}'`;
  if (n.includes("slug")) return `'${loremPhrase(2).replace(/ /g, "-")}-${rowIdx}'`;
  if (n.includes("phone")) return `'+1${randomInt(200, 999)}${randomInt(100, 999)}${randomInt(1000, 9999)}'`;
  if (n.includes("avatar") || n.includes("image") || n.includes("photo")) {
    return `'https://api.dicebear.com/7.x/initials/svg?seed=${rowIdx}'`;
  }
  if (n.includes("color")) return `'#${Math.floor(Math.random()*16777215).toString(16).padStart(6,"0")}'`;
  if (n === "plan") return `'${pick(["free","pro","business"])}'`;
  if (n === "status") return `'${pick(["active","inactive","pending"])}'`;
  if (n === "role") return `'${pick(["owner","admin","member","viewer"])}'`;

  if (t.includes("bool")) return pick([true, false]) ? "true" : "false";
  if (t.includes("int") || t.includes("serial") || t.includes("numeric") || t.includes("float")) {
    return randomInt(1, 9999);
  }
  if (t.includes("timestamp") || t.includes("date")) {
    const d = new Date(Date.now() - randomInt(0, 365 * 24 * 60 * 60 * 1000));
    return `'${d.toISOString()}'`;
  }
  if (t.includes("json")) return `'{}'`;
  if (t.includes("uuid")) return `'${fakeUUID()}'`;
  if (col.nullable) return "NULL";
  return `'${loremPhrase(2)}'`;
}

function generateInsertSQL(table: TableInfo, rowCount: number): { sql: string; preview: SeedRow[] } {
  const writableCols = table.columns.filter(
    (c) => !(c.isPrimary && c.type.includes("serial")) // skip auto-increment PKs
  );

  const preview: SeedRow[] = [];
  const valueBlocks: string[] = [];

  for (let i = 0; i < rowCount; i++) {
    const row: SeedRow = {};
    const vals: (string | number | boolean | null)[] = [];
    for (const col of writableCols) {
      const v = generateValueForColumn(col, i);
      row[col.name] = typeof v === "string" ? v.replace(/^'|'$/g, "") : v;
      vals.push(v);
    }
    valueBlocks.push(`  (${vals.join(", ")})`);
    if (i < 5) preview.push(row);
  }

  const colNames = writableCols.map((c) => `"${c.name}"`).join(", ");
  const sql = `INSERT INTO "${table.name}" (${colNames})\nVALUES\n${valueBlocks.join(",\n")}\nON CONFLICT DO NOTHING;`;

  return { sql, preview };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function DbSeedingPanel({ projectId, files, onInsertSQL }: DbSeedingPanelProps) {
  const tables = parseTables(files);

  const [selectedTable, setSelectedTable] = useState<string>(tables[0]?.name ?? "");
  const [rowCount, setRowCount] = useState(10);
  const [generated, setGenerated] = useState<{ sql: string; preview: SeedRow[] } | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<"preview" | "sql">("preview");

  const tableInfo = tables.find((t) => t.name === selectedTable);

  function generate() {
    if (!tableInfo) return;
    setGenerated(generateInsertSQL(tableInfo, rowCount));
    setActiveTab("preview");
  }

  useEffect(() => {
    if (tableInfo) generate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTable, rowCount]);

  async function runSeed() {
    if (!generated) return;
    setRunning(true);
    try {
      // Post the SQL to the project's env endpoint as a one-shot exec
      // In production this would call a /api/projects/[id]/db/exec endpoint
      if (onInsertSQL) {
        onInsertSQL(generated.sql);
        toast({ title: "Seed SQL sent to AI chat", description: "The SQL will be applied to your Supabase project." });
      } else {
        toast({ title: "Copy the SQL", description: "Run it in your Supabase SQL editor to seed the table." });
      }
    } finally {
      setRunning(false);
    }
  }

  function copySQL() {
    if (!generated) return;
    navigator.clipboard.writeText(generated.sql);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const previewCols = tableInfo?.columns.slice(0, 4) ?? [];

  return (
    <div className="flex flex-col h-full text-sm">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center gap-2 mb-1">
          <Database className="w-4 h-4 text-violet-400" />
          <h2 className="font-semibold text-foreground">DB Seeding</h2>
          <Badge variant="outline" className="text-[10px] h-4 px-1.5 border-violet-500/30 text-violet-400">AI</Badge>
        </div>
        <p className="text-xs text-muted-foreground">Generate realistic seed data for your Supabase tables</p>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        {/* Table selector */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Table</label>
          {tables.length === 0 ? (
            <p className="text-xs text-muted-foreground p-3 rounded-lg bg-muted/30">
              No SQL migration files found. Add migration files to your project to detect tables.
            </p>
          ) : (
            <Select value={selectedTable} onValueChange={setSelectedTable}>
              <SelectTrigger className="h-9 bg-muted/30 border-border text-sm">
                <SelectValue placeholder="Select a table" />
              </SelectTrigger>
              <SelectContent>
                {tables.map((t) => (
                  <SelectItem key={t.name} value={t.name}>
                    <span className="flex items-center gap-2">
                      <Table2 className="w-3.5 h-3.5 text-muted-foreground" />
                      {t.name}
                      <span className="text-[10px] text-muted-foreground">({t.columns.length} cols)</span>
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>

        {/* Row count */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Row count</label>
            <span className="text-xs font-semibold text-foreground tabular-nums">{rowCount}</span>
          </div>
          <Slider
            min={1} max={100} step={1}
            value={[rowCount]}
            onValueChange={([v]: number[]) => setRowCount(v)}
            className="w-full"
          />
          <div className="flex justify-between text-[10px] text-muted-foreground">
            <span>1</span><span>25</span><span>50</span><span>100</span>
          </div>
        </div>

        {/* Column preview */}
        {tableInfo && (
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Columns ({tableInfo.columns.length})</label>
            <div className="rounded-lg border border-border bg-muted/20 divide-y divide-border max-h-40 overflow-y-auto">
              {tableInfo.columns.map((col) => (
                <div key={col.name} className="flex items-center justify-between px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    {col.isPrimary && <span className="text-[9px] px-1 rounded bg-amber-500/20 text-amber-400 font-mono">PK</span>}
                    <span className="text-xs font-mono text-foreground">{col.name}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] text-muted-foreground font-mono">{col.type}</span>
                    {col.nullable && <span className="text-[9px] text-muted-foreground">nullable</span>}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Generated data */}
        {generated && (
          <div className="space-y-2">
            {/* Tab bar */}
            <div className="flex gap-1 p-0.5 rounded-lg bg-muted/30 border border-border">
              {(["preview", "sql"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`flex-1 py-1 rounded-md text-xs font-medium capitalize transition-all ${
                    activeTab === tab ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab === "preview" ? "Preview" : "SQL"}
                </button>
              ))}
            </div>

            {activeTab === "preview" ? (
              <div className="rounded-lg border border-border overflow-x-auto">
                <table className="w-full text-[10px]">
                  <thead>
                    <tr className="border-b border-border bg-muted/30">
                      {previewCols.map((c) => (
                        <th key={c.name} className="px-2 py-1.5 text-left font-medium text-muted-foreground whitespace-nowrap">
                          {c.name}
                        </th>
                      ))}
                      {(tableInfo?.columns.length ?? 0) > 4 && (
                        <th className="px-2 py-1.5 text-muted-foreground">+{(tableInfo?.columns.length ?? 0) - 4} more</th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {generated.preview.map((row, i) => (
                      <tr key={i} className="border-b border-border last:border-0 hover:bg-muted/10">
                        {previewCols.map((c) => (
                          <td key={c.name} className="px-2 py-1.5 font-mono text-foreground max-w-[120px] truncate">
                            {String(row[c.name] ?? "null")}
                          </td>
                        ))}
                        {(tableInfo?.columns.length ?? 0) > 4 && <td className="px-2 py-1.5 text-muted-foreground">…</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
                {rowCount > 5 && (
                  <p className="text-[10px] text-muted-foreground text-center py-1.5 border-t border-border">
                    Showing 5 of {rowCount} rows
                  </p>
                )}
              </div>
            ) : (
              <div className="relative">
                <pre className="rounded-lg border border-border bg-muted/20 p-3 text-[10px] font-mono text-foreground overflow-x-auto max-h-52 whitespace-pre-wrap break-words">
                  {generated.sql}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Footer actions */}
      <div className="p-4 border-t border-border flex gap-2">
        <Button
          size="sm"
          variant="outline"
          className="flex-none gap-1.5"
          onClick={generate}
        >
          <RefreshCw className="w-3.5 h-3.5" />
          Regenerate
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-none gap-1.5"
          onClick={copySQL}
          disabled={!generated}
        >
          {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
          {copied ? "Copied" : "Copy SQL"}
        </Button>
        <Button
          size="sm"
          className="flex-1 gap-1.5"
          onClick={runSeed}
          disabled={!generated || running}
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
          {running ? "Seeding…" : "Seed via AI"}
        </Button>
      </div>
        </div>
  );
}
