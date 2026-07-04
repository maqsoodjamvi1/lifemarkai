// @ts-nocheck
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { rateLimitAsync, RATE_LIMITS } from "@/lib/rate-limit";
import {
  extractSchemaFromFiles,
  dumpSourceDatabase,
  buildSeedSql,
} from "@/lib/import/lovable-db";

export const runtime = "nodejs";
export const maxDuration = 300;

interface Params { params: Promise<{ id: string }> }

/**
 * POST /api/projects/[id]/import-database
 * Body: { sourceUrl: string, sourceServiceKey: string }
 *
 * Completes a Lovable/Supabase import by bringing the DATABASE over:
 *  - schema: the repo's supabase/migrations/*.sql (already in project_files)
 *  - data:   dumped live from the source Supabase over PostgREST
 *
 * Apply strategy:
 *  - target project has a Lifemark Cloud managed backend (cloud_ref) AND the
 *    Database tool permission allows it → schema + seed are EXECUTED there;
 *  - otherwise → written into the project as supabase/import/schema.sql +
 *    seed.sql, ready to run from the DB panel / SQL editor.
 *
 * Source credentials are used for this request only — never stored or logged.
 */
export async function POST(req: NextRequest, { params }: Params) {
  const { id: projectId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(`db-import:${user.id}`, RATE_LIMITS.api);
  if (!rl.success) return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });

  // Owner-only: this executes SQL / writes files.
  const { data: project } = await (supabase as any)
    .from("projects")
    .select("id, user_id, environment, cloud_enabled, cloud_ref")
    .eq("id", projectId)
    .single();
  if (!project || project.user_id !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  // Live lock (migration 046): database writes are code-adjacent state changes.
  if (project.environment === "live") {
    return NextResponse.json(
      { environment_locked: true, error: "Project is Live — switch to Test to import a database." },
      { status: 423 },
    );
  }

  const { sourceUrl, sourceServiceKey } = (await req.json()) as {
    sourceUrl?: string;
    sourceServiceKey?: string;
  };
  if (!sourceUrl || !/^https:\/\/[\w-]+\.supabase\.co\/?$/.test(sourceUrl.trim())) {
    return NextResponse.json(
      { error: "sourceUrl must be a Supabase project URL (https://xxxx.supabase.co)" },
      { status: 400 },
    );
  }
  if (!sourceServiceKey || sourceServiceKey.length < 30) {
    return NextResponse.json({ error: "sourceServiceKey (service_role) is required" }, { status: 400 });
  }

  try {
    // ── 1. Schema from the imported repo migrations ──────────────────────────
    const { data: fileRows } = await (supabase as any)
      .from("project_files")
      .select("path, content")
      .eq("project_id", projectId)
      .like("path", "supabase/migrations/%");
    const { schemaSql, migrationCount } = extractSchemaFromFiles(fileRows ?? []);

    // ── 2. Data from the source database ─────────────────────────────────────
    const dump = await dumpSourceDatabase(sourceUrl.trim(), sourceServiceKey.trim());
    const seedSql = buildSeedSql(dump.tables);
    const tablesWithData = dump.tables.filter((t) => t.rows.length > 0);

    // ── 3. Apply or stage ─────────────────────────────────────────────────────
    let applied = false;
    let applyError: string | null = null;

    if (project.cloud_enabled && project.cloud_ref) {
      // Respect the Database tool permission (same gate as auto-wire).
      const { parseCloudToolPermissions } = await import("@/lib/cloud/permissions");
      const { data: profile } = await (supabase as any)
        .from("profiles").select("cloud_tool_permissions").eq("id", user.id).single();
      const perms = parseCloudToolPermissions(profile?.cloud_tool_permissions);

      if (perms.database === "allow") {
        const { runManagedSql } = await import("@/lib/cloud/management");
        if (schemaSql) {
          const schemaRes = await runManagedSql(project.cloud_ref, schemaSql);
          if (!schemaRes.ok) applyError = `schema: ${schemaRes.error}`;
        }
        if (!applyError && tablesWithData.length > 0) {
          const seedRes = await runManagedSql(project.cloud_ref, seedSql);
          if (!seedRes.ok) applyError = `data: ${seedRes.error}`;
        }
        applied = !applyError;
      } else {
        applyError = "Database permission is set to \"" + perms.database + "\" — staged as files instead (change it in the Cloud panel to auto-apply).";
      }
    }

    // Always stage the SQL into the project too (audit trail + manual path).
    const staged: Array<{ path: string; content: string; language: string }> = [];
    if (schemaSql) {
      staged.push({ path: "supabase/import/schema.sql", content: schemaSql, language: "sql" });
    }
    if (tablesWithData.length > 0) {
      staged.push({ path: "supabase/import/seed.sql", content: seedSql, language: "sql" });
    }
    for (const f of staged) {
      await (supabase as any).from("project_files").upsert(
        { project_id: projectId, path: f.path, content: f.content, language: f.language },
        { onConflict: "project_id,path" },
      );
    }

    // Progress note into chat (best-effort).
    try {
      const summary = [
        `🗄️ **Database import ${applied ? "complete" : "staged"}** — ${tablesWithData.length} tables, ${dump.totalRows} rows${migrationCount ? `, schema from ${migrationCount} migrations` : ", no repo migrations found"}.`,
        applied
          ? "Schema + data were applied to your Lifemark Cloud backend."
          : `SQL staged at \`supabase/import/\` — run it from the DB panel${applyError ? ` (${applyError})` : ""}.`,
        dump.skippedTables.length ? `Skipped tables: ${dump.skippedTables.join(", ")}.` : "",
        dump.tables.some((t) => t.truncated) ? "Some tables were capped at 5,000 rows." : "",
      ].filter(Boolean).join("\n\n");
      await (supabase as any).from("messages").insert({
        project_id: projectId,
        role: "assistant",
        mode: "chat",
        content: summary,
        metadata: { imported_from: "lovable-db" },
      });
    } catch { /* non-fatal */ }

    return NextResponse.json({
      applied,
      applyError,
      migrationCount,
      tables: tablesWithData.length,
      totalRows: dump.totalRows,
      skippedTables: dump.skippedTables,
      truncatedTables: dump.tables.filter((t) => t.truncated).map((t) => t.name),
      stagedFiles: staged.map((f) => f.path),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: "Database import failed: " + message }, { status: 502 });
  }
}
