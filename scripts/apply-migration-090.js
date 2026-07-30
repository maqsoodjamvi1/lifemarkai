/**
 * Applies migration 090_workspace_identity.sql (SSO/SCIM settings tables).
 *
 * Prefers DATABASE_URL. Falls back to SUPABASE_MANAGEMENT_TOKEN +
 * project ref from NEXT_PUBLIC_SUPABASE_URL.
 *
 * Run: node scripts/apply-migration-090.js
 */
const { readFileSync } = require("fs");
const path = require("path");

const MIGRATION = "supabase/migrations/090_workspace_identity.sql";

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
      console.log(`Applied ${MIGRATION}`);
      const tables = await client.query(`
        SELECT to_regclass('public.workspace_identity_settings') AS identity,
               to_regclass('public.workspace_scim_users') AS scim_users
      `);
      const row = tables.rows[0];
      console.log(`\nVerify: workspace_identity_settings = ${row.identity ? "OK" : "MISSING"}`);
      console.log(`Verify: workspace_scim_users = ${row.scim_users ? "OK" : "MISSING"}`);
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
            query: `
              SELECT
                to_regclass('public.workspace_identity_settings') IS NOT NULL AS identity_ok,
                to_regclass('public.workspace_scim_users') IS NOT NULL AS scim_ok
            `,
          }),
        },
      );
      if (verifyRes.ok) {
        const data = await verifyRes.json().catch(() => null);
        const row = Array.isArray(data) ? data[0] : data?.result?.[0];
        if (row) {
          console.log(
            `\nVerify: workspace_identity_settings = ${row.identity_ok ? "OK" : "MISSING"}`,
          );
          console.log(
            `Verify: workspace_scim_users = ${row.scim_ok ? "OK" : "MISSING"}`,
          );
        }
      }
    } else {
      console.error(
        "\nNo database credentials found.\n\n" +
          "Option A — DATABASE_URL in .env.local\n" +
          "Option B — SUPABASE_MANAGEMENT_TOKEN + NEXT_PUBLIC_SUPABASE_URL\n",
      );
      process.exit(1);
    }
    console.log("\nDone.");
  } catch (err) {
    console.error("\nError applying migration:", err.message || err);
    process.exitCode = 2;
  }
})();
