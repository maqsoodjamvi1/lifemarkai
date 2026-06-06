"use client";

/**
 * SchemaPanel
 * Parses SQL migration files in the project to build an ERD-style diagram.
 * Tables rendered as cards; FK relationships shown as connecting lines via SVG overlay.
 * "Generate migration" button fires an AI chat prompt.
 */

import { useState, useMemo, useRef, useEffect, useCallback } from "react";
import {
  Database, RefreshCw, Zap, ChevronDown, ChevronRight,
  Table2, Link2, Search, GitBranch,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ProjectFile } from "@/types/database";

// ─── Types ────────────────────────────────────────────────────────────────────

interface Column {
  name: string;
  type: string;
  nullable: boolean;
  isPk: boolean;
  isFk: boolean;
  references?: { table: string; column: string };
  defaultValue?: string;
}

interface Table {
  name: string;
  columns: Column[];
  source: string; // file path the table was parsed from
}

interface ForeignKey {
  fromTable: string;
  fromColumn: string;
  toTable: string;
  toColumn: string;
}

interface TablePosition {
  x: number;
  y: number;
}

// ─── SQL Parser ───────────────────────────────────────────────────────────────

function parseSql(sql: string, sourcePath: string): Table[] {
  const tables: Table[] = [];

  // Match CREATE TABLE blocks (including IF NOT EXISTS)
  const createTableRe = /CREATE\s+TABLE\s+(?:IF\s+NOT\s+EXISTS\s+)?(?:"?(\w+)"?\.)?"?(\w+)"?\s*\(([^;]+?)\)\s*;/gi;

  let match: RegExpExecArray | null;
  while ((match = createTableRe.exec(sql)) !== null) {
    const tableName = match[2];
    const body = match[3];

    const columns: Column[] = [];

    // Split on commas that aren't inside parentheses
    const lines = splitColumns(body);

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;

      // Skip table constraints (PRIMARY KEY (...), FOREIGN KEY (...), UNIQUE (...), CHECK (...))
      if (/^(PRIMARY\s+KEY|FOREIGN\s+KEY|UNIQUE|CHECK|CONSTRAINT|EXCLUDE)/i.test(trimmed)) {
        // Still parse FK constraints to extract references
        const fkInline = /FOREIGN\s+KEY\s*\("?(\w+)"?\)\s+REFERENCES\s+"?(\w+)"?\s*\("?(\w+)"?\)/i.exec(trimmed);
        if (fkInline) {
          // Update the matching column if already added
          const col = columns.find((c) => c.name === fkInline[1]);
          if (col) {
            col.isFk = true;
            col.references = { table: fkInline[2], column: fkInline[3] };
          }
        }
        continue;
      }

      // Parse column: name type [constraints...]
      const colMatch = /^"?(\w+)"?\s+([^\s,]+(?:\s*\([^)]*\))?)(.*)/i.exec(trimmed);
      if (!colMatch) continue;

      const colName = colMatch[1];
      const colType = colMatch[2].toUpperCase();
      const rest = colMatch[3] ?? "";

      const isPk = /PRIMARY\s+KEY/i.test(rest) || colName === "id";
      const nullable = !/NOT\s+NULL/i.test(rest) && !isPk;

      // Inline REFERENCES
      const refMatch = /REFERENCES\s+"?(\w+)"?\s*\("?(\w+)"?\)/i.exec(rest);
      const isFk = !!refMatch;

      const defaultMatch = /DEFAULT\s+([^\s,]+)/i.exec(rest);

      columns.push({
        name: colName,
        type: colType,
        nullable,
        isPk,
        isFk,
        references: refMatch ? { table: refMatch[1], column: refMatch[2] } : undefined,
        defaultValue: defaultMatch ? defaultMatch[1] : undefined,
      });
    }

    if (columns.length > 0) {
      tables.push({ name: tableName, columns, source: sourcePath });
    }
  }

  return tables;
}

function splitColumns(body: string): string[] {
  const result: string[] = [];
  let depth = 0;
  let current = "";
  for (const ch of body) {
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
    else if (ch === "," && depth === 0) {
      result.push(current);
      current = "";
      continue;
    }
    current += ch;
  }
  if (current.trim()) result.push(current);
  return result;
}

function extractForeignKeys(tables: Table[]): ForeignKey[] {
  const fks: ForeignKey[] = [];
  for (const table of tables) {
    for (const col of table.columns) {
      if (col.isFk && col.references) {
        fks.push({
          fromTable: table.name,
          fromColumn: col.name,
          toTable: col.references.table,
          toColumn: col.references.column,
        });
      }
    }
  }
  return fks;
}

// ─── Type colour map ──────────────────────────────────────────────────────────

const TYPE_COLORS: Record<string, string> = {
  UUID: "text-violet-400",
  TEXT: "text-sky-400",
  VARCHAR: "text-sky-400",
  INTEGER: "text-amber-400",
  INT: "text-amber-400",
  BIGINT: "text-amber-400",
  SERIAL: "text-amber-400",
  BIGSERIAL: "text-amber-400",
  BOOLEAN: "text-emerald-400",
  TIMESTAMP: "text-pink-400",
  TIMESTAMPTZ: "text-pink-400",
  DATE: "text-pink-400",
  JSONB: "text-orange-400",
  JSON: "text-orange-400",
  NUMERIC: "text-yellow-400",
  FLOAT: "text-yellow-400",
};

function typeColor(t: string): string {
  const base = t.split("(")[0].toUpperCase();
  return TYPE_COLORS[base] ?? "text-muted-foreground";
}

// ─── Table Card ───────────────────────────────────────────────────────────────

interface TableCardProps {
  table: Table;
  position: TablePosition;
  onDrag: (name: string, x: number, y: number) => void;
  isHighlighted: boolean;
  cardRef: (el: HTMLDivElement | null) => void;
}

function TableCard({ table, position, onDrag, isHighlighted, cardRef }: TableCardProps) {
  const [expanded, setExpanded] = useState(true);
  const dragStart = useRef<{ mx: number; my: number; ox: number; oy: number } | null>(null);

  function onMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    dragStart.current = { mx: e.clientX, my: e.clientY, ox: position.x, oy: position.y };
    window.addEventListener("mousemove", onMouseMove);
    window.addEventListener("mouseup", onMouseUp);
  }

  function onMouseMove(e: MouseEvent) {
    if (!dragStart.current) return;
    const dx = e.clientX - dragStart.current.mx;
    const dy = e.clientY - dragStart.current.my;
    onDrag(table.name, dragStart.current.ox + dx, dragStart.current.oy + dy);
  }

  function onMouseUp() {
    dragStart.current = null;
    window.removeEventListener("mousemove", onMouseMove);
    window.removeEventListener("mouseup", onMouseUp);
  }

  return (
    <div
      ref={cardRef}
      style={{ position: "absolute", left: position.x, top: position.y, minWidth: 220 }}
      className={`rounded-xl border bg-card shadow-lg select-none z-10 transition-shadow ${
        isHighlighted ? "border-violet-500 shadow-violet-500/20" : "border-border"
      }`}
    >
      {/* Header — drag handle */}
      <div
        className="flex items-center gap-2 px-3 py-2 bg-muted/40 rounded-t-xl cursor-grab active:cursor-grabbing border-b border-border"
        onMouseDown={onMouseDown}
      >
        <Table2 className="w-3.5 h-3.5 text-violet-400 shrink-0" />
        <span className="text-xs font-semibold flex-1 truncate">{table.name}</span>
        <span className="text-[10px] text-muted-foreground">{table.columns.length} cols</span>
        <button
          className="text-muted-foreground hover:text-foreground ml-1"
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        </button>
      </div>

      {expanded && (
        <div className="divide-y divide-border/40">
          {table.columns.map((col) => (
            <div key={col.name} className="flex items-center gap-2 px-3 py-1.5 group">
              {col.isPk && (
                <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wide shrink-0">PK</span>
              )}
              {col.isFk && !col.isPk && (
                <span className="text-[9px] font-bold text-sky-400 uppercase tracking-wide shrink-0">FK</span>
              )}
              {!col.isPk && !col.isFk && <span className="w-[20px] shrink-0" />}
              <span className="text-xs flex-1 truncate font-mono">{col.name}</span>
              <span className={`text-[10px] font-mono shrink-0 ${typeColor(col.type)}`}>
                {col.type.split("(")[0]}
              </span>
              {col.nullable && (
                <span className="text-[9px] text-muted-foreground/60">?</span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Source badge */}
      <div className="px-3 py-1 rounded-b-xl border-t border-border/40 bg-muted/20">
        <span className="text-[9px] text-muted-foreground truncate block">{table.source}</span>
      </div>
    </div>
  );
}

// ─── FK Lines (SVG overlay) ───────────────────────────────────────────────────

interface FkLinesProps {
  fks: ForeignKey[];
  cardRects: Record<string, DOMRect | null>;
  canvasRef: React.RefObject<HTMLDivElement>;
}

function FkLines({ fks, cardRects, canvasRef }: FkLinesProps) {
  if (!canvasRef.current) return null;
  const canvasRect = canvasRef.current.getBoundingClientRect();

  const lines: JSX.Element[] = [];

  for (const fk of fks) {
    const fromRect = cardRects[fk.fromTable];
    const toRect = cardRects[fk.toTable];
    if (!fromRect || !toRect) continue;

    const x1 = fromRect.left - canvasRect.left + fromRect.width;
    const y1 = fromRect.top - canvasRect.top + fromRect.height / 2;
    const x2 = toRect.left - canvasRect.left;
    const y2 = toRect.top - canvasRect.top + toRect.height / 2;

    const cx1 = x1 + Math.abs(x2 - x1) * 0.4;
    const cx2 = x2 - Math.abs(x2 - x1) * 0.4;

    lines.push(
      <g key={`${fk.fromTable}.${fk.fromColumn}->${fk.toTable}`}>
        <path
          d={`M ${x1} ${y1} C ${cx1} ${y1}, ${cx2} ${y2}, ${x2} ${y2}`}
          fill="none"
          stroke="hsl(var(--violet-500, 262 83% 58%))"
          strokeWidth={1.5}
          strokeDasharray="4 3"
          opacity={0.6}
        />
        <circle cx={x1} cy={y1} r={3} fill="#7c3aed" opacity={0.8} />
        <circle cx={x2} cy={y2} r={3} fill="#7c3aed" opacity={0.8} />
      </g>
    );
  }

  return (
    <svg
      style={{ position: "absolute", inset: 0, pointerEvents: "none", zIndex: 5 }}
      width="100%"
      height="100%"
      overflow="visible"
    >
      <defs>
        <marker id="arrow" markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto">
          <path d="M0,0 L0,6 L6,3 z" fill="#7c3aed" opacity={0.8} />
        </marker>
      </defs>
      {lines}
    </svg>
  );
}

// ─── Main Panel ───────────────────────────────────────────────────────────────

interface SchemaPanelProps {
  files: ProjectFile[];
  onGenerateMigration?: (prompt: string) => void;
}

export function SchemaPanel({ files, onGenerateMigration }: SchemaPanelProps) {
  const [search, setSearch] = useState("");
  const [positions, setPositions] = useState<Record<string, TablePosition>>({});
  const [cardRects, setCardRects] = useState<Record<string, DOMRect | null>>({});
  const [tick, setTick] = useState(0); // force re-render for SVG lines
  const cardEls = useRef<Record<string, HTMLDivElement | null>>({});
  const canvasRef = useRef<HTMLDivElement>(null);

  // Parse all SQL files
  const { tables, fks } = useMemo(() => {
    const sqlFiles = files.filter(
      (f) =>
        f.path.endsWith(".sql") ||
        f.path.includes("migration") ||
        f.path.includes("schema")
    );

    const allTables: Table[] = [];
    for (const file of sqlFiles) {
      if (file.content) {
        allTables.push(...parseSql(file.content, file.path));
      }
    }

    // Deduplicate by table name (keep last occurrence)
    const tableMap = new Map<string, Table>();
    for (const t of allTables) tableMap.set(t.name, t);
    const tables = Array.from(tableMap.values());
    const fks = extractForeignKeys(tables);

    return { tables, fks };
  }, [files]);

  // Auto-layout on first parse
  useEffect(() => {
    if (tables.length === 0) return;
    setPositions((prev) => {
      const next = { ...prev };
      const CARD_W = 240;
      const CARD_H = 200;
      const COLS = 3;
      tables.forEach((t, i) => {
        if (!next[t.name]) {
          next[t.name] = {
            x: 24 + (i % COLS) * (CARD_W + 40),
            y: 24 + Math.floor(i / COLS) * (CARD_H + 40),
          };
        }
      });
      return next;
    });
  }, [tables]);

  // Update card rects for SVG lines
  const updateRects = useCallback(() => {
    const rects: Record<string, DOMRect | null> = {};
    for (const [name, el] of Object.entries(cardEls.current)) {
      rects[name] = el ? el.getBoundingClientRect() : null;
    }
    setCardRects(rects);
    setTick((t) => t + 1);
  }, []);

  useEffect(() => {
    updateRects();
  }, [positions, updateRects]);

  function handleDrag(name: string, x: number, y: number) {
    setPositions((prev) => ({ ...prev, [name]: { x: Math.max(0, x), y: Math.max(0, y) } }));
  }

  const filtered = tables.filter((t) =>
    t.name.toLowerCase().includes(search.toLowerCase())
  );

  const canvasHeight = useMemo(() => {
    const maxY = Math.max(...Object.values(positions).map((p) => p.y + 280), 600);
    return maxY;
  }, [positions]);

  function handleGenerateMigration() {
    const tableList = tables.map((t) => `- ${t.name} (${t.columns.map((c) => c.name).join(", ")})`).join("\n");
    const prompt = `I need to create a new Supabase SQL migration. Here are the existing tables:\n${tableList}\n\nPlease generate a new migration file for: `;
    onGenerateMigration?.(prompt);
  }

  if (tables.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 p-6 text-center">
        <div className="w-12 h-12 rounded-xl bg-violet-500/10 flex items-center justify-center">
          <Database className="w-6 h-6 text-violet-400" />
        </div>
        <div>
          <p className="text-sm font-medium">No schema found</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Add SQL migration files to your project (e.g. <code className="font-mono">supabase/migrations/*.sql</code>) and they&apos;ll appear here as an ERD diagram.
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="gap-1.5"
          onClick={() =>
            onGenerateMigration?.(
              "Generate an initial Supabase SQL migration with common tables for my app (users/profiles, posts, and comments). Include proper RLS policies and indexes."
            )
          }
        >
          <Zap className="w-3.5 h-3.5" />
          Generate starter schema with AI
        </Button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-2 px-3 py-2.5 border-b border-border shrink-0">
        <Database className="w-4 h-4 text-violet-400 shrink-0" />
        <span className="text-xs font-semibold flex-1">Schema</span>
        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
          {tables.length} tables
        </Badge>
        <Badge variant="outline" className="text-[10px] h-4 px-1.5">
          {fks.length} FK{fks.length !== 1 ? "s" : ""}
        </Badge>
      </div>

      {/* Toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-border shrink-0">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter tables…"
            className="h-7 pl-6 text-xs"
          />
        </div>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 px-2 shrink-0"
          onClick={updateRects}
          title="Refresh layout"
        >
          <RefreshCw className="w-3 h-3" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 px-2 shrink-0"
          onClick={handleGenerateMigration}
          title="Generate migration with AI"
        >
          <GitBranch className="w-3 h-3" />
          Migration
        </Button>
      </div>

      {/* FK legend */}
      {fks.length > 0 && (
        <div className="flex items-center gap-1.5 px-3 py-1.5 border-b border-border/40 bg-muted/20 shrink-0">
          <Link2 className="w-3 h-3 text-violet-400" />
          <span className="text-[10px] text-muted-foreground">
            {fks.length} foreign key relationship{fks.length !== 1 ? "s" : ""} — drag tables to rearrange
          </span>
        </div>
      )}

      {/* Canvas */}
      <div className="flex-1 overflow-auto relative">
        <div
          ref={canvasRef}
          style={{ position: "relative", minWidth: 800, minHeight: canvasHeight }}
          className="bg-[radial-gradient(circle,hsl(var(--border))_1px,transparent_1px)] bg-[size:24px_24px]"
        >
          {/* FK lines */}
          <FkLines fks={fks} cardRects={cardRects} canvasRef={canvasRef} />

          {/* Table cards */}
          {filtered.map((table) => (
            <TableCard
              key={table.name}
              table={table}
              position={positions[table.name] ?? { x: 24, y: 24 }}
              onDrag={handleDrag}
              isHighlighted={fks.some(
                (fk) => fk.fromTable === table.name || fk.toTable === table.name
              )}
              cardRef={(el) => {
                cardEls.current[table.name] = el;
              }}
            />
          ))}
        </div>
      </div>

      {/* Footer — table list */}
      <div className="border-t border-border shrink-0">
        <ScrollArea className="h-28">
          <div className="px-3 py-2 space-y-0.5">
            {tables.map((t) => (
              <button
                key={t.name}
                className="w-full flex items-center gap-2 px-2 py-1 rounded hover:bg-muted/60 text-left group"
                onClick={() => {
                  const pos = positions[t.name];
                  if (!pos || !canvasRef.current) return;
                  canvasRef.current.parentElement?.scrollTo({ left: pos.x - 20, top: pos.y - 20, behavior: "smooth" });
                }}
              >
                <Table2 className="w-3 h-3 text-violet-400 shrink-0" />
                <span className="text-xs flex-1 truncate font-mono">{t.name}</span>
                <span className="text-[10px] text-muted-foreground">{t.columns.length} cols</span>
                {t.columns.some((c) => c.isFk) && (
                  <Link2 className="w-3 h-3 text-sky-400" />
                )}
              </button>
            ))}
          </div>
        </ScrollArea>
      </div>
    </div>
  );
}
