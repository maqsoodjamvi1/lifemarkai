/**
 * Launch readiness — measures the release thresholds against your own data.
 *
 *   node scripts/launch-readiness.mjs [days]
 *
 * Turns "is it good enough to launch" from an argument into a query.
 *
 * THE ONE RULE THIS SCRIPT FOLLOWS: a threshold that cannot be measured is
 * reported as UNMEASURED, never as a pass and never as a fail. A readiness
 * check that shows green because a table is empty is worse than no check — it
 * manufactures confidence. Every UNMEASURED line says exactly what is missing
 * and how to switch it on.
 *
 * Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) { console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY."); process.exit(1); }

const days = Number(process.argv[2] ?? 30);
const since = new Date(Date.now() - days * 864e5).toISOString();
const db = createClient(url, key, { auth: { persistSession: false } });

const results = [];
const PASS = "PASS", FAIL = "FAIL", UNMEASURED = "UNMEASURED";
const check = (name, target, status, detail) => results.push({ name, target, status, detail });

const rows = async (table, select, extra = (q) => q) => {
  const { data, error } = await extra(db.from(table).select(select).gte("created_at", since).limit(50000));
  if (error) return null;
  return data ?? [];
};

// ── 1 & 3. Build outcomes: render success and terminal state ────────────────
const { data: runs, error: runsErr } = await db
  .from("build_runs")
  .select("id, status, verification_passed, failure_code, started_at, completed_at, credit_reservation_key, credit_finalization_key, candidate_version")
  .gte("started_at", since)
  .limit(50000);

const TERMINAL = new Set(["succeeded", "failed", "cancelled", "completed", "error"]);

if (runsErr || !runs || runs.length === 0) {
  const why = runsErr
    ? `query failed: ${runsErr.message}`
    : "build_runs is EMPTY — rows are only written when the `vercelWorkflow` feature flag is on (env VERCEL_WORKFLOW_ENABLED). The durable-run infrastructure exists but is switched off, so build outcomes are not being recorded at all.";
  check("Builds render successfully", "≥90%", UNMEASURED, why);
  check("Builds reach a terminal state", "≥95%", UNMEASURED, "same source (build_runs)");
  check("Failed builds never replace the last working version", "0 violations", UNMEASURED, "needs build_runs.candidate_version + verification_passed");
  check("Median time to first preview", "report only", UNMEASURED, "needs build_runs.started_at/completed_at");
} else {
  const verified = runs.filter((r) => r.verification_passed === true).length;
  const pctOk = (verified / runs.length) * 100;
  check("Builds render successfully", "≥90%", pctOk >= 90 ? PASS : FAIL, `${pctOk.toFixed(1)}% (${verified}/${runs.length})`);

  const terminal = runs.filter((r) => TERMINAL.has(String(r.status))).length;
  const pctTerm = (terminal / runs.length) * 100;
  check("Builds reach a terminal state", "≥95%", pctTerm >= 95 ? PASS : FAIL, `${pctTerm.toFixed(1)}% (${terminal}/${runs.length})`);

  const published = runs.filter((r) => r.verification_passed === false && r.candidate_version != null && TERMINAL.has(String(r.status)) && r.failure_code == null);
  check("Failed builds never replace the last working version", "0 violations", published.length === 0 ? PASS : FAIL,
    published.length === 0 ? "no failed run published a candidate" : `${published.length} failed run(s) look published`);

  const durs = runs.filter((r) => r.started_at && r.completed_at).map((r) => new Date(r.completed_at) - new Date(r.started_at)).sort((a, b) => a - b);
  check("Median time to first preview", "report only", durs.length ? PASS : UNMEASURED,
    durs.length ? `${Math.round(durs[Math.floor(durs.length / 2)] / 1000)}s median, ${Math.round(durs[Math.floor(durs.length * 0.9)] / 1000)}s p90` : "no completed runs");

  // 4. Duplicate credit charges — idempotency keys must be unique.
  for (const [label, col] of [["reservation", "credit_reservation_key"], ["finalization", "credit_finalization_key"]]) {
    const seen = new Map();
    for (const r of runs) if (r[col]) seen.set(r[col], (seen.get(r[col]) ?? 0) + 1);
    const dupes = [...seen.values()].filter((n) => n > 1).length;
    check(`No duplicate credit ${label}s`, "0", dupes === 0 ? PASS : FAIL, dupes === 0 ? `${seen.size} unique keys` : `${dupes} key(s) used more than once`);
  }
}

// ── 2. Pass without an AI repair ────────────────────────────────────────────
// Measured from ai_eval_log rather than repair_outcomes: repair_outcomes only
// records attempts that had a scoreable before/after, so it undercounts badly.
const calls = await rows("ai_eval_log", "project_id, task, created_at, cost_usd");
if (!calls || calls.length === 0) {
  check("Builds pass without an AI repair", "≥80%", UNMEASURED, "ai_eval_log empty for this window");
} else {
  const sessions = new Map();
  for (const c of calls) {
    const k = `${c.project_id}|${String(c.created_at).slice(0, 13)}`;
    const s = sessions.get(k) ?? { gen: 0, repair: 0 };
    if (/build\.primary|agent\.iteration/.test(c.task ?? "")) s.gen++;
    if (/autofix|repair|self_verify/.test(c.task ?? "")) s.repair++;
    sessions.set(k, s);
  }
  const builds = [...sessions.values()].filter((s) => s.gen > 0);
  const noRepair = builds.filter((s) => s.repair === 0).length;
  const pct = builds.length ? (noRepair / builds.length) * 100 : 0;
  check("Builds pass without an AI repair", "≥80%", pct >= 80 ? PASS : FAIL,
    `${pct.toFixed(1)}% (${noRepair}/${builds.length} build sessions, hourly bucketed)`);

  const priced = calls.filter((c) => c.cost_usd != null);
  check("Model spend is measurable", "all calls priced", priced.length === calls.length ? PASS : FAIL,
    `${priced.length}/${calls.length} calls priced` + (priced.length < calls.length ? " — rows before migration 177 have no cost" : ""));
}

// ── 8. Published projects passed verification ───────────────────────────────
const deploys = await rows("deployments", "id, project_id, status, created_at");
if (!deploys || deploys.length === 0) {
  check("Published projects pass route + browser checks", "100%", UNMEASURED, "no deployments in this window");
} else {
  check("Published projects pass route + browser checks", "100%", UNMEASURED,
    `${deploys.length} deployment(s), but deployments carries no verification link — join needs build_runs (currently empty)`);
}

// ── 5. Cross-project isolation ──────────────────────────────────────────────
check("No cross-project file or sandbox access", "0 violations", UNMEASURED,
  "not derivable from these tables — needs an access-denied audit log, or a integration test that asserts project A cannot read project B");

// ── Report ──────────────────────────────────────────────────────────────────
const w = Math.max(...results.map((r) => r.name.length));
console.log(`\nLaunch readiness — last ${days} days\n`);
for (const r of results) {
  const mark = r.status === PASS ? "PASS      " : r.status === FAIL ? "FAIL      " : "UNMEASURED";
  console.log(`${mark} ${r.name.padEnd(w)}  ${r.target.padEnd(12)} ${r.detail}`);
}
const fails = results.filter((r) => r.status === FAIL).length;
const unmeasured = results.filter((r) => r.status === UNMEASURED).length;
console.log(`\n${results.filter((r) => r.status === PASS).length} pass, ${fails} fail, ${unmeasured} unmeasured`);
if (unmeasured) {
  console.log(`\n${unmeasured} threshold(s) cannot be measured. That is not a pass — it means you would be`);
  console.log(`launching without knowing. The largest single fix is enabling VERCEL_WORKFLOW_ENABLED,`);
  console.log(`which starts populating build_runs and makes 6 of these measurable.`);
}
process.exit(fails > 0 ? 1 : 0);
