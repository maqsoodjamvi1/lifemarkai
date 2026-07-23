/**
 * Applies 095_ai_request_preview.sql
 * Prefers DATABASE_URL; falls back to SUPABASE_MANAGEMENT_TOKEN.
 * Run: node scripts/apply-migration-095.js
 */
const { readFileSync } = require("fs");
const path = require("path");

const MIGRATION = "supabase/migrations/095_ai_request_preview.sql";

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

(async function main() {
  const databaseUrl = getEnv("DATABASE_URL");
  const mgmtToken = getEnv("SUPABASE_MANAGEMENT_TOKEN");
  const ref =
    getEnv("SUPABASE_PROJECT_REF") ||
    projectRefFromUrl(getEnv("NEXT_PUBLIC_SUPABASE_URL"));
  const sql = readFileSync(path.join(__dirname, "..", MIGRATION), "utf8");

  try {
    if (databaseUrl) {
      const { Client } = require("pg");
      const client = new Client({
        connectionString: databaseUrl,
        ssl: { rejectUnauthorized: false },
      });
      await client.connect();
      console.log("Connected via DATABASE_URL.");
      console.log(`\n---- Applying ${MIGRATION} ----`);
      await client.query(sql);
      const v = await client.query(
        `SELECT column_name FROM information_schema.columns
         WHERE table_name='ai_request_logs' AND column_name='request_preview'`,
      );
      console.log(`Verify: request_preview = ${v.rows[0] ? "OK" : "MISSING"}`);
      await client.end();
    } else if (mgmtToken && ref) {
      console.log(`Connected via Management API (project ${ref}).`);
      console.log(`\n---- Applying ${MIGRATION} ----`);
      const res = await fetch(
        `https://api.supabase.com/v1/projects/${ref}/database/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${mgmtToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ query: sql }),
        },
      );
      const text = await res.text();
      if (!res.ok) {
        console.error("Management API error:", res.status, text.slice(0, 500));
        process.exit(1);
      }
      console.log("Applied OK.", text.slice(0, 200));
    } else {
      console.error("Need DATABASE_URL or SUPABASE_MANAGEMENT_TOKEN + project URL.");
      process.exit(1);
    }
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
