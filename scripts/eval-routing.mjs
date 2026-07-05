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
const C = [
  { id: "qwen/qwen3-coder:free", family: "qwen-free", strengths: ["code", "fixes", "cheap", "fast", "longContext"], tier: "fast", cost: 0 },
  { id: "deepseek/deepseek-v4-flash", family: "deepseek", strengths: ["fast", "cheap", "code"], tier: "fast", cost: 1 },
  { id: "google/gemini-3.1-flash-lite", family: "google", strengths: ["fast", "cheap", "vision", "content"], tier: "fast", cost: 1 },
  { id: "qwen/qwen3-coder", family: "qwen", strengths: ["code", "fixes", "cheap", "longContext"], tier: "balanced", cost: 2 },
  { id: "deepseek/deepseek-v4-pro", family: "deepseek", strengths: ["code", "reasoning", "fixes", "cheap"], tier: "balanced", cost: 2 },
  { id: "google/gemini-3.5-flash", family: "google", strengths: ["reasoning", "vision", "longContext", "design", "content"], tier: "balanced", cost: 2 },
  { id: "anthropic/claude-sonnet-4.6", family: "anthropic", strengths: ["code", "design", "reasoning", "content", "fixes"], tier: "balanced", cost: 3 },
  { id: "openai/gpt-5.2-codex", family: "openai-codex", strengths: ["code", "fixes", "reasoning", "longContext", "vision"], tier: "frontier", cost: 4 },
  { id: "openai/gpt-5.2", family: "openai-gpt52", strengths: ["reasoning", "code", "content", "vision", "longContext"], tier: "frontier", cost: 4 },
  { id: "anthropic/claude-opus-4.8", family: "anthropic", strengths: ["code", "reasoning", "fixes", "longContext", "design"], tier: "frontier", cost: 5 },
  { id: "openai/gpt-5.5", family: "openai", strengths: ["reasoning", "code", "content", "vision", "longContext"], tier: "frontier", cost: 5 },
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
    if (m.tier === "frontier") s += 3; if (m.tier === "balanced") s += 1;
    if (hv && m.tier === "fast") s -= 2; if (hv && m.cost === 0) s -= 2;
    s -= Math.max(0, m.cost - 3);
    if (m.family === "anthropic" || m.family.startsWith("openai")) s += 2; // OpenAI+Claude quality tier
  }
  return s;
}
function chain(prompt, opts = {}) {
  const maxChain = Math.max(1, opts.maxChain ?? 3);
  const anchor = opts.anchor ?? "qwen/qwen3-coder";
  const d = new Set(sps(prompt)); for (const s of opts.require || []) d.add(s);
  const hasHeavy = HEAVY.some((s) => d.has(s));
  const pc = opts.preferCheap ?? (light(prompt) && !hasHeavy);
  const ranked = C.map((m) => ({ m, s: score(m, d, pc) })).sort((a, b) => b.s - a.s || a.m.cost - b.m.cost);
  const out = []; const fam = new Set();
  for (const { m } of ranked) { if (out.length >= maxChain) break; if (out.includes(m.id) || fam.has(m.family)) continue; out.push(m.id); fam.add(m.family); }
  if (out.length < maxChain) for (const { m } of ranked) { if (out.length >= maxChain) break; if (!out.includes(m.id)) out.push(m.id); }
  const hasFront = out.some((id) => get(id)?.tier === "frontier");
  if ((get(out[0])?.cost ?? 5) <= 1 && !hasFront) {
    const heavy = C.filter((m) => m.tier === "frontier" && !out.includes(m.id)).sort((a, b) => b.cost - a.cost)[0];
    if (heavy) out.push(heavy.id);
  }
  if (!out.includes(anchor)) out.push(anchor);
  return out;
}
const famOf = (id) => get(id)?.family || "";
const isQuality = (id) => famOf(id) === "anthropic" || famOf(id).startsWith("openai");

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
  const okQualityBoth = c.expect === "quality" ? (ch.some((id) => famOf(id) === "anthropic") && ch.some((id) => famOf(id).startsWith("openai"))) : true;
  const ok = okFree && okQuality && okCascadeHeavy && okQualityBoth;
  if (ok) pass++; else fail++;
  console.log(`${(ok ? "PASS " : "FAIL ") + c.name}`.padEnd(20) + "| " + ch[0].padEnd(30) + "| " + prim.tier.padEnd(9) + "| " + ch.join(" → "));
  if (!ok) console.log(`     expected ${c.expect}: free=${okFree} quality=${okQuality} freeHeavySafetyNet=${okCascadeHeavy} qualitySpansBoth=${okQualityBoth}`);
}
console.log("-".repeat(96));
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
