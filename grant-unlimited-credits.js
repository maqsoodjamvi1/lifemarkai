/**
 * Give a single account effectively-unlimited credits, for testing.
 *
 * Run:  node grant-unlimited-credits.js [email]
 *       (defaults to maqsoodjamvi@gmail.com)
 *
 * Reads DATABASE_URL (or SUPABASE_MANAGEMENT_TOKEN + project ref) from
 * .env.local. The credential is never printed.
 *
 * WHY TWO FIELDS AND NOT ONE:
 *
 *   1. `profiles.credits` is the real gate. Every build path reads it
 *      (lib/ai/http/chat.ts, lib/ai/http/agent.ts) and `deduct_credits()`
 *      refuses when `credits < amount`. Setting the plan alone changes the
 *      badge in the UI and nothing else.
 *
 *   2. `profiles.plan` matters because `reset_free_credits()` rewrites
 *      `credits = 5` for every row where `plan = 'free'` older than 24h. Leave
 *      the plan on 'free' and this grant silently evaporates within a day —
 *      which is exactly the kind of thing that looks like "the credits bug came
 *      back" a week later. 'enterprise' is already the catalog's unlimited tier
 *      (lib/stripe/plans.ts: credits: -1), and the reset function does not
 *      touch it.
 *
 * The balance is 1e9, not a sentinel like -1: the deduction path does real
 * arithmetic, and a negative starting balance would fail the `credits < amount`
 * check immediately. A billion credits at Lovable-like pricing is more than any
 * test campaign will spend, and it stays inside PostgreSQL's int4 ceiling
 * (2,147,483,647) so nothing overflows.
 *
 * Idempotent — safe to re-run any time the balance needs topping back up.
 */
const { readFileSync } = require("fs");
const path = require("path");

const EMAIL = (process.argv[2] || "maqsoodjamvi@gmail.com").toLowerCase();
const GRANT = 1000000000; // 1e9, comfortably under int4 max
const PLAN = "enterprise";

function loadEnvLocal() {
  try {
    return readFileSync(path.join(__dirname, ".env.local"), "utf8")
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

const esc = (s) => String(s).replace(/'/g, "''");

const UPDATE_SQL = `
update public.profiles
   set credits = ${GRANT},
       plan = '${PLAN}',
       credits_reset_at = now(),
       updated_at = now()
 where lower(email) = '${esc(EMAIL)}';
`;

const VERIFY_SQL = `
select email, plan, credits::text as credits
  from public.profiles
 where lower(email) = '${esc(EMAIL)}';
`;

(async function main() {
  const databaseUrl = getEnv("DATABASE_URL");
  const mgmtToken = getEnv("SUPABASE_MANAGEMENT_TOKEN");
  const ref =
    getEnv("SUPABASE_PROJECT_REF") ||
    refFromUrl(getEnv("VITE_SUPABASE_URL")) ||
    refFromUrl(getEnv("NEXT_PUBLIC_SUPABASE_URL"));

  let run;

  if (databaseUrl) {
    const { Client } = require("pg");
    const client = new Client({ connectionString: databaseUrl, ssl: { rejectUnauthorized: false } });
    await client.connect();
    console.log("Connected via DATABASE_URL.");
    run = async (q) => (await client.query(q)).rows;
    process.on("exit", () => { try { client.end(); } catch {} });
  } else if (mgmtToken && ref) {
    console.log(`Connected via Management API (project ${ref}).`);
    run = async (query) => {
      const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
        method: "POST",
        headers: { Authorization: `Bearer ${mgmtToken}`, "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const text = await res.text();
      if (!res.ok) throw new Error(`Management API ${res.status}: ${text.slice(0, 600)}`);
      try { return JSON.parse(text); } catch { return []; }
    };
  } else {
    console.error("Need DATABASE_URL or SUPABASE_MANAGEMENT_TOKEN + project URL in .env.local.");
    process.exit(1);
  }

  // Confirm the account exists BEFORE updating. An UPDATE that matches no rows
  // succeeds silently, and "it ran fine but nothing changed" is the worst
  // possible outcome for a script whose whole job is to change one row.
  const before = await run(VERIFY_SQL);
  if (!before.length) {
    console.error(`\nNo profile found for ${EMAIL}.`);
    console.error("Sign in to lifemarkai.com with that address once, then re-run this.");
    process.exit(1);
  }
  console.log(`\nBefore: plan=${before[0].plan} credits=${before[0].credits}`);

  await run(UPDATE_SQL);

  const after = await run(VERIFY_SQL);
  if (!after.length) {
    console.error("Row vanished after update — nothing to verify.");
    process.exit(1);
  }
  console.log(`After:  plan=${after[0].plan} credits=${after[0].credits}`);

  const ok = after[0].plan === PLAN && Number(after[0].credits) >= GRANT;
  if (!ok) {
    console.error("\nFAILED — the row did not end up in the expected state.");
    process.exit(1);
  }

  console.log(`\n${EMAIL} is on '${PLAN}' with ${GRANT.toLocaleString()} credits.`);
  console.log("The daily free-plan reset does not touch this row. Re-run any time to top up.");
  process.exit(0);
})().catch((e) => {
  console.error("FAILED:", e.message || e);
  process.exit(1);
});
