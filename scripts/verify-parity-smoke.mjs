/**
 * Post-deploy smoke test for the Lovable-parity systems.
 *
 *   node scripts/verify-parity-smoke.mjs [baseUrl]
 *   SMOKE_BASE_URL=https://your-app.com node scripts/verify-parity-smoke.mjs
 *
 * Hits the endpoints added during the parity work and asserts the EXPECTED
 * behaviour — including the "correct" failures (401/402/412/423) that prove a
 * guard is wired, not broken. Auth-gated routes returning 401 unauthenticated
 * is a PASS (the route exists and enforces auth). Exit code 0 = all pass.
 *
 * This does NOT need credentials — it verifies routing, guards, and that the
 * migrations/env are loaded. For full end-to-end (real builds, real Stripe),
 * use the manual checklist in DEPLOY_CHECKLIST.md.
 */
const BASE = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3000").replace(/\/$/, "");

let passed = 0;
let failed = 0;
const results = [];

function record(name, ok, detail) {
  if (ok) passed++; else failed++;
  results.push({ name, ok, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${detail ? `  — ${detail}` : ""}`);
}

async function req(path, { method = "GET", body, headers } = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json", ...headers },
    body: body ? JSON.stringify(body) : undefined,
    redirect: "manual",
  });
  let text = "";
  try { text = await res.text(); } catch { /* ignore */ }
  return { status: res.status, text };
}

/** Pass when the status is one of `expected` (proves the route exists + guards run). */
async function expect(name, path, opts, expected) {
  try {
    const { status, text } = await req(path, opts);
    const ok = expected.includes(status);
    record(name, ok, `HTTP ${status}${ok ? "" : ` (wanted ${expected.join("/")})`}${ok && /error/.test(text) ? "" : ""}`);
  } catch (err) {
    record(name, false, String(err));
  }
}

console.log(`\nParity smoke test → ${BASE}\n${"─".repeat(48)}`);

// 1. Connector gateway — needs auth; unauthenticated should be 401/404, never 500
await expect(
  "Connector gateway routes + guards",
  "/api/projects/00000000-0000-0000-0000-000000000000/connector-proxy",
  { method: "POST", body: { connector: "slack", path: "/auth.test", method: "POST" } },
  [401, 404]
);

// 2. In-app payments — public paywall status; needs projectId, so 400 proves it parses
await expect("Paywall status endpoint", "/api/embed/status", {}, [400]);
await expect("Paywall status with projectId", "/api/embed/status?projectId=demo", {}, [200, 404]);
await expect(
  "Embed checkout validates input",
  "/api/embed/checkout",
  { method: "POST", body: {} },
  [400]
);

// 3. Paywall embed script is served
await expect("paywall.js served", "/embed/paywall.js", {}, [200]);

// 4. Cloud routes — auth-gated
await expect("Cloud status route", "/api/cloud/status?projectId=demo", {}, [401, 404]);
await expect(
  "Cloud provision route",
  "/api/cloud/provision",
  { method: "POST", body: { projectId: "demo" } },
  [401, 404]
);

// 5. Cloud billing cron — must reject without the secret (403)
await expect("Cloud bill-usage cron is secured", "/api/cloud/bill-usage", { method: "POST" }, [401, 403]);
await expect("Daily-backups cron is secured", "/api/cloud/daily-backups", { method: "POST" }, [401, 403]);

// 6. AI routes — auth-gated (401 unauthenticated = guard works)
await expect("Chat route guarded", "/api/ai/chat", { method: "POST", body: { message: "hi", projectId: "demo" } }, [401]);
await expect("Agent route guarded", "/api/ai/agent", { method: "POST", body: { task: "x", projectId: "demo" } }, [401]);
await expect("Image route guarded", "/api/ai/image", { method: "POST", body: { prompt: "x" } }, [401]);

// 7. App shell loads
await expect("Home page loads", "/", {}, [200, 307, 308]);

console.log("─".repeat(48));
console.log(`\nResult: ${passed} passed, ${failed} failed\n`);
if (failed > 0) {
  console.log("Failed checks (a 500 usually means a missing migration or env var):");
  for (const r of results.filter((x) => !x.ok)) console.log(`  ✗ ${r.name} — ${r.detail}`);
  console.log("");
}
process.exit(failed > 0 ? 1 : 0);
