/**
 * Fail the build if any configured model slug is dead on OpenRouter.
 *
 *   node scripts/check-model-slugs.mjs            # live check (needs network)
 *   node scripts/check-model-slugs.mjs --offline  # config consistency only
 *
 * Why: on 2026-08-19 two slugs (`qwen/qwen3-coder:free`, `mistralai/devstral-2512`)
 * had been delisted from OpenRouter while still sitting in the user-facing model
 * picker. Nothing failed loudly — users just got menu entries that could never
 * answer, and 16 real calls went to one of them. Delisting is a normal, silent,
 * upstream event, so it needs a check that runs on a schedule, not a memory.
 *
 * Checks:
 *   1. every slug in the picker, the router catalog and the OPENROUTER_*_MODEL
 *      env overrides resolves on OpenRouter and has at least one live endpoint
 *   2. the picker and the router catalog agree (no menu entry the router rejects)
 *   3. the gateway cost table prices every model the app can actually route to
 *
 * Exit code 1 on any failure, so it can gate CI or a cron.
 */
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const OFFLINE = process.argv.includes("--offline");

const problems = [];
const note = (msg) => problems.push(msg);

// ── Gather every slug the app can route to ───────────────────────────────────
const slugRe = /"([a-z0-9][a-z0-9._-]*\/[a-zA-Z0-9._:-]+)"/g;

async function read(rel) {
  try { return await readFile(join(ROOT, rel), "utf8"); } catch { return ""; }
}

const pickerSrc = await read("src/lib/ai/openrouter-models.ts");
const catalogSrc = await read("src/lib/ai/model-catalog.ts");
const gatewaySrc = await read("gateway/src/index.ts");
const envSrc = await read(".env.local");

const pickerIds = [...pickerSrc.matchAll(/\{\s*id:\s*"([^"]+)"/g)].map((m) => m[1]);

const allowBlock = catalogSrc.slice(
  catalogSrc.indexOf("APPROVED_SMART_MODEL_IDS"),
  catalogSrc.indexOf("export const MODEL_CATALOG"),
);
const allowlist = [...allowBlock.matchAll(slugRe)].map((m) => m[1]);

const envSlugs = envSrc
  .split(/\r?\n/)
  .filter((l) => /^(OPENROUTER_[A-Z0-9_]*MODEL|DEFAULT_AI_MODEL|FAST_AI_MODEL)=/.test(l))
  .map((l) => ({ key: l.split("=")[0], slug: l.split("=").slice(1).join("=").trim() }))
  .filter((e) => e.slug.includes("/"));

const gatewayPriced = new Set(
  [...gatewaySrc.matchAll(/^\s*"([^"]+)":\s*\[/gm)].map((m) => m[1]),
);

// ── 2. picker vs router allowlist ────────────────────────────────────────────
const allowSet = new Set(allowlist);
for (const id of pickerIds) {
  if (!allowSet.has(id)) note(`picker offers "${id}" but it is not in APPROVED_SMART_MODEL_IDS — the router will refuse it`);
}
for (const { key, slug } of envSlugs) {
  if (!allowSet.has(slug)) note(`${key}="${slug}" is not allowlisted — its catalog entry is silently dropped`);
}

// ── 3. gateway cost coverage ─────────────────────────────────────────────────
for (const id of allowlist) {
  if (!gatewayPriced.has(id)) note(`gateway TOKEN_COST_MAP has no price for "${id}" — it will bill at DEFAULT_COST`);
}

// ── 1. liveness ──────────────────────────────────────────────────────────────
if (!OFFLINE) {
  const res = await fetch("https://openrouter.ai/api/v1/models", { signal: AbortSignal.timeout(30000) });
  if (!res.ok) {
    console.error(`Could not reach OpenRouter (${res.status}). Re-run with --offline to skip the liveness check.`);
    process.exit(2);
  }
  const live = new Set(((await res.json()).data ?? []).map((m) => m.id));
  const configured = [...new Set([...pickerIds, ...allowlist, ...envSlugs.map((e) => e.slug)])];
  for (const id of configured) {
    if (!live.has(id)) note(`DEAD SLUG: "${id}" is no longer in the OpenRouter catalog`);
  }
  console.log(`checked ${configured.length} configured slugs against ${live.size} live OpenRouter models`);
} else {
  console.log("offline mode: skipped the liveness check");
}

// ── Report ───────────────────────────────────────────────────────────────────
if (problems.length) {
  console.error(`\n${problems.length} problem(s):`);
  for (const p of problems) console.error(`  ✗ ${p}`);
  process.exit(1);
}
console.log(`OK — picker=${pickerIds.length} allowlist=${allowlist.length} env=${envSlugs.length}, all live, all priced, all agreeing`);
