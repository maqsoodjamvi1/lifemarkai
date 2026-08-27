#!/usr/bin/env node
/**
 * Which failures keep coming back — the "every repeated repair is a missing
 * normalizer" report.
 *
 * repair_outcomes fingerprints every failure a repair round saw. When one
 * fingerprint recurs across many attempts, an LLM is being paid repeatedly to
 * fix something deterministic code should fix once: the top fingerprint at the
 * time this script was written had been attempted 43 times, and triaging the
 * leaders produced three shipped normalizers in a day (stylesheet imports,
 * bundler asset lists, routeTree.gen).
 *
 * Run weekly. For each leader, decide:
 *   1. NORMALIZER  — deterministic fix in code (free, instant, 100% reliable).
 *      Precedents: normalize-imports.ts, ensureCommonGeneratedSupportFiles,
 *      the ASSET/ROUTETREE shims in typecheck-gate.ts.
 *   2. PROMPT RULE — the generator should stop producing it; add to the
 *      relevant contract in system-prompts.ts.
 *   3. REAL        — genuinely needs a model; leave it to the repair ladder,
 *      which repair-memory.ts now briefs with the failed attempts.
 *
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/repair-fingerprint-report.mjs [days]
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.");
  process.exit(1);
}
const days = Number(process.argv[2]) || 30;
const since = new Date(Date.now() - days * 86_400_000).toISOString();
const supabase = createClient(url, key);

const { data, error } = await supabase
  .from("repair_outcomes")
  .select("before_fingerprints, resolved, model, sample_label, signal, created_at")
  .gte("created_at", since)
  .limit(5000);
if (error) {
  console.error("query failed:", error.message);
  process.exit(1);
}

// fingerprint -> attempts, resolutions, sample labels, models tried
const agg = new Map();
for (const row of data ?? []) {
  const resolved = new Set(row.resolved ?? []);
  for (const f of row.before_fingerprints ?? []) {
    const s = agg.get(f) ?? { attempts: 0, resolved: 0, labels: new Set(), models: new Set(), signal: row.signal, last: row.created_at };
    s.attempts++;
    if (resolved.has(f)) s.resolved++;
    if (row.sample_label) s.labels.add(row.sample_label);
    if (row.model) s.models.add(row.model);
    if (row.created_at > s.last) s.last = row.created_at;
    agg.set(f, s);
  }
}

const leaders = [...agg]
  .sort((a, b) => b[1].attempts - a[1].attempts)
  .slice(0, 15);

console.log(`repair fingerprints, last ${days} days — ${data?.length ?? 0} repair rows, ${agg.size} distinct failures`);
console.log("");
console.log("FP           ATTEMPTS  RESOLVED  SIGNAL     LAST SEEN    MODELS TRIED");
console.log("-".repeat(96));
for (const [fp, s] of leaders) {
  const rate = s.attempts ? Math.round((100 * s.resolved) / s.attempts) : 0;
  console.log(
    `${fp.padEnd(13)}${String(s.attempts).padStart(6)}${String(s.resolved).padStart(9)} (${String(rate).padStart(3)}%)  ${String(s.signal).padEnd(10)} ${s.last.slice(0, 10)}   ${[...s.models].slice(0, 3).join(", ")}`,
  );
  // One sample label so the fingerprint is actionable without a second query.
  const sample = [...s.labels][0];
  if (sample) console.log(`             ${sample.slice(0, 100)}`);
}
console.log("");
console.log("Triage rule: >5 attempts with a low resolve rate = a missing normalizer or prompt rule, not a model problem.");
