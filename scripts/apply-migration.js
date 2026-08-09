/**
 * Apply any migration by filename, then prove it landed.
 *
 *   node scripts/apply-migration.js 058_element_comments.sql
 *   node scripts/apply-migration.js 058            # prefix is enough
 *
 * ── Why a generic one ───────────────────────────────────────────────────────
 *
 * There are now eight scripts in this directory named apply-migration-<n>.js,
 * each hard-coding one file and its own copy of the same env loading, the same
 * DATABASE_URL / Management API fallback, and a bespoke verification block. The
 * next person needing to apply a migration writes a ninth.
 *
 * This one takes the filename as an argument and derives the verification from
 * the migration itself — it parses the tables and columns the file declares and
 * checks those exact objects afterwards, using the same parser rules as
 * check-schema-drift.js. So the verification is never out of step with the SQL,
 * which is the failure mode a hand-written EXPECT list eventually reaches.
 *
 * Only run migrations you have read. This applies whatever is in the file.
 */
const { readFileSync, readdirSync } = require("fs");
const path = require("path");

const MIGRATIONS_DIR = path.join(__dirname, "..", "supabase", "migrations");

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

const stripComments = (sql) => sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
const clean = (i) => i.replace(/"/g, "").replace(/^public\./i, "").trim().toLowerCase();

/** Same rules as check-schema-drift.js, including multi-clause ALTER TABLE. */
function declaredObjects(sql) {
  const body = stripComments(sql);
  const tables = new Set();
  const columns = new Set();
  for (const m of body.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_."]+)/gi)) {
    tables.add(clean(m[1]));
  }
  for (const stmt of body.matchAll(/alter\s+table\s+(?:if\s+exists\s+)?([a-z0-9_."]+)([\s\S]*?);/gi)) {
    const t = clean(stmt[1]);
    for (const c of stmt[2].matchAll(/add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z0-9_"]+)/gi)) {
      columns.add(`${t}.${clean(c[1])}`);
    }
    for (const c of stmt[2].matchAll(/drop\s+column\s+(?:if\s+exists\s+)?([a-z0-9_"]+)/gi)) {
      columns.delete(`${t}.${clean(c[1])}`);
    }
  }
  for (const m of body.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?([a-z0-9_."]+)/gi)) {
    tables.delete(clean(m[1]));
  }
  return { tables: [...tables], columns: [...columns] };
}

function resolveMigration(arg) {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  const exact = files.find((f) => f === arg);
  if (exact) return exact;
  const byPrefix = files.filter((f) => f.startsWith(arg));
  if (byPrefix.length === 1) return byPrefix[0];
  if (byPrefix.length > 1) {
    console.error(`"${arg}" matches ${byPrefix.length} files:\n  ${byPrefix.join("\n  ")}`);
    process.exit(1);
  }
  console.error(`No migration matches "${arg}".`);
  process.exit(1);
}

(async function main() {
  const arg = process.argv[2];
  if (!arg) {
    console.error("Usage: node scripts/apply-migration.js <filename-or-prefix>");
    process.exit(1);
  }
  const file = resolveMigration(arg);
  const sql = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
  const want = declaredObjects(sql);

  console.log(`Migration: ${file}`);
  console.log(`Declares ${want.tables.length} table(s) and ${want.columns.length} column(s).\n`);

  const VERIFY_SQL = `
    select 'table' as kind, table_name as name, '' as col
      from information_schema.tables where table_schema = 'public'
    union all
    select 'column', table_name, column_name
      from information_schema.columns where table_schema = 'public';
  `;

  const databaseUrl = getEnv("DATABASE_URL");
  const mgmtToken = getEnv("SUPABASE_MANAGEMENT_TOKEN");
  const ref =
    getEnv("SUPABASE_PROJECT_REF") ||
    refFromUrl(getEnv("NEXT_PUBLIC_SUPABASE_URL")) ||
    refFromUrl(getEnv("VITE_SUPABASE_URL"));

  let rows = [];
  try {
    if (databaseUrl) {
      const { Client } = require("pg");
      const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
      await client.connect();
      console.log("Connected via DATABASE_URL.");
      console.log(`---- Applying ${file} ----`);
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
      console.log(`---- Applying ${file} ----`);
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

  const liveTables = new Set(rows.filter((r) => r.kind === "table").map((r) => String(r.name).toLowerCase()));
  const liveColumns = new Set(
    rows.filter((r) => r.kind === "column").map((r) => `${String(r.name).toLowerCase()}.${String(r.col).toLowerCase()}`),
  );

  console.log("\n---- VERIFICATION ----");
  const missing = [];
  for (const t of want.tables) {
    const ok = liveTables.has(t);
    console.log(`${ok ? "OK      " : "MISSING "} table  ${t}`);
    if (!ok) missing.push(`table ${t}`);
  }
  for (const c of want.columns) {
    const ok = liveColumns.has(c);
    console.log(`${ok ? "OK      " : "MISSING "} column ${c}`);
    if (!ok) missing.push(`column ${c}`);
  }

  if (missing.length) {
    console.error(`\n${file} DID NOT FULLY APPLY - ${missing.length} object(s) still absent:`);
    for (const m of missing) console.error("  - " + m);
    process.exit(1);
  }
  console.log(`\n${file} applied and verified.`);
})();
