/**
 * Per-model report from your OWN traffic: cost, latency, repair rate.
 *
 *   node scripts/model-report.mjs [days]
 *
 * This exists because every model decision so far was argued from a synthetic
 * benchmark. A benchmark measures whether generated code parses and typechecks;
 * it says nothing about what your users actually ask for, how big their projects
 * get, or how often a model's output needs repairing. Those are the numbers that
 * should decide a tier, and they only exist here.
 *
 * Needs SUPABASE_SERVICE_ROLE_KEY (reads ai_eval_log and repair_outcomes).
 * Rows written before migration 177 have no cost — they are reported as
 * "unpriced" rather than as zero.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const days = Number(process.argv[2] ?? 30);
const since = new Date(Date.now() - days * 864e5).toISOString();
const db = createClient(url, key, { auth: { persistSession: false } });

const { data: calls, error } = await db
  .from("ai_eval_log")
  .select("model, task, latency_ms, tokens_used, prompt_tokens, completion_tokens, cost_usd, success, tool_calls, tool_errors")
  .gte("created_at", since)
  .limit(50000);
if (error) { console.error(error.message); process.exit(1); }

const med = (xs) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : 0);
const pct = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length * p)] : 0);

const byModel = new Map();
for (const c of calls ?? []) {
  const m = byModel.get(c.model) ?? { n: 0, ok: 0, lat: [], cost: 0, unpriced: 0, tok: 0, toolErr: 0 };
  m.n++;
  if (c.success) m.ok++;
  if (c.latency_ms != null) m.lat.push(c.latency_ms);
  if (c.cost_usd != null) m.cost += Number(c.cost_usd); else m.unpriced++;
  m.tok += c.tokens_used ?? 0;
  // tool_errors is not populated yet (see eval-log.ts). Counting nulls as 0
  // here would print a confident "0 tool errors" for something never measured.
  if (c.tool_errors != null) m.toolErr += c.tool_errors; else m.toolErrUnknown = true;
  byModel.set(c.model, m);
}

console.log(`\nLast ${days} days — ${(calls ?? []).length} calls\n`);
console.log(`${"model".padEnd(38)}${"calls".padStart(7)}${"ok%".padStart(7)}${"p50".padStart(8)}${"p95".padStart(9)}${"cost$".padStart(10)}${"unpriced".padStart(10)}`);
for (const [model, m] of [...byModel].sort((a, b) => b[1].cost - a[1].cost)) {
  console.log(
    model.padEnd(38) +
      String(m.n).padStart(7) +
      ((m.ok / m.n) * 100).toFixed(1).padStart(7) +
      `${med(m.lat)}ms`.padStart(8) +
      `${pct(m.lat, 0.95)}ms`.padStart(9) +
      m.cost.toFixed(4).padStart(10) +
      String(m.unpriced).padStart(10),
  );
}
const total = [...byModel.values()].reduce((s, m) => s + m.cost, 0);
const unpriced = [...byModel.values()].reduce((s, m) => s + m.unpriced, 0);
console.log(`\ntotal priced spend: $${total.toFixed(4)}` + (unpriced ? `   (${unpriced} calls had no price — cost is a FLOOR, not the true total)` : ""));

// ── Repair rate: the number that actually drives cost ────────────────────────
const { data: repairs } = await db
  .from("repair_outcomes")
  .select("signal, round, model, fully_resolved, made_worse")
  .gte("created_at", since)
  .limit(20000);

if (repairs?.length) {
  const bySignal = new Map();
  for (const r of repairs) {
    const s = bySignal.get(r.signal) ?? { n: 0, fixed: 0, worse: 0 };
    s.n++;
    if (r.fully_resolved) s.fixed++;
    if (r.made_worse) s.worse++;
    bySignal.set(r.signal, s);
  }
  console.log(`\nrepair attempts by signal (which check found the problem):`);
  for (const [signal, s] of bySignal) {
    console.log(`  ${String(signal).padEnd(12)} ${String(s.n).padStart(5)} attempts   ${((s.fixed / s.n) * 100).toFixed(0)}% fully fixed   ${s.worse} made it worse`);
  }
  console.log(`\n  A healthy trend after the typecheck gate: 'typecheck' attempts RISE (cheap,`);
  console.log(`  precise, caught before the browser) while 'runtime' attempts FALL.`);
} else {
  console.log("\nno repair_outcomes rows in this window");
}
