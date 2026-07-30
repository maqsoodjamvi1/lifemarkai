/**
 * Applies 094_preview_telemetry.sql
 * Prefers DATABASE_URL; falls back to SUPABASE_MANAGEMENT_TOKEN.
 * Run: node scripts/apply-migration-094.js
 */
const { readFileSync } = require("fs");
const path = require("path");

const MIGRATION = "supabase/migrations/094_preview_telemetry.sql";

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
        `SELECT to_regclass('public.preview_telemetry') AS t`,
      );
      console.log(`Verify: preview_telemetry = ${v.rows[0]?.t ? "OK" : "MISSING"}`);
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
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Management API ${res.status}: ${body.slice(0, 400)}`);
      }
      console.log(`Applied ${MIGRATION}`);
      const verifyRes = await fetch(
        `https://api.supabase.com/v1/projects/${ref}/database/query`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${mgmtToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: `SELECT to_regclass('public.preview_telemetry') IS NOT NULL AS ok`,
          }),
        },
      );
      if (verifyRes.ok) {
        const data = await verifyRes.json().catch(() => null);
        const row = Array.isArray(data) ? data[0] : data?.result?.[0];
        console.log(`Verify: preview_telemetry = ${row?.ok ? "OK" : "MISSING"}`);
      }
    } else {
      console.error("\nNo DATABASE_URL or SUPABASE_MANAGEMENT_TOKEN found.\n");
      process.exit(1);
    }
    console.log("\nDone.");
  } catch (err) {
    console.error("\nError applying migration:", err.message || err);
    process.exitCode = 2;
  }
})();
