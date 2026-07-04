/**
 * Database import for Lovable (and any Supabase-backed) projects.
 *
 * Two ingredients make a COMPLETE import:
 *  - SCHEMA: Lovable's AI writes schema changes as `supabase/migrations/*.sql`
 *    in the synced repo, so the code import usually already carries the full
 *    schema — we just concatenate the migrations in filename order.
 *  - DATA: pulled live from the source Supabase project over PostgREST.
 *    `GET {url}/rest/v1/` with the service key returns the OpenAPI document,
 *    whose `definitions` enumerate every exposed table; each table is then
 *    dumped with ranged GETs. Pure HTTPS — no pg wire protocol needed.
 *
 * Credentials are used transiently and never persisted or logged.
 */

export interface ImportedTable {
  name: string;
  rows: Record<string, unknown>[];
  truncated: boolean;
}

export interface DbDumpResult {
  tables: ImportedTable[];
  skippedTables: string[];
  totalRows: number;
}

const MAX_TABLES = 50;
const MAX_ROWS_PER_TABLE = 5000;
const PAGE_SIZE = 1000;

/** Tables that are Supabase-internal or huge/derived — never worth copying. */
const SKIP_TABLES = new Set([
  "schema_migrations", "supabase_migrations", "secrets", "buckets", "objects",
]);

/** Concatenate the repo's SQL migrations (filename order = chronological). */
export function extractSchemaFromFiles(
  files: Array<{ path: string; content: string }>,
): { schemaSql: string; migrationCount: number } {
  const migrations = files
    .filter((f) => /^supabase\/migrations\/[^/]+\.sql$/.test(f.path))
    .sort((a, b) => a.path.localeCompare(b.path));
  const schemaSql = migrations
    .map((m) => `-- ── ${m.path} ${"─".repeat(Math.max(4, 60 - m.path.length))}\n${m.content.trim()}`)
    .join("\n\n");
  return { schemaSql, migrationCount: migrations.length };
}

function restHeaders(serviceKey: string): Record<string, string> {
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` };
}

/** List exposed tables via the PostgREST OpenAPI root. */
export async function listSourceTables(sourceUrl: string, serviceKey: string): Promise<string[]> {
  const base = sourceUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/rest/v1/`, {
    headers: restHeaders(serviceKey),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) {
    throw new Error(
      res.status === 401 || res.status === 403
        ? "Source database rejected the key — use the service_role key (Project Settings → API)."
        : `Source database unreachable (${res.status}).`,
    );
  }
  const spec = (await res.json()) as { definitions?: Record<string, unknown>; paths?: Record<string, unknown> };
  const names = spec.definitions
    ? Object.keys(spec.definitions)
    : Object.keys(spec.paths ?? {})
        .filter((p) => /^\/[\w]+$/.test(p))
        .map((p) => p.slice(1));
  return names.filter((n) => !SKIP_TABLES.has(n)).slice(0, MAX_TABLES);
}

/** Dump table data with ranged pagination. */
export async function dumpSourceDatabase(
  sourceUrl: string,
  serviceKey: string,
): Promise<DbDumpResult> {
  const base = sourceUrl.replace(/\/$/, "");
  const tableNames = await listSourceTables(base, serviceKey);

  const tables: ImportedTable[] = [];
  const skippedTables: string[] = [];
  let totalRows = 0;

  for (const name of tableNames) {
    try {
      const rows: Record<string, unknown>[] = [];
      let truncated = false;
      for (let offset = 0; offset < MAX_ROWS_PER_TABLE; offset += PAGE_SIZE) {
        const res = await fetch(`${base}/rest/v1/${encodeURIComponent(name)}?select=*`, {
          headers: {
            ...restHeaders(serviceKey),
            Range: `${offset}-${offset + PAGE_SIZE - 1}`,
            "Range-Unit": "items",
            Prefer: "count=none",
          },
          signal: AbortSignal.timeout(30_000),
        });
        if (!res.ok) { skippedTables.push(name); rows.length = 0; break; }
        const page = (await res.json()) as Record<string, unknown>[];
        rows.push(...page);
        if (page.length < PAGE_SIZE) break;
        if (offset + PAGE_SIZE >= MAX_ROWS_PER_TABLE) truncated = true;
      }
      if (rows.length > 0) {
        tables.push({ name, rows, truncated });
        totalRows += rows.length;
      } else if (!skippedTables.includes(name)) {
        tables.push({ name, rows: [], truncated: false });
      }
    } catch {
      skippedTables.push(name);
    }
  }
  return { tables, skippedTables, totalRows };
}

/** SQL-literal encoding for a JS value coming out of PostgREST JSON. */
function sqlLiteral(value: unknown): string {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "NULL";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") {
    // json / jsonb / arrays — serialize and cast
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`;
  }
  return `'${String(value).replace(/'/g, "''")}'`;
}

/**
 * Build idempotent seed SQL: INSERT … ON CONFLICT DO NOTHING per table,
 * batched 100 rows per statement. Column set is the union across rows so
 * sparse rows don't corrupt column alignment.
 */
export function buildSeedSql(tables: ImportedTable[]): string {
  const parts: string[] = [
    "-- Data imported from the source Supabase project.",
    "-- Idempotent: re-running skips rows whose primary key already exists.",
    "SET session_replication_role = replica; -- relax FK ordering during seed",
    "",
  ];
  for (const table of tables) {
    if (table.rows.length === 0) continue;
    const columns = [...new Set(table.rows.flatMap((r) => Object.keys(r)))];
    const colList = columns.map((c) => `"${c.replace(/"/g, "")}"`).join(", ");
    parts.push(`-- ${table.name}: ${table.rows.length} rows${table.truncated ? " (truncated at export cap)" : ""}`);
    for (let i = 0; i < table.rows.length; i += 100) {
      const batch = table.rows.slice(i, i + 100);
      const values = batch
        .map((row) => `  (${columns.map((c) => sqlLiteral(row[c])).join(", ")})`)
        .join(",\n");
      parts.push(
        `INSERT INTO "${table.name.replace(/"/g, "")}" (${colList})\nVALUES\n${values}\nON CONFLICT DO NOTHING;`,
      );
    }
    parts.push("");
  }
  parts.push("SET session_replication_role = DEFAULT;");
  return parts.join("\n");
}
