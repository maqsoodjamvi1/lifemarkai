# Process-global state audit — Phase 9 of the Vercel adoption plan

Fluid Compute (and any multi-request Node process — which the VPS deployment
already is) serves concurrent requests from one instance, so every module-level
mutable value is shared across users. This audit lists them, with the
concurrency verdict. Rule: global mutable state must be concurrency-safe and
must NEVER contain user-specific authorization data.

| State | Where | Verdict |
| --- | --- | --- |
| OpenRouter balance cache (`cache`) | src/lib/ai/openrouter-balance.ts | SAFE — account-level datum, same for all users; TTL'd; worst case is one stale read. |
| Rate-limit store (`_store` Map) | src/lib/rate-limit.ts | SAFE per instance, keyed by user/IP — but per-INSTANCE: two instances each grant the full budget. Acceptable now (single VPS instance); must move to Redis before horizontal scaling. |
| AI worker child handle (`child`, `starting`) | src/lib/ai-worker-client.ts | SAFE — process management, guarded by the `starting` promise so concurrent boots coalesce. |
| Sandbox provider singleton (`cached`) | src/lib/sandbox/index.ts | SAFE — config-derived, no user data; note it pins the provider for the process lifetime, so a SANDBOX_PROVIDER change needs a restart. |
| Boot dedup map (`bootInflight`) | src/routes/api/projects/$id/sandbox-preview.ts | SAFE — keyed by projectId, entries removed in `finally`; response `.clone()` handles concurrent readers. |
| Vercel AI SDK probe (`probe`) | src/lib/ai/vercel-ai-adapter.ts | SAFE — immutable after first resolution; reset seam is test-only. |
| Vercel Sandbox probe (`probe`) | src/lib/sandbox/vercel.ts | SAFE — same pattern. |
| Correlation/request ALS stores | globalThis keys | SAFE — AsyncLocalStorage is exactly the concurrency-correct tool; the globalThis pinning shares the STORE, never a request's context. |
| Telemetry batch queue (`state.pending`) | src/lib/analytics/client-telemetry.ts | Browser-only — one user per instance by construction. |
| Preview probe state | src/lib/sandbox/shared.ts | Review when scaling: probe caches are keyed by URL; same per-instance caveat as rate limiting. |

**Authorization data check:** none of the above stores tokens, sessions, or
per-user credentials at module scope. Supabase clients are created per request
(`createClient`/`createClientFromRequest`); the admin client is credential-from-env,
not from any user.

## waitUntil discipline (deferWork)

`deferWork()` (src/lib/observability/defer-work.ts) is the one seam for
post-response work, and `registerWaitUntil()` is where a platform-native
waitUntil plugs in later. Good candidates: AI eval logs, analytics, usage
summaries, diagnostic events. NEVER deferred: credit deductions, canonical
file persistence, Stripe subscription changes, database migrations, security
audit decisions — deferred work may be lost on process exit.

## Regional placement note

Supabase and the app both live on the VPS/EU stack today, so the plan's
"place functions near the database" action is already satisfied by
architecture. Re-measure only if either side moves: the number that matters
is app→Postgres round-trip, and every credit claim does several.
