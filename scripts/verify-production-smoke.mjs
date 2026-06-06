/**
 * Production smoke test — hits key routes after build.
 * Usage: node scripts/verify-production-smoke.mjs [baseUrl]
 * Default baseUrl: http://localhost:3000
 */
import { appendFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOG = join(ROOT, "debug-799475.log");
const SESSION = "799475";
const BASE = process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3000";

function log(payload) {
  const line = JSON.stringify({ sessionId: SESSION, timestamp: Date.now(), runId: "smoke", ...payload });
  appendFileSync(LOG, `${line}\n`);
  console.log(line);
}

let passed = 0;
let failed = 0;

async function check(id, name, path, expectStatus = 200, bodyIncludes) {
  const url = `${BASE.replace(/\/$/, "")}${path}`;
  try {
    const res = await fetch(url, { redirect: "follow" });
    const text = await res.text();
    const statusOk = res.status === expectStatus;
    const bodyOk = bodyIncludes ? text.includes(bodyIncludes) : true;
    const ok = statusOk && bodyOk;
    if (ok) passed++;
    else failed++;
    log({
      hypothesisId: id,
      location: "verify-production-smoke.mjs",
      message: name,
      data: { ok, status: res.status, url, bodyLen: text.length, bodyIncludes: bodyIncludes ?? null },
    });
  } catch (err) {
    failed++;
    log({
      hypothesisId: id,
      location: "verify-production-smoke.mjs",
      message: name,
      data: { ok: false, error: String(err), url },
    });
  }
}

const hasBuild = existsSync(join(ROOT, ".next", "BUILD_ID"));
log({
  hypothesisId: "S0",
  location: "verify-production-smoke.mjs",
  message: "build artifact",
  data: { ok: hasBuild, path: ".next/BUILD_ID" },
});
if (!hasBuild) {
  log({ location: "verify-production-smoke.mjs", message: "summary", data: { passed, failed, skipped: true, reason: "no .next build" } });
  process.exit(1);
}

await check("S1", "home page", "/", 200, "Lifemark");
await check("S2", "docs index", "/docs", 200, "Documentation");
await check("S3", "production deploy doc", "/docs/production-deploy", 200, "Production Deploy");
await check("S4", "MCP discovery", "/api/mcp", 200, "lifemarkai");
await check("S5", "templates API", "/api/templates", 200, "shopify-storefront");
await check("S6", "health", "/health", 200);

log({ location: "verify-production-smoke.mjs", message: "summary", data: { passed, failed, base: BASE } });
process.exit(failed > 0 ? 1 : 0);
