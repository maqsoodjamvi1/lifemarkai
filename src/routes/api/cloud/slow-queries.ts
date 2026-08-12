import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import {
isManagementConfigured,
runManagedSql,
queryManagedSql,
} from "@/lib/cloud/management";
import { generateAI } from "@/lib/ai/generate";
import { getFastAiModel } from "@/lib/ai/model-defaults";
import { parseCloudToolPermissions } from "@/lib/cloud/permissions";
import { rateLimit,RATE_LIMITS } from "@/lib/rate-limit";

/**
 * Slow-query finder — Lovable Cloud parity ("find my slow queries and fix them").
 *
 * GET  /api/cloud/slow-queries?projectId=...
 *   Top 10 statements by mean execution time from pg_stat_statements on the
 *   project's dedicated managed backend. Returns { available: false } when the
 *   project has no managed backend or the extension can't be enabled.
 *
 * POST /api/cloud/slow-queries
 *   { projectId, query }            → AI-suggested CREATE INDEX statements
 *   { projectId, apply: true, sql } → applies an index (Database permission
 *                                     must be "allow", mirroring auto-wire.ts)
 */

interface SlowQueryRow {
  query: string;
  calls: number;
  mean_exec_time_ms: number;
  total_exec_time_ms: number;
  rows: number;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

async function loadOwnedCloudProject(supabase: Supabase, userId: string, projectId: string) {
  const { data: project } = await supabase
    .from("projects")
    .select("id, cloud_enabled, cloud_status, cloud_project_ref")
    .eq("id", projectId)
    .eq("user_id", userId)
    .single();
  return project ?? null;
}

async function handleGET(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const projectId = new URL(req.url).searchParams.get("projectId");
  if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 });

  const project = await loadOwnedCloudProject(supabase, user.id, projectId);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
  if (!project.cloud_enabled) {
    return Response.json({ error: "Cloud not enabled for this project" }, { status: 400 });
  }

  // Local mode (no dedicated backend) → performance stats aren't available.
  if (!project.cloud_project_ref || !isManagementConfigured()) {
    return Response.json({
      available: false,
      reason: "Slow-query stats need a dedicated managed backend. Cloud is running in local mode.",
      queries: [],
    });
  }

  // Best-effort enable — tolerated failure (extension may need superuser or
  // already be in shared_preload_libraries; Supabase projects ship with it).
  await runManagedSql(project.cloud_project_ref, "CREATE EXTENSION IF NOT EXISTS pg_stat_statements;");

  const result = await queryManagedSql<SlowQueryRow>(
    project.cloud_project_ref,
    `SELECT
       query,
       calls,
       round(mean_exec_time::numeric, 2)  AS mean_exec_time_ms,
       round(total_exec_time::numeric, 2) AS total_exec_time_ms,
       rows
     FROM pg_stat_statements
     WHERE query NOT ILIKE '%pg_stat_statements%'
       AND query NOT ILIKE '%pg_catalog%'
     ORDER BY mean_exec_time DESC
     LIMIT 10;`
  );

  if (!result.ok) {
    return Response.json({
      available: false,
      reason: `pg_stat_statements is not available on this backend: ${result.error ?? "query failed"}`,
      queries: [],
    });
  }

  return Response.json({ available: true, queries: result.rows });
}

async function handlePOST(req: Request) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { projectId, query, apply, sql } = await req.json() as {
    projectId: string;
    query?: string;
    apply?: boolean;
    sql?: string;
  };
  if (!projectId) return Response.json({ error: "projectId required" }, { status: 400 });

  const project = await loadOwnedCloudProject(supabase, user.id, projectId);
  if (!project) return Response.json({ error: "Project not found" }, { status: 404 });
  if (!project.cloud_enabled) {
    return Response.json({ error: "Cloud not enabled for this project" }, { status: 400 });
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("cloud_tool_permissions")
    .eq("id", user.id)
    .single();
  const perms = parseCloudToolPermissions(profile?.cloud_tool_permissions);
  const dbPerm = perms.database;

  // ── Apply a suggested index (writes schema → Database permission gate) ─────
  if (apply === true) {
    if (dbPerm !== "allow") {
      return Response.json(
        {
          error: `Database permission is set to "${dbPerm}" — set it to Allow in Cloud → Advanced to apply indexes automatically.`,
          permission: dbPerm,
        },
        { status: 403 }
      );
    }
    if (!sql || typeof sql !== "string") {
      return Response.json({ error: "sql required when apply is true" }, { status: 400 });
    }
    // Only ever run index statements from this endpoint.
    if (!/^\s*create\s+(unique\s+)?index\s/i.test(sql) || sql.split(";").filter((s) => s.trim()).length > 1) {
      return Response.json({ error: "Only a single CREATE INDEX statement can be applied here" }, { status: 400 });
    }
    if (!project.cloud_project_ref || !isManagementConfigured()) {
      return Response.json({ error: "A dedicated managed backend is required to apply indexes" }, { status: 400 });
    }
    const res = await runManagedSql(project.cloud_project_ref, sql);
    if (!res.ok) {
      return Response.json({ error: `Index creation failed: ${res.error ?? "unknown error"}` }, { status: 502 });
    }
    return Response.json({ ok: true, applied: sql });
  }

  // ── Suggest indexes for a slow query (AI, fast tier) ───────────────────────
  if (!query || typeof query !== "string") {
    return Response.json({ error: "query required" }, { status: 400 });
  }

  const rl = rateLimit(user.id, RATE_LIMITS.ai);
  if (!rl.success) {
    return Response.json(
      { error: "Rate limit exceeded. Please wait a moment." },
      { status: 429, headers: { "X-RateLimit-Reset": String(rl.resetAt) } }
    );
  }

  // Schema context (tables/columns + existing indexes) makes suggestions
  // concrete. Read-only, best-effort, skipped when Database is set to Never.
  let schemaContext = "";
  if (dbPerm !== "never" && project.cloud_project_ref && isManagementConfigured()) {
    const [cols, idx] = await Promise.all([
      queryManagedSql(
        project.cloud_project_ref,
        `SELECT table_name, column_name, data_type
         FROM information_schema.columns
         WHERE table_schema = 'public'
         ORDER BY table_name, ordinal_position
         LIMIT 200;`
      ),
      queryManagedSql(
        project.cloud_project_ref,
        `SELECT indexname, indexdef FROM pg_indexes WHERE schemaname = 'public' LIMIT 100;`
      ),
    ]);
    if (cols.ok && cols.rows.length > 0) {
      schemaContext += `\n\nTables and columns (public schema):\n${cols.rows
        .map((r) => `${r.table_name}.${r.column_name} (${r.data_type})`)
        .join("\n")}`;
    }
    if (idx.ok && idx.rows.length > 0) {
      schemaContext += `\n\nExisting indexes:\n${idx.rows.map((r) => r.indexdef).join("\n")}`;
    }
  }

  try {
    const result = await generateAI(
      {
        model: getFastAiModel(),
        jsonMode: true,
        maxTokens: 900,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              `You are a PostgreSQL performance expert. Given a slow query (and schema context when available), suggest indexes that would speed it up. ` +
              `Respond with JSON only, exactly this shape: {"analysis": "<one short paragraph on why the query is slow>", "indexes": [{"sql": "CREATE INDEX ...;", "reason": "<one sentence>"}]}. ` +
              `Rules: max 3 indexes; use CREATE INDEX IF NOT EXISTS with descriptive idx_ names; never suggest an index that already exists; ` +
              `if no index would help, return an empty "indexes" array and explain why in "analysis".`,
          },
          {
            role: "user",
            content: `Slow query:\n${query.slice(0, 4000)}${schemaContext.slice(0, 6000)}`,
          },
        ],
      },
      { projectId, userId: user.id, task: "slow_query_indexes" }
    );

    let parsed: { analysis?: string; indexes?: Array<{ sql: string; reason?: string }> } = {};
    try {
      parsed = JSON.parse(result.content.replace(/^```(json)?/m, "").replace(/```\s*$/m, "").trim());
    } catch {
      // Fallback: pull CREATE INDEX statements straight out of the text.
      const matches = result.content.match(/CREATE\s+(UNIQUE\s+)?INDEX[^;]+;/gi) ?? [];
      parsed = { analysis: "Suggested indexes:", indexes: matches.map((m) => ({ sql: m })) };
    }

    const indexes = (parsed.indexes ?? [])
      .filter((i) => i && typeof i.sql === "string" && /^\s*create\s+(unique\s+)?index\s/i.test(i.sql))
      .slice(0, 3)
      .map((i) => ({ sql: i.sql.trim(), reason: i.reason ?? "" }));

    return Response.json({
      analysis: parsed.analysis ?? "",
      indexes,
      canApply: dbPerm === "allow" && !!project.cloud_project_ref && isManagementConfigured(),
      permission: dbPerm,
    });
  } catch (err) {
    return Response.json(
      { error: err instanceof Error ? err.message : "AI suggestion failed" },
      { status: 502 }
    );
  }
}


export const Route = createFileRoute("/api/cloud/slow-queries")({
  server: {
    handlers: {
      GET: async ({ request }) => handleGET(request),
      POST: async ({ request }) => handlePOST(request),
    },
  },
});
