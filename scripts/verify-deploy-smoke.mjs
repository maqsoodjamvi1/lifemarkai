/**
 * Deployment-safety smoke tests — Phase 3 of the Vercel adoption plan.
 *
 * Unlike verify-production-smoke.mjs (which checks that public pages RENDER),
 * this suite checks that the protective behaviours HOLD after a deploy:
 * endpoints that must reject unauthenticated or unsigned traffic still do.
 * A deploy that accidentally strips auth from /api/ai/chat would pass a
 * render-smoke and fail loudly here.
 *
 * Every check asserts a rejection, so the suite needs no credentials and can
 * run against a preview URL, CI localhost, or production.
 *
 * Usage: node scripts/verify-deploy-smoke.mjs [baseUrl]
 *        SMOKE_BASE_URL=https://preview.example node scripts/verify-deploy-smoke.mjs
 */
const BASE = (process.argv[2] ?? process.env.SMOKE_BASE_URL ?? "http://localhost:3001").replace(/\/$/, "");

let passed = 0;
let failed = 0;
const failures = [];

async function expect(name, path, init, allowedStatuses, forbiddenBodyFragments = []) {
  const url = `${BASE}${path}`;
  try {
    const res = await fetch(url, { redirect: "manual", ...init });
    const text = await res.text().catch(() => "");
    const statusOk = allowedStatuses.includes(res.status);
    const leaked = forbiddenBodyFragments.filter((f) => text.includes(f));
    const ok = statusOk && leaked.length === 0;
    if (ok) {
      passed++;
      console.log(`ok   ${name} (${res.status})`);
    } else {
      failed++;
      failures.push(name);
      console.error(`FAIL ${name}: status=${res.status} expected one of [${allowedStatuses}]${leaked.length ? ` leaked: ${leaked}` : ""} url=${url}`);
    }
  } catch (err) {
    failed++;
    failures.push(name);
    console.error(`FAIL ${name}: ${err instanceof Error ? err.message : err} url=${url}`);
  }
}

// ── The safety invariants ───────────────────────────────────────────────────

// Auth callback with no code must not 200 into a session.
await expect("auth callback rejects empty code", "/auth/callback", {}, [302, 303, 307, 400, 401]);

// Project creation requires a session.
await expect("project creation requires auth", "/api/projects", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ name: "smoke" }),
}, [401, 403]);

// Chat SSE endpoint requires a session (and must not stream to strangers).
await expect("chat requires auth", "/api/ai/chat", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ projectId: "00000000-0000-0000-0000-000000000000", message: "hi" }),
}, [401, 403]);

// Agent route requires a session; 423 means the Live-environment lock answered,
// which is also an authenticated-space behaviour and must not appear here.
await expect("agent requires auth", "/api/ai/agent", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ projectId: "00000000-0000-0000-0000-000000000000", task: "smoke" }),
}, [401, 403]);

// Credit endpoints never answer anonymously.
await expect("credits require auth", "/api/billing/credits", {}, [401, 403]);

// Stripe webhook MUST reject an unsigned body — this is the check that catches
// a misconfigured STRIPE_WEBHOOK_SECRET or a stripped signature middleware.
await expect("stripe webhook rejects unsigned body", "/api/billing/webhook", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ id: "evt_fake", type: "checkout.session.completed" }),
}, [400]);

// Stripe webhook must also reject a WRONG signature, not just a missing one.
await expect("stripe webhook rejects bad signature", "/api/billing/webhook", {
  method: "POST",
  headers: { "content-type": "application/json", "stripe-signature": "t=1,v1=deadbeef" },
  body: JSON.stringify({ id: "evt_fake", type: "checkout.session.completed" }),
}, [400]);

// Cloud status endpoint answers (200 shape or auth rejection), never 5xx.
await expect("cloud status responds sanely", "/api/cloud/status", {}, [200, 400, 401, 403]);

// Sandbox preview boot is not anonymous.
await expect("sandbox preview requires auth", "/api/projects/00000000-0000-0000-0000-000000000000/sandbox-preview", {
  method: "POST",
}, [401, 403, 404]);

// Client telemetry sink accepts nothing loud — 204 whatever you throw at it.
await expect("telemetry sink is silent", "/api/telemetry/client", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ garbage: true }),
}, [204]);

// Unknown API paths are honest 404s (catch-all regression check).
await expect("unknown api path is 404", "/api/definitely-not-a-route", {}, [404]);

// No route may leak env var NAMES in error bodies.
await expect("errors do not leak env names", "/api/ai/chat", { method: "POST" },
  [400, 401, 403, 415, 500],
  ["SUPABASE_SERVICE", "STRIPE_SECRET", "OPENROUTER_API_KEY"]);

console.log(`\n${passed} passed, ${failed} failed${failed ? ` — ${failures.join(", ")}` : ""}`);
process.exit(failed > 0 ? 1 : 0);
