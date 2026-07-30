/**
 * Apply pending SQL migrations: 094, 095, 096.
 * Prefers DATABASE_URL; falls back to SUPABASE_MANAGEMENT_TOKEN.
 * Run: node scripts/apply-pending-migrations.js
 */
const { readFileSync, existsSync } = require("fs");
const path = require("path");

const MIGRATIONS = [
  "supabase/migrations/094_preview_telemetry.sql",
  "supabase/migrations/095_ai_request_preview.sql",
  "supabase/migrations/096_signin_devices.sql",
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

async function applyViaPg(databaseUrl, sql, label) {
  const { Client } = require("pg");
  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  console.log(`---- Applying ${label} (DATABASE_URL) ----`);
  await client.query(sql);
  await client.end();
  console.log(`OK: ${label}`);
}

async function applyViaMgmt(token, ref, sql, label) {
  console.log(`---- Applying ${label} (Management API ${ref}) ----`);
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
  const text = await res.text();
  if (!res.ok) {
    throw new Error(`${label} failed (${res.status}): ${text.slice(0, 500)}`);
  }
  console.log(`OK: ${label}`);
}

(async function main() {
  const databaseUrl = getEnv("DATABASE_URL");
  const mgmtToken = getEnv("SUPABASE_MANAGEMENT_TOKEN");
  const ref =
    getEnv("SUPABASE_PROJECT_REF") ||
    projectRefFromUrl(getEnv("NEXT_PUBLIC_SUPABASE_URL")) ||
    (existsSync(path.join(__dirname, "..", "supabase", ".temp", "project-ref"))
      ? readFileSync(
          path.join(__dirname, "..", "supabase", ".temp", "project-ref"),
          "utf8",
        ).trim()
      : undefined);

  if (!databaseUrl && !(mgmtToken && ref)) {
    console.error(
      "Need DATABASE_URL or SUPABASE_MANAGEMENT_TOKEN + project ref.",
    );
    process.exit(1);
  }

  for (const rel of MIGRATIONS) {
    const full = path.join(__dirname, "..", rel);
    if (!existsSync(full)) {
      console.warn(`SKIP missing: ${rel}`);
      continue;
    }
    const sql = readFileSync(full, "utf8");
    if (databaseUrl) {
      await applyViaPg(databaseUrl, sql, rel);
    } else {
      await applyViaMgmt(mgmtToken, ref, sql, rel);
    }
  }
  console.log("\nAll pending migrations applied.");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
