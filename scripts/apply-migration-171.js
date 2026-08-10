/**
 * Apply migration 171 (LifemarkData app_data table).
 *
 * Run from the repo root:  node scripts/apply-migration-171.js
 *
 * Uses DATABASE_URL when present, otherwise the Supabase Management API via
 * SUPABASE_MANAGEMENT_TOKEN + NEXT_PUBLIC_SUPABASE_URL — same pattern as
 * apply-migration-093.js. Idempotent: skips if app_data already exists.
 */
const { readFileSync } = require("fs");
const path = require("path");

const MIGRATION = "supabase/migrations/171_lifemark_app_data.sql";

function getEnv(name) {
  if (process.env[name]) return process.env[name];
  try {
    const env = readFileSync(path.join(__dirname, "..", ".env.local"), "utf8");
    for (const line of env.split("\n")) {
      const t = line.trim();
      if (!t || t.startsWith("#")) continue;
      const i = t.indexOf("=");
      if (i === -1) continue;
      if (t.slice(0, i).trim() === name) {
        return t.slice(i + 1).trim().replace(/^["']|["']$/g, "");
      }
    }
  } catch {}
  return undefined;
}

async function mgmtQuery(ref, token, query) {
  const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
  });
  const body = await res.text();
  if (!res.ok) throw new Error(`Management API ${res.status}: ${body.slice(0, 300)}`);
  try { return JSON.parse(body); } catch { return body; }
}

(async function () {
  const sql = readFileSync(path.join(__dirname, "..", MIGRATION), "utf8");
  const databaseUrl = getEnv("DATABASE_URL");

  if (databaseUrl) {
    const { Client } = require("pg");
    const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    console.log("Connected via DATABASE_URL.");
    const pre = await client.query("SELECT to_regclass('public.app_data') IS NOT NULL AS exists");
    if (pre.rows[0]?.exists) {
      console.log("app_data already exists — nothing to do.");
    } else {
      await client.query(sql);
      const ok = await client.query("SELECT to_regclass('public.app_data') IS NOT NULL AS ok");
      console.log(`Applied ${MIGRATION}. Verify: app_data = ${ok.rows[0]?.ok ? "OK" : "MISSING"}`);
    }
    await client.end();
    return;
  }

  const token = getEnv("SUPABASE_MANAGEMENT_TOKEN");
  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL") || "";
  const ref = (url.match(/^https?:\/\/([a-z0-9]+)\.supabase\.co/) || [])[1];
  if (!token || !ref) {
    console.error(
      "\nNo DATABASE_URL and no SUPABASE_MANAGEMENT_TOKEN + NEXT_PUBLIC_SUPABASE_URL found.\n" +
      "Set one in .env.local, then re-run.\n",
    );
    process.exit(1);
  }

  const pre = await mgmtQuery(ref, token, "SELECT to_regclass('public.app_data') IS NOT NULL AS exists");
  const preRow = Array.isArray(pre) ? pre[0] : pre?.result?.[0];
  if (preRow?.exists) {
    console.log("app_data already exists — nothing to do.");
    return;
  }

  await mgmtQuery(ref, token, sql);
  console.log(`Applied ${MIGRATION} via Management API.`);
  const verify = await mgmtQuery(ref, token, "SELECT to_regclass('public.app_data') IS NOT NULL AS ok");
  const row = Array.isArray(verify) ? verify[0] : verify?.result?.[0];
  console.log(`Verify: app_data = ${row?.ok ? "OK" : "MISSING"}`);
})().catch((err) => {
  console.error("\nError applying migration:", err.message || err);
  process.exitCode = 2;
});
