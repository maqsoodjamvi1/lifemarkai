// @ts-nocheck
import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";
import { isManagementConfigured, queryManagedSql } from "@/lib/cloud/management";

/**
 * GET /api/cloud/export?projectId=… — user-facing database export.
 *
 * Lovable parity (Jul 3 2026: "Export or remove Lovable Cloud data"):
 * produces a portable SQL dump (schema + data as INSERTs) of the project's
 * managed database, streamed back as a .sql download. Caps keep it sane:
 * 200 tables, 5 000 rows/table, ~20 MB total.
 */
export const maxDuration = 120;

const MAX_TABLES = 200;
const MAX_ROWS_PER_TABLE = 5_000;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = req.nextUrl.searchParams.get("projectId");
  if (!projectId) return NextResponse.json({ error: "projectId required" }, { status: 400 });

  const { data: project } = await supabase
    .from("projects")
    .select("id, name, cloud_enabled, cloud_project_ref, cloud_status")
    .eq("id", projectId)
    .eq("user_id", user.id)
    .single();
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  if (!project.cloud_enabled || !project.cloud_project_ref || !isManagementConfigured()) {
    return NextResponse.json(
      { error: "Export needs a provisioned Cloud backend. Local-mode Cloud has no managed database to export." },
      { status: 400 },
    );
  }
  if (project.cloud_status === "paused") {
    return NextResponse.json({ error: "The Cloud backend is paused — wake it up before exporting." }, { status: 409 });
  }

  const ref = project.cloud_project_ref as string;
  const chunks: string[] = [
    `-- LifemarkAI database export`,
    `-- Project: ${project.name} (${projectId})`,
    `-- Exported: ${new Date().toISOString()}`,
    `-- Note: data rows capped at ${MAX_ROWS_PER_TABLE} per table.`,
    ``,
  ];
  let totalBytes = 0;

  // 1. Table list (public schema, ordinary tables)
  const tablesRes = await queryManagedSql<{ table_name: string }>(
    ref,
    `SELECT table_name FROM information_schema.tables
     WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
     ORDER BY table_name LIMIT ${MAX_TABLES}`,
  );
  if (!tablesRes.ok) {
    return NextResponse.json({ error: `Could not list tables: ${tablesRes.error}` }, { status: 502 });
  }

  for (const { table_name } of tablesRes.rows) {
    if (!/^[a-zA-Z0-9_]+$/.test(table_name)) continue; // paranoia
    // 2. Schema: reconstruct a CREATE TABLE from information_schema
    const colsRes = await queryManagedSql<{
      column_name: string; data_type: string; is_nullable: string; column_default: string | null;
    }>(
      ref,
      `SELECT column_name, data_type, is_nullable, column_default
       FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = '${table_name}'
       ORDER BY ordinal_position`,
    );
    if (!colsRes.ok || colsRes.rows.length === 0) continue;

    const colDefs = colsRes.rows.map((c) =>
      `  "${c.column_name}" ${c.data_type}` +
      (c.column_default ? ` DEFAULT ${c.column_default}` : "") +
      (c.is_nullable === "NO" ? " NOT NULL" : ""),
    );
    chunks.push(`-- ── ${table_name} ──`, `CREATE TABLE IF NOT EXISTS "${table_name}" (`, colDefs.join(",\n"), `);`, ``);

    // 3. Data as INSERTs
    const dataRes = await queryManagedSql<Record<string, unknown>>(
      ref,
      `SELECT * FROM "${table_name}" LIMIT ${MAX_ROWS_PER_TABLE}`,
    );
    if (dataRes.ok && dataRes.rows.length > 0) {
      const cols = colsRes.rows.map((c) => `"${c.column_name}"`).join(", ");
      for (const row of dataRes.rows) {
        const values = colsRes.rows.map((c) => sqlLiteral(row[c.column_name])).join(", ");
        const stmt = `INSERT INTO "${table_name}" (${cols}) VALUES (${values});`;
        totalBytes += stmt.length;
        if (totalBytes > MAX_TOTAL_BYTES) {
          chunks.push(`-- Export truncated: 20 MB cap reached.`);
          break;
        }
        chunks.push(stmt);
      }
      chunks.push(``);
    }
    if (totalBytes > MAX_TOTAL_BYTES) break;
  }

  const body = chunks.join("\n");
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/sql; charset=utf-8",
      "Content-Disposition": `attachment; filename="${(project.name as string).replace(/[^\w-]+/g, "-")}-export.sql"`,
      "Cache-Control": "no-store",
    },
  });
}
