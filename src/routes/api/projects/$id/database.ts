import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@/lib/supabase/server";
import { getServerUser } from "@/lib/supabase/server-user";
import { denyUnlessProjectAccess } from "@/lib/project/access";
import { rateLimitAsync,RATE_LIMITS } from "@/lib/rate-limit";
import { resolveAppBackend } from "@/lib/cloud/project-backend";
import { queryManagedSql,runManagedSql } from "@/lib/cloud/management";
import { getOrRefreshGatewayToken } from "@/lib/oauth/gateway-tokens";
import { queryUserSupabaseSql,supabaseRefFromProjectUrl } from "@/lib/cloud/user-supabase";


interface Params { params: Promise<{ id: string }> }

/**
 * Database Manager for the APP BEING BUILT (per-project backend) — NOT the
 * platform database. Lovable-Cloud-style table browser / editor / SQL runner.
 *
 * Backend resolution (per project):
 *  1. cloud_enabled + cloud_project_ref  → managed Lifemark Cloud backend (Management API SQL)
 *  2. VITE_SUPABASE_URL in the app's .env.local → the app's own Supabase over
 *     PostgREST (service key preferred; anon key works but RLS applies)
 *  3. neither → { backend: "none" } so the panel shows a CTA.
 */

const IDENT_RE = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
const BLOCKED_SQL_RE = /^\s*(drop\s+database|truncate\s+auth|delete\s+from\s+auth)/i;

// ── SQL literal encoder (same pattern as lib/import/lovable-db.ts) ──────────
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

function badIdent(name: string): boolean {
  return typeof name !== "string" || !IDENT_RE.test(name);
}

type Backend = Awaited<ReturnType<typeof resolveAppBackend>>;
type Supabase = Awaited<ReturnType<typeof createClient>>;
interface OwnedProject {
  id: string;
  user_id: string;
  environment: string;
  cloud_enabled: boolean;
  cloud_project_ref: string | null;
}

async function resolveBackend(supabase: Supabase, project: OwnedProject): Promise<Backend> {
  return resolveAppBackend(supabase, project);
}

function restHeaders(key: string): Record<string, string> {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    "Content-Type": "application/json",
  };
}

/** Project row after collaborator/owner access is confirmed. */
async function loadProjectRow(supabase: Supabase, projectId: string) {
  const { data: project } = await supabase
    .from("projects")
    .select("id, user_id, environment, cloud_enabled, cloud_project_ref")
    .eq("id", projectId)
    .single();
  if (!project) {
    return { project: null, error: Response.json({ error: "Project not found" }, { status: 404 }) };
  }
  return { project: project as OwnedProject, error: null };
}

// ── GET — ?action=tables | ?action=rows&table=X&limit=50&offset=0 ────────────
async function handleGET(req: Request, params: any) {
  const { id: projectId } = params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(`db-manager:${user.id}`, RATE_LIMITS.api);
  if (!rl.success) return Response.json({ error: "Rate limit exceeded" }, { status: 429 });

  const gate = await denyUnlessProjectAccess(supabase, projectId, user.id, "read");
  if ("error" in gate) return gate.error;
  const { project, error } = await loadProjectRow(supabase, projectId);
  if (error) return error;

  const backend = await resolveBackend(supabase, project);
  const action = new URL(req.url).searchParams.get("action") ?? "tables";

  try {
    if (action === "auth_users") {
      if (backend.kind === "none") {
        return Response.json({ backend: "none", users: [] });
      }
      if (backend.kind === "cloud") {
        const res = await queryManagedSql<{
          id: string;
          email: string | null;
          created_at: string | null;
          last_sign_in_at: string | null;
        }>(
          backend.ref,
          `SELECT id::text, email, created_at::text, last_sign_in_at::text
           FROM auth.users
           ORDER BY created_at DESC NULLS LAST
           LIMIT 100`,
        );
        if (!res.ok) return Response.json({ error: res.error }, { status: 502 });
        return Response.json({ backend: "cloud", users: res.rows ?? [] });
      }
      if (backend.rls) {
        return Response.json({
          backend: "supabase",
          users: [],
          note: "Listing users needs the project's service role key (Connect Supabase with OAuth, or add SUPABASE_SERVICE_ROLE_KEY).",
        });
      }
      const res = await fetch(`${backend.url}/auth/v1/admin/users?page=1&per_page=100`, {
        headers: restHeaders(backend.key),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return Response.json({ error: `Auth admin ${res.status}: ${body.slice(0, 300)}` }, { status: 502 });
      }
      const payload = (await res.json()) as { users?: Array<{ id: string; email?: string; created_at?: string; last_sign_in_at?: string }> };
      const users = (payload.users ?? []).map((u) => ({
        id: u.id,
        email: u.email ?? null,
        created_at: u.created_at ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
      }));
      return Response.json({ backend: "supabase", users });
    }

    if (action === "tables") {
      if (backend.kind === "none") {
        return Response.json({ backend: "none", tables: [] });
      }
      if (backend.kind === "cloud") {
        const tables = await listCloudTables(backend.ref);
        return Response.json({ backend: "cloud", tables });
      }
      const tables = await listRestTables(backend.url, backend.key);
      return Response.json({
        backend: "supabase",
        tables,
        ...(backend.rls
          ? { note: "Connected with the anon key — Row Level Security policies apply to reads and writes." }
          : {}),
      });
    }

    if (action === "rows") {
      const table = new URL(req.url).searchParams.get("table") ?? "";
      if (badIdent(table)) {
        return Response.json({ error: "Invalid table name" }, { status: 400 });
      }
      const limit = Math.min(Math.max(parseInt(new URL(req.url).searchParams.get("limit") ?? "50", 10) || 50, 1), 200);
      const offset = Math.max(parseInt(new URL(req.url).searchParams.get("offset") ?? "0", 10) || 0, 0);

      if (backend.kind === "none") {
        return Response.json({ backend: "none", rows: [] });
      }
      if (backend.kind === "cloud") {
        const dataRes = await queryManagedSql(
          backend.ref,
          `SELECT * FROM "public"."${table}" LIMIT ${limit} OFFSET ${offset}`,
        );
        if (!dataRes.ok) return Response.json({ error: dataRes.error }, { status: 502 });
        const countRes = await queryManagedSql(
          backend.ref,
          `SELECT count(*)::bigint AS total FROM "public"."${table}"`,
        );
        const total = countRes.ok ? Number(countRes.rows?.[0]?.total ?? 0) : undefined;
        return Response.json({ backend: "cloud", rows: dataRes.rows, total });
      }
      // PostgREST — ranged GET with exact count
      const res = await fetch(
        `${backend.url}/rest/v1/${table}?select=*&limit=${limit}&offset=${offset}`,
        { headers: { ...restHeaders(backend.key), Prefer: "count=exact" } },
      );
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return Response.json({ error: `PostgREST ${res.status}: ${body.slice(0, 300)}` }, { status: 502 });
      }
      const rows = await res.json();
      const totalPart = res.headers.get("content-range")?.split("/")[1];
      const total = totalPart && totalPart !== "*" ? Number(totalPart) : undefined;
      return Response.json({ backend: "supabase", rows, total, ...(backend.rls ? { rls: true } : {}) });
    }

    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Database request failed: " + message }, { status: 502 });
  }
}

// ── POST — insert / update / delete / sql ────────────────────────────────────
async function handlePOST(req: Request, params: any) {
  const { id: projectId } = params;
  const supabase = await createClient();
  const { user } = await getServerUser(supabase);
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const rl = await rateLimitAsync(`db-manager:${user.id}`, RATE_LIMITS.api);
  if (!rl.success) return Response.json({ error: "Rate limit exceeded" }, { status: 429 });

  const gate = await denyUnlessProjectAccess(supabase, projectId, user.id, "write");
  if ("error" in gate) return gate.error;
  const { project, error } = await loadProjectRow(supabase, projectId);
  if (error) return error;

  // Live lock (migration 046): all writes blocked on Live; reads stay allowed.
  if (project.environment === "live") {
    return Response.json(
      { environment_locked: true, error: "Project is Live — switch to Test to modify data." },
      { status: 423 },
    );
  }

  const body = await req.json().catch(() => ({}));
  const action = body?.action as string;
  const backend = await resolveBackend(supabase, project);
  if (backend.kind === "none") {
    return Response.json({ backend: "none", error: "No backend connected" }, { status: 400 });
  }

  try {
    // SQL runner: managed Cloud (platform token) or own Supabase (user OAuth).
    if (action === "sql") {
      const sql = String(body?.sql ?? "").trim();
      if (!sql) return Response.json({ error: "sql is required" }, { status: 400 });
      if (BLOCKED_SQL_RE.test(sql)) {
        return Response.json({ error: "This statement is blocked for safety." }, { status: 400 });
      }
      if (backend.kind === "cloud") {
        const res = await queryManagedSql(backend.ref, sql);
        if (!res.ok) return Response.json({ error: res.error }, { status: 502 });
        return Response.json({ ok: true, rows: res.rows ?? [] });
      }
      const ref = supabaseRefFromProjectUrl(backend.url);
      if (!ref) {
        return Response.json(
          { error: "Could not read a Supabase project ref from VITE_SUPABASE_URL. SQL needs a hosted *.supabase.co project." },
          { status: 400 },
        );
      }
      const token = await getOrRefreshGatewayToken(supabase, user.id, "supabase");
      if (!token) {
        return Response.json(
          { error: "Connect your Supabase account (Cloud → Connect existing) to run SQL on this project." },
          { status: 400 },
        );
      }
      const res = await queryUserSupabaseSql(token, ref, sql);
      if (!res.ok) return Response.json({ error: res.error }, { status: 502 });
      return Response.json({ ok: true, rows: res.rows ?? [] });
    }

    // ── Row mutations — validate every identifier before touching SQL ──────
    const table = body?.table as string;
    if (badIdent(table)) return Response.json({ error: "Invalid table name" }, { status: 400 });

    if (action === "insert" || action === "update") {
      const values = body?.values;
      if (!values || typeof values !== "object" || Array.isArray(values) || Object.keys(values).length === 0) {
        return Response.json({ error: "values object is required" }, { status: 400 });
      }
      for (const col of Object.keys(values)) {
        if (badIdent(col)) return Response.json({ error: `Invalid column name: ${col}` }, { status: 400 });
      }
    }
    if (action === "update" || action === "delete") {
      if (badIdent(body?.pk)) return Response.json({ error: "Invalid primary key column" }, { status: 400 });
      if (body?.pkValue === undefined || body?.pkValue === null) {
        return Response.json({ error: "pkValue is required" }, { status: 400 });
      }
    }

    if (backend.kind === "cloud") {
      if (action === "insert") {
        const cols = Object.keys(body.values);
        const sql =
          `INSERT INTO "public"."${table}" (${cols.map((c) => `"${c}"`).join(", ")}) ` +
          `VALUES (${cols.map((c) => sqlLiteral(body.values[c])).join(", ")}) RETURNING *`;
        const res = await queryManagedSql(backend.ref, sql);
        if (!res.ok) return Response.json({ error: res.error }, { status: 502 });
        return Response.json({ ok: true, rows: res.rows ?? [] });
      }
      if (action === "update") {
        const sets = Object.entries(body.values)
          .map(([c, v]) => `"${c}" = ${sqlLiteral(v)}`)
          .join(", ");
        const sql =
          `UPDATE "public"."${table}" SET ${sets} ` +
          `WHERE "${body.pk}" = ${sqlLiteral(body.pkValue)} RETURNING *`;
        const res = await queryManagedSql(backend.ref, sql);
        if (!res.ok) return Response.json({ error: res.error }, { status: 502 });
        return Response.json({ ok: true, rows: res.rows ?? [] });
      }
      if (action === "delete") {
        const sql = `DELETE FROM "public"."${table}" WHERE "${body.pk}" = ${sqlLiteral(body.pkValue)}`;
        const res = await runManagedSql(backend.ref, sql);
        if (!res.ok) return Response.json({ error: res.error }, { status: 502 });
        return Response.json({ ok: true });
      }
      return Response.json({ error: "Unknown action" }, { status: 400 });
    }

    // ── PostgREST verbs (the app's own Supabase) ────────────────────────────
    const h = restHeaders(backend.key);
    const filter = action !== "insert" ? `?${body.pk}=eq.${encodeURIComponent(String(body.pkValue))}` : "";

    let res: Response;
    if (action === "insert") {
      res = await fetch(`${backend.url}/rest/v1/${table}`, {
        method: "POST",
        headers: { ...h, Prefer: "return=representation" },
        body: JSON.stringify(body.values),
      });
    } else if (action === "update") {
      res = await fetch(`${backend.url}/rest/v1/${table}${filter}`, {
        method: "PATCH",
        headers: { ...h, Prefer: "return=representation" },
        body: JSON.stringify(body.values),
      });
    } else if (action === "delete") {
      res = await fetch(`${backend.url}/rest/v1/${table}${filter}`, { method: "DELETE", headers: h });
    } else {
      return Response.json({ error: "Unknown action" }, { status: 400 });
    }

    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      return Response.json({ error: `PostgREST ${res.status}: ${errBody.slice(0, 300)}` }, { status: 502 });
    }
    const rows = res.status === 204 ? [] : await res.json().catch(() => []);
    return Response.json({
      ok: true,
      rows,
      ...(backend.rls ? { rls: true, note: "Anon key — RLS policies applied to this write." } : {}),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return Response.json({ error: "Database request failed: " + message }, { status: 502 });
  }
}

// ── Table listing helpers ─────────────────────────────────────────────────────

/** Managed Cloud: information_schema + pg_class reltuples row estimates. */
async function listCloudTables(ref: string) {
  const [tablesRes, colsRes, pksRes, estRes] = await Promise.all([
    queryManagedSql(ref, `
      SELECT table_name FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name`),
    queryManagedSql(ref, `
      SELECT table_name, column_name, data_type FROM information_schema.columns
      WHERE table_schema = 'public'
      ORDER BY table_name, ordinal_position`),
    queryManagedSql(ref, `
      SELECT tc.table_name, kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'PRIMARY KEY' AND tc.table_schema = 'public'`),
    queryManagedSql(ref, `
      SELECT c.relname AS table_name, GREATEST(c.reltuples, 0)::bigint AS estimate
      FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r'`),
  ]);
  if (!tablesRes.ok) throw new Error(tablesRes.error ?? "Failed to list tables");

  const pkSet = new Set<string>(
    (pksRes.rows ?? []).flatMap((row) =>
      typeof row.table_name === "string" && typeof row.column_name === "string"
        ? [`${row.table_name}.${row.column_name}`]
        : [],
    ),
  );
  const estimates = new Map<string, number>(
    (estRes.rows ?? []).flatMap((row) =>
      typeof row.table_name === "string"
        ? [[row.table_name, Number(row.estimate) || 0] as const]
        : [],
    ),
  );
  const colsByTable = new Map<string, Array<{ name: string; type: string; isPk: boolean }>>();
  for (const row of colsRes.rows ?? []) {
    if (typeof row.table_name !== "string" || typeof row.column_name !== "string" || typeof row.data_type !== "string") continue;
    const list = colsByTable.get(row.table_name) ?? [];
    list.push({
      name: row.column_name,
      type: row.data_type,
      isPk: pkSet.has(`${row.table_name}.${row.column_name}`),
    });
    colsByTable.set(row.table_name, list);
  }
  return (tablesRes.rows ?? [])
    .flatMap((row) => typeof row.table_name === "string" ? [row.table_name] : [])
    .filter((name) => IDENT_RE.test(name))
    .map((name) => ({
      name,
      rowCount: estimates.get(name) ?? 0,
      columns: colsByTable.get(name) ?? [],
    }));
}

/** PostgREST: tables + columns from the OpenAPI root; counts via ranged HEAD. */
async function listRestTables(url: string, key: string) {
  const res = await fetch(`${url}/rest/v1/`, { headers: restHeaders(key) });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`PostgREST ${res.status}: ${body.slice(0, 300)}`);
  }
  const spec = await res.json().catch(() => null);
  const defs = spec?.definitions ?? {};

  const tables = Object.entries(defs)
    .filter(([name]) => IDENT_RE.test(name))
    .map(([name, def]) => {
      const props = (def as any)?.properties ?? {};
      const colNames = Object.keys(props).filter((c) => IDENT_RE.test(c));
      // PostgREST marks PK columns with "<pk/>" in the description; if absent,
      // fall back to assuming "id" is the primary key when present.
      const described = colNames.filter(
        (c) => typeof props[c]?.description === "string" && props[c].description.includes("<pk/>"),
      );
      const pkSet = new Set(described.length ? described : colNames.includes("id") ? ["id"] : []);
      return {
        name,
        rowCount: 0,
        columns: colNames.map((c) => ({
          name: c,
          type: props[c]?.format?.split(" ")[0] ?? props[c]?.type ?? "unknown",
          isPk: pkSet.has(c),
        })),
      };
    });

  // Estimated row counts — one cheap ranged HEAD per table.
  await Promise.all(
    tables.map(async (t) => {
      try {
        const r = await fetch(`${url}/rest/v1/${t.name}?select=*`, {
          method: "HEAD",
          headers: { ...restHeaders(key), Prefer: "count=estimated", Range: "0-0", "Range-Unit": "items" },
        });
        const totalPart = r.headers.get("content-range")?.split("/")[1];
        t.rowCount = totalPart && totalPart !== "*" ? Number(totalPart) : 0;
      } catch {
        t.rowCount = 0;
      }
    }),
  );
  return tables;
}


export const Route = createFileRoute("/api/projects/$id/database")({
  server: {
    handlers: {
      GET: async ({ request, params }) => handleGET(request, params),
      POST: async ({ request, params }) => handlePOST(request, params),
    },
  },
});
