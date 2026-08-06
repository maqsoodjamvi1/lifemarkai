/**
 * Which migrations have actually landed?
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * There are 104 files in supabase/migrations and NO tracking table. Nothing in
 * this repo records which of them have been applied. Every apply script so far
 * (apply-migration-090, -091-092, -093, -094, -095, -157, -162, …) hard-codes a
 * single migration by name, which works when you have just written one and
 * remember it, and answers nothing at all when someone asks "are we up to date?"
 *
 * The usual fix is to add a schema_migrations table — but that requires picking
 * a baseline and declaring everything before it applied, which is a guess
 * wearing a ledger's clothes. This script asks the database instead. It reads
 * every migration file, works out which tables and columns they are supposed to
 * create, and checks which of those actually exist.
 *
 * Run: node scripts/check-schema-drift.js
 *
 * ── What it is honest about ─────────────────────────────────────────────────
 *
 * The parser is a heuristic, and it is written to UNDER-report rather than
 * over-report. It finds `CREATE TABLE [IF NOT EXISTS] x` and `ALTER TABLE x ADD
 * COLUMN [IF NOT EXISTS] y` at statement level. It does NOT see objects created
 * inside DO blocks or by functions, and it does not track views, policies,
 * indexes, enums or grants.
 *
 * So a clean report means "every table and column these migrations declare is
 * present" — not "the schema is definitely correct". A dirty report is reliable
 * in the other direction: anything it names as missing really is missing.
 * Missing is the answer that matters; a false clean is the failure mode worth
 * naming out loud, which is why it is named here and printed at the end of
 * every run.
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

/** Strip comments so a commented-out CREATE TABLE is not counted as expected. */
function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
}

const clean = (ident) => ident.replace(/"/g, "").replace(/^public\./i, "").trim().toLowerCase();

/**
 * Expected objects, per migration file.
 *
 * A column is only expected if its table is also expected to exist somewhere —
 * otherwise a migration that adds a column to a table dropped by a LATER
 * migration would be reported as missing forever, which trains people to ignore
 * the report. Same reason DROP is tracked: 086 deliberately removes columns, and
 * a checker that does not know that would cry wolf about them every run.
 */
function parseMigrations() {
  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  const expectedTables = new Map();   // table -> file that creates it
  const expectedColumns = new Map();  // "table.col" -> file
  const dropped = new Set();

  for (const file of files) {
    const sql = stripComments(readFileSync(path.join(MIGRATIONS_DIR, file), "utf8"));

    for (const m of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_."]+)/gi)) {
      expectedTables.set(clean(m[1]), file);
    }
    for (const m of sql.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?([a-z0-9_."]+)\s+add\s+column\s+(?:if\s+not\s+exists\s+)?([a-z0-9_"]+)/gi,
    )) {
      expectedColumns.set(`${clean(m[1])}.${clean(m[2])}`, file);
    }
    // Later drops win: they run after the create.
    for (const m of sql.matchAll(/drop\s+table\s+(?:if\s+exists\s+)?([a-z0-9_."]+)/gi)) {
      dropped.add(clean(m[1]));
      expectedTables.delete(clean(m[1]));
    }
    for (const m of sql.matchAll(
      /alter\s+table\s+(?:if\s+exists\s+)?([a-z0-9_."]+)\s+drop\s+column\s+(?:if\s+exists\s+)?([a-z0-9_"]+)/gi,
    )) {
      const key = `${clean(m[1])}.${clean(m[2])}`;
      dropped.add(key);
      expectedColumns.delete(key);
    }
  }

  // A column on a table nothing creates is unverifiable, not missing.
  for (const key of [...expectedColumns.keys()]) {
    const table = key.split(".")[0];
    if (!expectedTables.has(table)) expectedColumns.delete(key);
  }

  return { files, expectedTables, expectedColumns, dropped };
}

(async function main() {
  const { files, expectedTables, expectedColumns } = parseMigrations();
  console.log(
    `Read ${files.length} migration files: ${expectedTables.size} tables and ${expectedColumns.size} added columns expected.\n`,
  );

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
      console.log("Connected via DATABASE_URL.\n");
      rows = (await client.query(VERIFY_SQL)).rows;
      await client.end();
    } else if (mgmtToken && ref) {
      console.log(`Connected via Management API (project ${ref}).\n`);
      const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${mgmtToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query: VERIFY_SQL }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`Management API ${res.status}: ${text.slice(0, 600)}`);
      rows = JSON.parse(text);
    } else {
      console.error("Need DATABASE_URL or SUPABASE_MANAGEMENT_TOKEN + project URL in .env.local.");
      process.exit(1);
    }
  } catch (err) {
    console.error("QUERY FAILED:", err.message || err);
    process.exit(1);
  }

  const liveTables = new Set(rows.filter((r) => r.kind === "table").map((r) => String(r.name).toLowerCase()));
  const liveColumns = new Set(
    rows.filter((r) => r.kind === "column").map((r) => `${String(r.name).toLowerCase()}.${String(r.col).toLowerCase()}`),
  );

  // Group by the migration that introduced the object, so the output is a
  // to-do list of files to run rather than a list of orphaned object names.
  const byFile = new Map();
  const note = (file, text) => {
    if (!byFile.has(file)) byFile.set(file, []);
    byFile.get(file).push(text);
  };

  for (const [table, file] of expectedTables) if (!liveTables.has(table)) note(file, `table  ${table}`);
  for (const [key, file] of expectedColumns) {
    const table = key.split(".")[0];
    // Don't report every column of a table that is itself missing — the table
    // line already says it, and the noise buries it.
    if (!liveTables.has(table)) continue;
    if (!liveColumns.has(key)) note(file, `column ${key}`);
  }

  if (byFile.size === 0) {
    console.log("UP TO DATE — every table and column the migrations declare is present.");
  } else {
    console.log(`NOT APPLIED — ${byFile.size} migration file(s) have objects missing from the database:\n`);
    for (const file of [...byFile.keys()].sort()) {
      console.log(`  ${file}`);
      for (const line of byFile.get(file)) console.log(`      ${line}`);
    }
    console.log(`\nApply them in filename order. Most are written with IF NOT EXISTS, so`);
    console.log(`re-running an already-applied file is safe; check any that are not.`);
  }

  console.log(
    "\nScope: tables and top-level ADD COLUMN only. Views, policies, indexes, enums,\n" +
      "grants and anything created inside a DO block are NOT checked — a clean result\n" +
      "means those specific objects exist, not that the schema is fully correct.",
  );
  process.exit(byFile.size === 0 ? 0 : 1);
})();
