/**
 * Applies the two pending migrations from the July 2 2026 session:
 *   074_unified_credit_balance.sql  (merges cloud wallets into profiles.credits)
 *   075_health_findings.sql        (self-healing findings table)
 *
 * Both are idempotent: 074's one-time conversion is guarded by WHERE > 0 and
 * its functions are CREATE OR REPLACE; 075 uses IF NOT EXISTS throughout.
 * Safe to re-run.
 *
 * Requires DATABASE_URL in .env.local or the environment — the Supabase
 * connection string WITH your database password:
 *   Supabase Dashboard → Project Settings → Database → Connection string (URI)
 *   e.g. postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres
 *
 * Run:  node scripts/apply-migrations-074-075.js
 */
const { readFileSync } = require('fs');
const path = require('path');
const { Client } = require('pg');

const MIGRATIONS = [
  'supabase/migrations/074_unified_credit_balance.sql',
  'supabase/migrations/075_health_findings.sql',
];

function getEnv(name) {
  if (process.env[name]) return process.env[name];
  try {
    const env = readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
    const map = env.split('\n').map((l) => l.trim()).filter(Boolean).reduce((acc, line) => {
      if (line.startsWith('#')) return acc;
      const [k, ...rest] = line.split('=');
      acc[k] = rest.join('=');
      return acc;
    }, {});
    return map[name];
  } catch {
    return undefined;
  }
}

(async function main() {
  const databaseUrl = getEnv('DATABASE_URL');
  if (!databaseUrl) {
    console.error(
      '\nDATABASE_URL is not set.\n\n' +
      'Get it from Supabase Dashboard -> Project Settings -> Database -> Connection string (URI),\n' +
      'then add a line to .env.local:\n\n' +
      '  DATABASE_URL=postgresql://postgres.<ref>:<PASSWORD>@aws-0-<region>.pooler.supabase.com:5432/postgres\n'
    );
    process.exit(1);
  }

  const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
  try {
    await client.connect();
    console.log('Connected.');
    for (const m of MIGRATIONS) {
      const sql = readFileSync(path.join(__dirname, '..', m), 'utf8');
      console.log(`\n---- Applying ${m} ----`);
      await client.query(sql);
      console.log(`Applied ${m}`);
    }
    // Post-checks: prove both landed.
    const fn = await client.query(
      "SELECT proname FROM pg_proc WHERE proname IN ('bill_cloud_usage','debit_ai_balance')"
    );
    const tbl = await client.query(
      "SELECT to_regclass('public.health_findings') AS t"
    );
    console.log(`\nVerify: RPCs present: ${fn.rows.map((r) => r.proname).join(', ') || 'NONE'}`);
    console.log(`Verify: health_findings table: ${tbl.rows[0].t ? 'OK' : 'MISSING'}`);
    console.log('\nDone. Both migrations applied.');
  } catch (err) {
    console.error('\nError applying migrations:', err.message || err);
    process.exitCode = 2;
  } finally {
    await client.end();
  }
})();
