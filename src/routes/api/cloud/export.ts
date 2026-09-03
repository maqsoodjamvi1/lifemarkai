import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { denyUnlessProjectAccess } from "@/lib/project/access";
import { isManagementConfigured,queryManagedSql } from "@/lib/cloud/management";
import { sendEmail } from "@/lib/email/resend";

/** Native /api/cloud/export — GET SQL dump download, POST email the dump. */
const MAX_TABLES = 200;
const MAX_ROWS_PER_TABLE = 5_000;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

interface ExportColumn {
  name: string;
  dataType: string;
  nullable: boolean;
  defaultValue: string | null;
}

function sqlLiteral(v: unknown): string {
  if (v === null || v === undefined) return "NULL";
  if (typeof v === "number" || typeof v === "bigint") return String(v);
  if (typeof v === "boolean") return v ? "true" : "false";
  if (typeof v === "object") return `'${JSON.stringify(v).replace(/'/g, "''")}'::jsonb`;
  return `'${String(v).replace(/'/g, "''")}'`;
}

async function loadCloudProject(supabase: any, projectId: string) {
  const { data: project } = await supabase.from("projects")
    .select("id, name, cloud_enabled, cloud_project_ref, cloud_status").eq("id", projectId).single();
  if (!project) return { error: Response.json({ error: "Project not found" }, { status: 404 }) };
  if (!project.cloud_enabled || !project.cloud_project_ref || !isManagementConfigured()) {
    return { error: Response.json({ error: "Export needs a provisioned Cloud backend. Local-mode Cloud has no managed database to export." }, { status: 400 }) };
  }
  if (project.cloud_status === "paused") {
    return { error: Response.json({ error: "The Cloud backend is paused — wake it up before exporting." }, { status: 409 }) };
  }
  return { project };
}

async function buildDumpSql(projectId: string, projectName: string, ref: string): Promise<string> {
  const chunks: string[] = [
    `-- LifemarkAI database export`,
    `-- Project: ${projectName} (${projectId})`,
    `-- Exported: ${new Date().toISOString()}`,
    `-- Note: data rows capped at ${MAX_ROWS_PER_TABLE} per table.`,
    ``,
  ];
  let totalBytes = 0;

  const tablesRes = await queryManagedSql(ref,
    `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name LIMIT ${MAX_TABLES}`);
  if (!tablesRes.ok) throw new Error(`Could not list tables: ${tablesRes.error}`);

  for (const tableRow of tablesRes.rows) {
    const table_name = typeof tableRow.table_name === "string" ? tableRow.table_name : "";
    if (!/^[a-zA-Z0-9_]+$/.test(table_name)) continue;
    const colsRes = await queryManagedSql(ref,
      `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns WHERE table_schema = 'public' AND table_name = '${table_name}' ORDER BY ordinal_position`);
    if (!colsRes.ok || colsRes.rows.length === 0) continue;

    const columns: ExportColumn[] = colsRes.rows.flatMap((columnRow) => {
      if (typeof columnRow.column_name !== "string" || typeof columnRow.data_type !== "string") return [];
      return [{
        name: columnRow.column_name,
        dataType: columnRow.data_type,
        nullable: columnRow.is_nullable !== "NO",
        defaultValue: typeof columnRow.column_default === "string" ? columnRow.column_default : null,
      }];
    });
    if (columns.length === 0) continue;
    const colDefs = columns.map((column) =>
      `  "${column.name}" ${column.dataType}` + (column.defaultValue ? ` DEFAULT ${column.defaultValue}` : "") + (column.nullable ? "" : " NOT NULL"));
    chunks.push(`-- ── ${table_name} ──`, `CREATE TABLE IF NOT EXISTS "${table_name}" (`, colDefs.join(",\n"), `);`, ``);

    const dataRes = await queryManagedSql(ref, `SELECT * FROM "${table_name}" LIMIT ${MAX_ROWS_PER_TABLE}`);
    if (dataRes.ok && dataRes.rows.length > 0) {
      const cols = columns.map((column) => `"${column.name}"`).join(", ");
      for (const row of dataRes.rows) {
        const values = columns.map((column) => sqlLiteral(row[column.name])).join(", ");
        const stmt = `INSERT INTO "${table_name}" (${cols}) VALUES (${values});`;
        totalBytes += stmt.length;
        if (totalBytes > MAX_TOTAL_BYTES) { chunks.push(`-- Export truncated: 20 MB cap reached.`); break; }
        chunks.push(stmt);
      }
      chunks.push(``);
    }
    if (totalBytes > MAX_TOTAL_BYTES) break;
  }
  return chunks.join("\n");
}

export const Route = createFileRoute("/api/cloud/export")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
        const projectId = new URL(request.url).searchParams.get("projectId");
        if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 });

        const gate = await denyUnlessProjectAccess(supabase, projectId, user.id, "write");
        if ("error" in gate) return gate.error;

        const loaded = await loadCloudProject(supabase, projectId);
        if ("error" in loaded && loaded.error) return loaded.error;
        const project = loaded.project!;
        try {
          const body = await buildDumpSql(projectId, project.name as string, project.cloud_project_ref as string);
          return new Response(body, {
            headers: {
              "Content-Type": "application/sql; charset=utf-8",
              "Content-Disposition": `attachment; filename="${(project.name as string).replace(/[^\w-]+/g, "-")}-export.sql"`,
              "Cache-Control": "no-store",
            },
          });
        } catch (err) {
          return Response.json({ error: err instanceof Error ? err.message : "Export failed" }, { status: 502 });
        }
      },
      POST: async ({ request }) => {
        const supabase = await createClient();
        const { user } = await getServerUser(supabase);
        if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

        const body = (await request.json().catch(() => ({}))) as { projectId?: string; email?: boolean };
        if (!body.projectId) return Response.json({ error: "projectId required" }, { status: 400 });
        if (!body.email) return Response.json({ error: "email: true required for POST" }, { status: 400 });

        const gate = await denyUnlessProjectAccess(supabase, body.projectId, user.id, "write");
        if ("error" in gate) return gate.error;

        const loaded = await loadCloudProject(supabase, body.projectId);
        if ("error" in loaded && loaded.error) return loaded.error;
        const project = loaded.project!;

        const { data: profile } = await supabase.from("profiles").select("email, full_name").eq("id", user.id).single();
        if (!profile?.email) return Response.json({ error: "No email on your account to send the export to." }, { status: 400 });

        try {
          const sql = await buildDumpSql(body.projectId, project.name as string, project.cloud_project_ref as string);
          const filename = `${(project.name as string).replace(/[^\w-]+/g, "-")}-export.sql`;
          const result = await sendEmail({
            to: profile.email,
            subject: `Database export ready — ${project.name}`,
            html: `<p>Hi ${profile.full_name ?? "there"},</p>
<p>Your Lifemark Cloud database export for <strong>${project.name}</strong> is attached (${Math.round(sql.length / 1024)} KB).</p>
<p style="color:#888;font-size:12px">Caps: 200 tables · 5,000 rows/table · 20 MB. Re-export anytime from the Cloud panel.</p>`,
            attachments: [{ filename, content: Buffer.from(sql, "utf8") }],
          });
          if ((result as { error?: unknown })?.error) {
            return Response.json({ error: "Email failed — check RESEND_API_KEY or download the export instead." }, { status: 502 });
          }
          return Response.json({ ok: true, emailedTo: profile.email, bytes: sql.length });
        } catch (err) {
          return Response.json({ error: err instanceof Error ? err.message : "Export failed" }, { status: 502 });
        }
      },
    },
  },
});
