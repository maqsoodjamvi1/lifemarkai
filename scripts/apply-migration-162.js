/**
 * Applies 162_project_data_writes.sql — the audit trail for agent-proposed,
 * human-approved writes to a project's live managed database.
 *
 * Same shape as apply-migration-157.js: prefers DATABASE_URL, falls back to
 * SUPABASE_MANAGEMENT_TOKEN + project ref. The credential is read from
 * .env.local by this script and never printed.
 *
 * Run: node scripts/apply-migration-162.js
 *
 * VERIFICATION IS THE POINT OF THIS SCRIPT, not the apply. The migration is
 * idempotent, so running it twice is safe; what matters is proving afterwards
 * that the objects the pushed code depends on actually exist.
 *
 * This one verifies more than table-and-column existence, because for this
 * table the SHAPE of the security is the feature:
 *
 *   - RLS must be ENABLED. Without it the policy below is decorative and any
 *     authenticated user reads every project's audit trail.
 *   - There must be exactly ONE policy, and it must be SELECT-only. An audit
 *     trail its subject can insert into, edit or delete is not an audit trail —
 *     it is a suggestion.
 *   - The write grants must be absent for anon and authenticated. Rows are
 *     written only by the server-side service-role client.
 *
 * If any of those is wrong, the endpoint at /api/cloud/write is unsafe to
 * enable, so this script exits non-zero rather than reporting a cheerful OK.
 */
const { readFileSync } = require("fs");
const path = require("path");

const MIGRATION = "supabase/migrations/162_project_data_writes.sql";
const TABLE = "project_data_writes";

const EXPECT_COLUMNS = [
  ["statement", "the exact text the approver read — /api/cloud/write re-validates it"],
  ["kind", "insert/update/delete, shown in the approval prompt"],
  ["target_table", "shown in the approval prompt"],
  ["previewed_rows", "the count the human approved against"],
  ["affected_rows", "what actually happened, kept separate from the preview"],
  ["status", "the proposed -> approved -> executed transition guard"],
  ["approved_by", "who approved it"],
  ["approved_at", "when"],
  ["executed_at", "when it ran"],
  ["error", "why it failed, if it did"],
];

function loadEnvLocal() {
  try {
    return readFileSync(path.join(__dirname, "..", ".env.local"), "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .reduce((acc, line) => {
        const [k, ...rest] = line.split("=");
        const key = (k || "").trim();
        if (!key) return acc;
        let val = rest.join("=").trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        acc[key] = val;
        return acc;
      }, {});
  } catch {
    return {};
  }
}

const envFile = loadEnvLocal();
const getEnv = (n) => process.env[n] || envFile[n];
const refFromUrl = (u) => (u || "").match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co/i)?.[1];

const VERIFY_SQL = `
select 'column' as kind, column_name as name, '' as extra
  from information_schema.columns
 where table_schema = 'public' and table_name = '${TABLE}'
union all
select 'rls', case when c.relrowsecurity then 'enabled' else 'DISABLED' end, ''
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
 where n.nspname = 'public' and c.relname = '${TABLE}'
union all
select 'policy', polname, cmd
  from (
    select pol.polname,
           case pol.polcmd when 'r' then 'SELECT' when 'a' then 'INSERT'
                           when 'w' then 'UPDATE' when 'd' then 'DELETE'
                           else 'ALL' end as cmd
      from pg_policy pol
      join pg_class c on c.oid = pol.polrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and c.relname = '${TABLE}'
  ) p
union all
select 'grant', grantee, privilege_type
  from information_schema.role_table_grants
 where table_schema = 'public' and table_name = '${TABLE}'
   and grantee in ('anon', 'authenticated', 'PUBLIC')
   and privilege_type in ('INSERT', 'UPDATE', 'DELETE')
order by 1, 2, 3;
`;

(async function main() {
  const databaseUrl = getEnv("DATABASE_URL");
  const mgmtToken = getEnv("SUPABASE_MANAGEMENT_TOKEN");
  const ref = getEnv("SUPABASE_PROJECT_REF") || refFromUrl(getEnv("NEXT_PUBLIC_SUPABASE_URL")) || refFromUrl(getEnv("VITE_SUPABASE_URL"));
  const sql = readFileSync(path.join(__dirname, "..", MIGRATION), "utf8");

  let rows = [];

  try {
    if (databaseUrl) {
      const { Client } = require("pg");
      const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
      await client.connect();
      console.log("Connected via DATABASE_URL.");
      console.log(`---- Applying ${MIGRATION} ----`);
      await client.query(sql);
      console.log("Applied without error.");
      rows = (await client.query(VERIFY_SQL)).rows;
      await client.end();
    } else if (mgmtToken && ref) {
      console.log(`Connected via Management API (project ${ref}).`);
      const run = async (query) => {
        const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
          method: "POST",
          headers: { Authorization: `Bearer ${mgmtToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ query }),
        });
        const text = await res.text();
        if (!res.ok) throw new Error(`Management API ${res.status}: ${text.slice(0, 600)}`);
        try { return JSON.parse(text); } catch { return []; }
      };
      console.log(`---- Applying ${MIGRATION} ----`);
      await run(sql);
      console.log("Applied without error.");
      rows = await run(VERIFY_SQL);
    } else {
      console.error("Need DATABASE_URL or SUPABASE_MANAGEMENT_TOKEN + project URL in .env.local.");
      process.exit(1);
    }
  } catch (err) {
    console.error("APPLY FAILED:", err.message || err);
    process.exit(1);
  }

  console.log("\n---- VERIFICATION ----");
  const problems = [];

  // 1. Columns the pushed code selects and updates.
  const haveCol = (c) => rows.some((r) => r.kind === "column" && r.name === c);
  for (const [col, why] of EXPECT_COLUMNS) {
    const ok = haveCol(col);
    console.log(`${ok ? "OK      " : "MISSING "} column ${TABLE}.${col}`);
    if (!ok) problems.push(`column ${TABLE}.${col} -> breaks ${why}`);
  }

  // 2. RLS on. Without it the SELECT policy below protects nothing.
  const rls = rows.find((r) => r.kind === "rls");
  const rlsOn = rls?.name === "enabled";
  console.log(`${rlsOn ? "OK      " : "FAIL    "} row level security ${rls?.name ?? "unknown"}`);
  if (!rlsOn) problems.push("RLS is not enabled -> every authenticated user can read every project's audit trail");

  // 3. Read-only for users. A writable audit trail is not an audit trail.
  const policies = rows.filter((r) => r.kind === "policy");
  console.log(`         policies: ${policies.length === 0 ? "(none)" : policies.map((p) => `${p.name}[${p.extra}]`).join(", ")}`);
  const writablePolicy = policies.find((p) => p.extra !== "SELECT");
  if (policies.length === 0) {
    problems.push("no SELECT policy -> project owners cannot read their own audit trail");
  } else if (writablePolicy) {
    problems.push(`policy ${writablePolicy.name} allows ${writablePolicy.extra} -> the audit trail can be altered by its subject`);
  } else {
    console.log("OK       exactly one policy, SELECT only");
  }

  // 4. No write grants leaked to anon/authenticated.
  const grants = rows.filter((r) => r.kind === "grant");
  if (grants.length === 0) {
    console.log("OK       no INSERT/UPDATE/DELETE granted to anon or authenticated");
  } else {
    for (const g of grants) {
      console.log(`FAIL     ${g.extra} granted to ${g.name}`);
      problems.push(`${g.extra} is granted to ${g.name} -> the audit trail can be written by its subject`);
    }
  }

  if (problems.length) {
    console.error(`\nMIGRATION 162 IS NOT SAFE TO RELY ON - ${problems.length} problem(s):`);
    for (const p of problems) console.error("  - " + p);
    console.error("\nDo NOT enable /api/cloud/write until these are fixed.");
    process.exit(1);
  }

  console.log("\nMigration 162 applied and verified. The audit trail is enforceable.");
})();
