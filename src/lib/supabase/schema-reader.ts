/**
 * Supabase live schema reader
 * Fetches the actual database schema (tables, columns, foreign keys) for a project
 * and returns a compact string suitable for injection into AI system prompts.
 */

export interface ColumnInfo {
  name: string;
  type: string;
  nullable: boolean;
  default?: string | null;
}

export interface TableInfo {
  name: string;
  columns: ColumnInfo[];
  foreignKeys: Array<{ column: string; refTable: string; refColumn: string }>;
  rowCount?: number;
}

/**
 * Read the schema from a Supabase project using a service-role key.
 * Falls back to an empty array if the key isn't configured or the query fails.
 */
export async function readSupabaseSchema(
  supabaseUrl: string,
  serviceKey: string
): Promise<TableInfo[]> {
  try {
    // Query information_schema for public tables + columns
    const columnsUrl = `${supabaseUrl}/rest/v1/rpc/schema_info`;

    // Use the information_schema endpoint via PostgREST
    const colRes = await fetch(
      `${supabaseUrl}/rest/v1/`,
      {
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
      }
    );

    if (!colRes.ok) return [];

    const definitions = (await colRes.json()) as Record<string, unknown>;
    if (!definitions || typeof definitions !== "object") return [];

    // PostgREST returns a OpenAPI spec — extract path definitions as table names
    const paths = (definitions as { paths?: Record<string, unknown> }).paths ?? {};
    const tables: TableInfo[] = Object.keys(paths)
      .filter((p) => p.startsWith("/") && !p.includes("{"))
      .map((p) => {
        const name = p.slice(1);
        // Extract column info from OpenAPI definitions if present
        const defs = (definitions as { definitions?: Record<string, unknown> }).definitions ?? {};
        const tableDef = (defs[name] ?? {}) as {
          properties?: Record<string, { type?: string; format?: string; description?: string }>;
          required?: string[];
        };
        const properties = tableDef.properties ?? {};
        const required = new Set(tableDef.required ?? []);

        const columns: ColumnInfo[] = Object.entries(properties).map(([colName, colDef]) => ({
          name: colName,
          type: colDef.format ?? colDef.type ?? "unknown",
          nullable: !required.has(colName),
        }));

        return { name, columns, foreignKeys: [] };
      })
      .filter((t) => !t.name.startsWith("_") && t.columns.length > 0);

    return tables;
  } catch {
    return [];
  }
}

/**
 * Build a compact schema summary string for injection into AI prompts.
 * Outputs each table as:
 *   table_name (col1: type, col2: type, ...)
 */
export function buildSchemaContextBlock(tables: TableInfo[], maxChars = 4000): string {
  if (!tables.length) return "";

  const lines: string[] = [
    "## Live Database Schema (Supabase)",
    `${tables.length} table(s) detected in the public schema:`,
    "",
  ];

  let chars = lines.join("\n").length;

  for (const table of tables) {
    const cols = table.columns
      .map((c) => `${c.name}: ${c.type}${c.nullable ? "?" : ""}`)
      .join(", ");
    const line = `  ${table.name} (${cols})`;
    if (chars + line.length > maxChars) {
      lines.push(`  ... (${tables.length - lines.length + 3} more tables omitted)`);
      break;
    }
    lines.push(line);
    chars += line.length + 1;
  }

  return lines.join("\n");
}

/**
 * Convenience: fetch schema for the project's Supabase instance (if env vars set),
 * then return the context block string. Used in API routes.
 */
export async function getProjectSchemaContext(
  projectSupabaseUrl?: string | null,
  projectServiceKey?: string | null
): Promise<string> {
  // Use project-level overrides if provided, otherwise fall back to platform defaults.
  const url = projectSupabaseUrl || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = projectServiceKey || process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) return "";

  const tables = await readSupabaseSchema(url, key);
  if (!tables.length) return "";

  return buildSchemaContextBlock(tables);
}
