/**
 * Routing economy back-test harness (Lovable's "back-test against a library of
 * queries" practice).
 *
 *   node scripts/eval-routing.mjs
 *
 * Encodes the "economical + smart" routing policy and asserts it across a library
 * of representative prompts, so a change to model-catalog.ts can't silently make
 * the editor more expensive or dumber. Runnable with plain node (no build), and
 * prints a model/tier/relative-cost table per case.
 *
 * NOTE: this mirrors the selection logic in lib/ai/model-catalog.ts + the
 * file-selector heuristics. Keep it in sync when tuning those. It is a policy
 * spec + smoke check, not a substitute for the unit tests next to the code.
 */

// ── Approved catalog (mirror of lib/ai/model-catalog.ts, cost 0=free..5=premium) ──
// RESYNCED 2026-08-19. This copy had drifted badly and was back-testing routing
// against models that no longer exist: "qwen/qwen3-coder:free" is delisted from
// OpenRouter, and the list was missing every model the product now defaults to
// (gpt-5.6-terra/luna, sonnet-5, codestral, the nvidia free tier). A green run
// here therefore proved nothing about live routing. If this drifts again, the
// real fix is to import MODEL_CATALOG instead of re-declaring it.
// ── Approved catalog (mirror of lib/ai/model-catalog.ts) ─────────────────────
// Three models, benchmarked over the full 415-model OpenRouter catalog on
// 2026-08-19. Keep in step with MODEL_CATALOG; the invariant tests in
// src/lib/ai/model-catalog.test.ts pin the real one.
const C = [
  { id: "z-ai/glm-5.2:free", family: "z-ai-52", strengths: ["code", "fixes", "cheap", "fast"], tier: "fast", cost: 0 },
  { id: "deepseek/deepseek-v4-flash", family: "deepseek-flash", strengths: ["fast", "cheap", "content"], tier: "fast", cost: 1 },
  { id: "openai/gpt-5.6-luna", family: "openai-luna", strengths: ["code", "fixes", "design", "content", "longContext", "cheap"], tier: "balanced", cost: 1 },
  { id: "deepseek/deepseek-v4-pro", family: "deepseek", strengths: ["reasoning", "fixes", "code", "longContext"], tier: "balanced", cost: 2 },
  { id: "openai/gpt-5.6-terra", family: "openai", strengths: ["code", "reasoning", "fixes", "design", "content", "longContext", "vision"], tier: "frontier", cost: 3 },
];
const get = (id) => C.find((m) => m.id === id) || null;
const HEAVY = ["design", "fixes", "reasoning", "longContext", "vision"];

const RE = {
  design: /\b(design|styl(e|ing)|theme|colou?r|palette|layout|typograph|ui|ux|responsive|polish|redesign|gradient|dark mode)\b/i,
  content: /\b(copy|content|headline|blog|marketing|seo|rewrite|write (the|a|some))\b/i,
  reasoning: /\b(plan|architect|analy[sz]e|strategy|why|compare|root cause|design a system)\b/i,
  fixes: /\b(fix|debug|error|bug|broken|crash|not working|race condition|regression)\b/i,
  longContext: /\b(whole (app|codebase)|entire (app|codebase)|across|every (file|page)|refactor|migrate)\b/i,
};
function sps(p) {
  p = p || ""; const o = new Set();
  if (RE.fixes.test(p)) o.add("fixes");
  if (RE.design.test(p)) o.add("design");
  if (RE.content.test(p)) o.add("content");
  if (RE.reasoning.test(p)) o.add("reasoning");
  if (RE.longContext.test(p)) o.add("longContext");
  if (o.size === 0 || o.has("fixes") || o.has("longContext")) o.add("code");
  return o;
}
function light(p) { p = (p || "").trim(); if (p.length > 160) return false; return ((p.match(/\b(and|then|also|plus)\b/gi) || []).length) < 2; }
function score(m, d, pc) {
  let s = 0; for (const x of d) if (m.strengths.includes(x)) s += 3;
  const hv = HEAVY.some((x) => d.has(x));
  if (pc) { if (m.tier === "fast") s += 3; if (m.tier === "balanced") s += 1; s -= m.cost; }
  else {
    // Mirrors scoreModel() in lib/ai/model-catalog.ts EXACTLY. The old version
    // gave frontier +3 AND a further +2 to "anthropic or openai", stacking to
    // +5 so the priciest model led every substantial request. Frontier is the
    // escalation target; the cheap->heavy safety net below makes it reachable
    // without it having to win the lead.
    if (m.tier === "frontier") s += 1;
    if (m.tier === "balanced") s += 2;
    if (hv && m.tier === "fast") s -= 2;
    if (hv && m.cost === 0) s -= 3;
    s -= Math.max(0, m.cost - 1);
  }
  return s;
}
function chain(prompt, opts = {}) {
  const maxChain = Math.max(1, opts.maxChain ?? 3);
  const anchor = opts.anchor ?? "openai/gpt-5.6-luna";
  const d = new Set(sps(prompt)); for (const s of opts.require || []) d.add(s);
  const hasHeavy = HEAVY.some((s) => d.has(s));
  const pc = opts.preferCheap ?? (light(prompt) && !hasHeavy);
  const ranked = C.map((m) => ({ m, s: score(m, d, pc) })).sort((a, b) => b.s - a.s || a.m.cost - b.m.cost);
  // Diversity is by VENDOR (slug prefix), not by `family`. Families are variant
  // buckets — openai / openai-codex / openai-gpt52 / openai-luna are one lab —
  // so keying on family let an all-OpenAI cascade pass as "cross-model".
  // Mirrors the same change in lib/ai/model-catalog.ts.
  const out = []; const vendors = new Set();
  for (const { m } of ranked) { if (out.length >= maxChain) break; if (out.includes(m.id) || vendors.has(vendorOf(m.id))) continue; out.push(m.id); vendors.add(vendorOf(m.id)); }
  if (out.length < maxChain) for (const { m } of ranked) { if (out.length >= maxChain) break; if (!out.includes(m.id)) out.push(m.id); }
  const hasFront = out.some((id) => get(id)?.tier === "frontier");
  if ((get(out[0])?.cost ?? 5) <= 1 && !hasFront) {
    const heavy = C.filter((m) => m.tier === "frontier" && !out.includes(m.id)).sort((a, b) => b.cost - a.cost)[0];
    if (heavy) out.push(heavy.id);
  }
  if (!out.includes(anchor)) out.push(anchor);
  return out;
}
const vendorOf = (id) => String(id).split("/")[0];
const famOf = (id) => get(id)?.family || "";
// The policy this harness enforces changed on 2026-08-19 and the rename matters.
// It used to be "substantial work must LEAD with a premium model" (frontier, or
// specifically an OpenAI/Anthropic slug). That is no longer the product's
// policy: the cheap benchmarked lineup leads, and the heavy model is the
// escalation target reached on retry. So "quality" now means the lead is a
// CAPABLE model — not the free tier, not a speed-tier model — while
// heavyReachable separately guarantees something strong is still in the chain.
const isQuality = (id) => {
  const m = get(id);
  return Boolean(m) && m.cost > 0 && m.tier !== "fast";
};
const isHeavy = (id) => get(id)?.tier === "frontier";

// ── Prompt library (mode reflects how the editor would call selection) ────────
const cases = [
  { name: "trivial patch", prompt: "make the header sticky", require: [], preferCheap: undefined, expect: "free" },
  { name: "small chat", prompt: "what does this component do", require: [], expect: "free" },
  { name: "feature build", prompt: "build a checkout page with cart summary and coupon field", require: ["code"], preferCheap: false, expect: "quality" },
  { name: "complex fix", prompt: "fix the hydration race condition across the whole app", require: ["fixes", "code"], preferCheap: false, expect: "quality" },
  { name: "design task", prompt: "redesign the hero with a modern gradient and dark mode", require: ["design"], preferCheap: false, expect: "quality" },
  { name: "content task", prompt: "write marketing copy and headlines for the landing page", require: ["content"], preferCheap: false, expect: "quality" },
  { name: "refactor", prompt: "refactor the auth logic across every page", require: ["code"], preferCheap: false, expect: "quality" },
];

let pass = 0, fail = 0;
console.log("case                | primary                        | tier      | cascade");
console.log("-".repeat(96));
for (const c of cases) {
  const ch = chain(c.prompt, { require: c.require, preferCheap: c.preferCheap });
  const prim = get(ch[0]);
  const okFree = c.expect === "free" ? prim.cost === 0 : true;
  const okQuality = c.expect === "quality" ? isQuality(ch[0]) : true;
  const okCascadeHeavy = c.expect === "free" ? ch.some((id) => get(id)?.tier === "frontier") : true; // free→heavy safety net
  // Was: "the chain must contain both an Anthropic AND an OpenAI model." That
  // policy died with the no-OpenAI change, and a rule naming two specific labs
  // was the wrong shape anyway — the property that actually matters is that the
  // cascade crosses vendors (so retry #2 doesn't inherit retry #1's blind spots)
  // and can still reach a heavy model when the cheap lead gets stuck.
  const vendors = new Set(ch.map((id) => vendorOf(id)));
  const okVendorSpread = c.expect === "quality" ? vendors.size >= 2 : true;
  const okHeavyReachable = c.expect === "quality" ? ch.some((id) => isHeavy(id)) : true;
  const okQualityBoth = okVendorSpread && okHeavyReachable;
  const ok = okFree && okQuality && okCascadeHeavy && okQualityBoth;
  if (ok) pass++; else fail++;
  console.log(`${(ok ? "PASS " : "FAIL ") + c.name}`.padEnd(20) + "| " + ch[0].padEnd(30) + "| " + prim.tier.padEnd(9) + "| " + ch.join(" → "));
  if (!ok) console.log(`     expected ${c.expect}: free=${okFree} quality=${okQuality} freeHeavySafetyNet=${okCascadeHeavy} vendorSpread=${okVendorSpread} heavyReachable=${okHeavyReachable}`);
}
console.log("-".repeat(96));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
