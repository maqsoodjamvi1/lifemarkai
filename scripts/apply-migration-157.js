/**
 * Applies 157_cve_suppressions_and_settings.sql
 *
 * Same shape as apply-migration-095.js: prefers DATABASE_URL, falls back to
 * SUPABASE_MANAGEMENT_TOKEN + project ref. The credential is read from
 * .env.local by this script and never printed.
 *
 * Run: node scripts/apply-migration-157.js
 *
 * VERIFICATION IS THE POINT OF THIS SCRIPT, not the apply. The migration is
 * idempotent (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS), so running
 * it twice is safe; what matters is proving afterwards that all five objects the
 * pushed code depends on actually exist. Applying and assuming would leave the
 * same class of untruth this whole batch was about.
 */
const { readFileSync } = require("fs");
const path = require("path");

const MIGRATION = "supabase/migrations/157_cve_suppressions_and_settings.sql";

// Each entry: what the pushed code breaks on if this object is missing.
const EXPECT_TABLES = [
  ["dependency_cve_suppressions", "/api/security/dependencies suppression read/write"],
  ["project_publish_grants", "publish audience control (per-user grants)"],
];
const EXPECT_COLUMNS = [
  ["api_keys", "revoked_at", "/api/security/leaked-key revocation audit"],
  ["api_keys", "revoked_reason", "/api/security/leaked-key revocation audit"],
  ["profiles", "allow_code_download", "/api/projects/:id/export download policy"],
  ["projects", "publish_audience", "publish audience enforcement"],
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
select 'table' as kind, table_name as name, '' as col
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('dependency_cve_suppressions','project_publish_grants')
union all
select 'column', table_name, column_name
  from information_schema.columns
 where table_schema = 'public'
   and (   (table_name = 'api_keys' and column_name in ('revoked_at','revoked_reason'))
        or (table_name = 'profiles' and column_name = 'allow_code_download')
        or (table_name = 'projects' and column_name = 'publish_audience'))
order by 1, 2, 3;
`;

(async function main() {
  const databaseUrl = getEnv("DATABASE_URL");
  const mgmtToken = getEnv("SUPABASE_MANAGEMENT_TOKEN");
  const ref = getEnv("SUPABASE_PROJECT_REF") || refFromUrl(getEnv("NEXT_PUBLIC_SUPABASE_URL"));
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

  // ---- verify every object the pushed code depends on -----------------------
  const haveTable = (t) => rows.some((r) => r.kind === "table" && r.name === t);
  const haveCol = (t, c) => rows.some((r) => r.kind === "column" && r.name === t && r.col === c);

  console.log("\n---- VERIFICATION ----");
  const missing = [];
  for (const [t, why] of EXPECT_TABLES) {
    const ok = haveTable(t);
    console.log(`${ok ? "OK      " : "MISSING "} table  ${t}`);
    if (!ok) missing.push(`table ${t} -> breaks ${why}`);
  }
  for (const [t, c, why] of EXPECT_COLUMNS) {
    const ok = haveCol(t, c);
    console.log(`${ok ? "OK      " : "MISSING "} column ${t}.${c}`);
    if (!ok) missing.push(`column ${t}.${c} -> breaks ${why}`);
  }

  if (missing.length) {
    console.error(`\nMIGRATION 157 INCOMPLETE - ${missing.length} object(s) absent:`);
    for (const m of missing) console.error("  - " + m);
    console.error("\nDo NOT merge to master yet: the deployed code would query these.");
    process.exit(1);
  }

  console.log("\nMIGRATION 157 VERIFIED - all 6 objects present. Safe to merge to master.");
})();
