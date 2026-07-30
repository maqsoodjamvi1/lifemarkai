/**
 * Applies chat-state / annotations / message-embeddings migrations.
 *   091_project_chat_state.sql
 *   092_preview_annotations.sql
 *   093_message_embeddings.sql
 *
 * Prefers DATABASE_URL (direct Postgres). Falls back to
 * SUPABASE_MANAGEMENT_TOKEN + project ref from NEXT_PUBLIC_SUPABASE_URL.
 *
 * Run: node scripts/apply-migration-091-092.js
 */
const { readFileSync } = require("fs");
const path = require("path");

const MIGRATIONS = [
  "supabase/migrations/091_project_chat_state.sql",
  "supabase/migrations/092_preview_annotations.sql",
  "supabase/migrations/093_message_embeddings.sql",
];

function loadEnvLocal() {
  try {
    const env = readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
    return env
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean)
      .reduce((acc, line) => {
        if (line.startsWith("#")) return acc;
        const [k, ...rest] = line.split("=");
        const key = (k || "").trim();
        if (!key) return acc;
        let val = rest.join("=").trim();
        if (
          (val.startsWith('"') && val.endsWith('"')) ||
          (val.startsWith("'") && val.endsWith("'"))
        ) {
          val = val.slice(1, -1);
        }
        acc[key] = val;
        return acc;
      }, {});
  } catch {
    return {};
  }
}

function getEnv(name) {
  if (process.env[name]) return process.env[name];
  return loadEnvLocal()[name];
}

function projectRefFromUrl(url) {
  if (!url) return undefined;
  const m = url.match(/^https?:\/\/([a-z0-9-]+)\.supabase\.co/i);
  return m?.[1];
}

async function applyViaPostgres(databaseUrl, sqlFiles) {
  const { Client } = require("pg");
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log("Connected via DATABASE_URL.");
  try {
    for (const m of sqlFiles) {
      const sql = readFileSync(path.join(__dirname, "..", m), "utf8");
      console.log(`\n---- Applying ${m} ----`);
      await client.query(sql);
      console.log(`Applied ${m}`);
    }
    await verifyPg(client);
  } finally {
    await client.end();
  }
}

async function verifyPg(client) {
  const tables = await client.query(`
    SELECT
      to_regclass('public.project_chat_state') AS chat_state,
      to_regclass('public.message_embeddings') AS embeddings,
      (
        SELECT COUNT(*) FROM information_schema.columns
        WHERE table_schema = 'public'
          AND table_name = 'project_chat_state'
          AND column_name = 'preview_annotations'
      ) AS has_annotations_col
  `);
  const row = tables.rows[0];
  console.log(`\nVerify: project_chat_state = ${row.chat_state ? "OK" : "MISSING"}`);
  console.log(
    `Verify: preview_annotations column = ${Number(row.has_annotations_col) > 0 ? "OK" : "MISSING"}`,
  );
  console.log(`Verify: message_embeddings = ${row.embeddings ? "OK" : "MISSING"}`);
}

async function applyViaManagementApi(token, ref, sqlFiles) {
  console.log(`Connected via Management API (project ${ref}).`);
  for (const m of sqlFiles) {
    const sql = readFileSync(path.join(__dirname, "..", m), "utf8");
    console.log(`\n---- Applying ${m} ----`);
    const res = await fetch(
      `https://api.supabase.com/v1/projects/${ref}/database/query`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ query: sql }),
      },
    );
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Management API ${res.status}: ${body.slice(0, 400)}`);
    }
    console.log(`Applied ${m}`);
  }

  const verifyRes = await fetch(
    `https://api.supabase.com/v1/projects/${ref}/database/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: `
          SELECT
            to_regclass('public.project_chat_state') IS NOT NULL AS chat_state_ok,
            to_regclass('public.message_embeddings') IS NOT NULL AS embeddings_ok,
            EXISTS (
              SELECT 1 FROM information_schema.columns
              WHERE table_schema = 'public'
                AND table_name = 'project_chat_state'
                AND column_name = 'preview_annotations'
            ) AS annotations_ok
        `,
      }),
    },
  );
  if (verifyRes.ok) {
    const data = await verifyRes.json().catch(() => null);
    const row = Array.isArray(data) ? data[0] : data?.result?.[0];
    if (row) {
      console.log(
        `\nVerify: project_chat_state = ${row.chat_state_ok ? "OK" : "MISSING"}`,
      );
      console.log(
        `Verify: preview_annotations column = ${row.annotations_ok ? "OK" : "MISSING"}`,
      );
      console.log(
        `Verify: message_embeddings = ${row.embeddings_ok ? "OK" : "MISSING"}`,
      );
    }
  }
}

(async function main() {
  const databaseUrl = getEnv("DATABASE_URL");
  const mgmtToken = getEnv("SUPABASE_MANAGEMENT_TOKEN");
  const ref =
    getEnv("SUPABASE_PROJECT_REF") ||
    projectRefFromUrl(getEnv("NEXT_PUBLIC_SUPABASE_URL"));

  try {
    if (databaseUrl) {
      await applyViaPostgres(databaseUrl, MIGRATIONS);
    } else if (mgmtToken && ref) {
      await applyViaManagementApi(mgmtToken, ref, MIGRATIONS);
    } else {
      console.error(
        "\nNo database credentials found.\n\n" +
          "Option A — add Postgres URI to .env.local:\n" +
          "  DATABASE_URL=postgresql://postgres.<ref>:<PASSWORD>@...supabase.com:5432/postgres\n\n" +
          "Option B — Management API (also needs project URL):\n" +
          "  SUPABASE_MANAGEMENT_TOKEN=sbp_...\n" +
          "  NEXT_PUBLIC_SUPABASE_URL=https://<ref>.supabase.co\n",
      );
      process.exit(1);
    }
    console.log("\nDone.");
  } catch (err) {
    console.error("\nError applying migration:", err.message || err);
    process.exitCode = 2;
  }
})();
