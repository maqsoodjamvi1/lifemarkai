# Vercel adoption — Phase 0: baseline and safety controls

Status: **implemented, all flags off**. Nothing in this phase changes runtime
behaviour. It exists so Phases 1–9 can be turned on, measured, and turned off
again without a deploy.

## What shipped

| Piece | File |
| --- | --- |
| Central feature configuration | `src/lib/config/features.ts` |
| Correlation ids (request / build / sandbox / deployment) | `src/lib/observability/correlation.ts` |
| Worker-side correlation seeding | `scripts/ai-http-worker.mjs` |
| Correlation across the AI worker proxy | `src/lib/ai-worker-client.ts` |
| Identity attached after auth | `src/lib/ai/http/chat.ts`, `src/lib/ai/http/agent.ts` |
| Sandbox boot correlation | `src/routes/api/projects/$id/sandbox-preview.ts` |
| ai_eval_log attribution fallback | `src/lib/ai/generate.ts` |
| Tests | `src/lib/config/features.test.ts`, `src/lib/observability/correlation.test.ts` |

## Feature flags

Read them through `isFeatureEnabled(name, { userId, projectId })` — never
`process.env.VERCEL_* === "true"` at a call site, or the rollback matrix below
stops being true.

| Flag | Env var | Phase |
| --- | --- | --- |
| `vercelObservability` | `VERCEL_OBSERVABILITY_ENABLED` | 1 |
| `vercelSpeedInsights` | `VERCEL_SPEED_INSIGHTS_ENABLED` (+ `VITE_` mirror) | 2 |
| `vercelWebAnalytics` | `VERCEL_WEB_ANALYTICS_ENABLED` (+ `VITE_` mirror) | 2 |
| `vercelAiSdk` | `VERCEL_AI_SDK_ENABLED` | 4 |
| `vercelAiGateway` | `VERCEL_AI_GATEWAY_ENABLED` | 5 |
| `vercelWorkflow` | `VERCEL_WORKFLOW_ENABLED` | 6 |
| `vercelSandbox` | `VERCEL_SANDBOX_ENABLED` | 7 |
| `vercelQueue` | `VERCEL_QUEUE_ENABLED` | 8 |

Each flag also accepts:

- `<FLAG>_INTERNAL=true` — enable for ids listed in `LIFEMARK_INTERNAL_USER_IDS`.
- `<FLAG>_ROLLOUT=0..100` — deterministic percentage, hashed on user id (falling
  back to project id). The **same user always lands in the same bucket**, so a
  build cannot run half on the new adapter and half on the old.

Precedence: explicit `false` > explicit `true` > internal allowlist > rollout >
off. Explicit `false` is the incident lever — it wins even against a 100%
rollout. That ordering is covered by a test; do not "simplify" it.

With no identity to hash (cron jobs, anonymous requests) a percentage rollout
resolves to **off**, not to a coin flip.

## Correlation ids

| Id | Minted where | Lifetime |
| --- | --- | --- |
| `requestId` | first handler that wraps the request | one HTTP request |
| `buildRunId` | `proxyAiToWorker("chat" \| "agent")` | one user-visible build, across generate → verify → repair → deploy |
| `sandboxSessionId` | `sandbox-preview` on a successful boot | one sandbox lifetime |
| `deploymentId` | reserved for Phase 3 | one deploy attempt |

In-process propagation is `AsyncLocalStorage`, pinned to a `globalThis` key for
the same reason `request-als.ts` does it: `lib/ai/http` is esbuild-bundled into
a separate worker process, and a module-level store would produce two instances
that cannot see each other.

Cross-process propagation is headers: `x-lifemark-request-id`,
`x-lifemark-build-run-id`, `x-lifemark-sandbox-session-id`,
`x-lifemark-deployment-id`. Inbound values are sanitised (charset + 128 char
cap) before use — they are attacker-controlled and end up in log lines and, from
Phase 6, in database rows.

`/api/ai/*` responses echo the ids, so a user-reported failure is findable from
their network tab.

Usage:

```ts
import { correlationFields, ensureBuildRunId, setCorrelation } from "@/lib/observability/correlation";

logger.info("ai_generation_completed", { ...correlationFields(), model, durationMs });
```

`fix` deliberately does **not** mint a `buildRunId` — it runs inside an existing
build and inherits that build's id from the incoming header.

## Baseline measurements (record before Phase 1 flips anything)

Seven days of production traffic, or the closest available window. Fill this in
and keep it — every later phase is judged against these numbers, not against a
recollection of them.

| Metric | Source | Baseline | Recorded |
| --- | --- | --- | --- |
| AI call volume | `ai_eval_log` | 163 calls / 7d, 7 distinct models | 2026-08-18 |
| AI time to first token (p50 / p95) | `ai_eval_log` | n/a — not measured pre-Phase 1 (latency_ms is total only) | 2026-08-18 |
| Total generation duration (p50 / p95) | `ai_eval_log.latency_ms` | p50 50.4 s / p95 354 s (avg 98 s, avg 21.5 k tokens/call) | 2026-08-18 |
| AI call error rate | `ai_eval_log.success` | 3.07 % | 2026-08-18 |
| Cost per build | gateway usage ÷ builds | pending — needs one billing cycle joined to build counts | |
| Build commit rate | `generation_runs.status` | 80.4 % committed (46 runs / 30d) | 2026-08-18 |
| First-pass verification rate | `generation_runs.repair_rounds` | 16.2 % of committed runs recorded repair_rounds = 0 (many rows NULL — treat as lower bound) | 2026-08-18 |
| Average repair rounds | same | 0.67 | 2026-08-18 |
| Agent timeout rate | agent route errors | pending — needs Phase 1 events in production | |
| Sandbox cold start / reconnect | sandbox phase timestamps | pending — needs Phase 1 events in production | |
| API error rate by route | server logs | pending — needs Phase 1 events in production | |
| Editor Core Web Vitals | client_telemetry (Phase 2) | pending — flip VITE_VERCEL_SPEED_INSIGHTS_ENABLED to start collecting | |
| Deployment failure rate | Coolify build history | pending — read from Coolify UI at deploy time | |

Snapshot taken 2026-08-18 from the live database, BEFORE any flag was enabled —
these are the pre-Vercel numbers every later phase is judged against. The
"pending" rows are exactly the measurements Phases 1–2 exist to create; fill
them after the first week with `VERCEL_OBSERVABILITY_ENABLED` +
`VITE_VERCEL_SPEED_INSIGHTS_ENABLED` on.

Known gap: `ai_eval_log` has no `request_id` / `build_run_id` column yet, so AI
rows cannot be joined to build rows in SQL — only through log lines. Adding
those two columns is the first migration of Phase 1.

## Rollback matrix

| Flag off restores | Caveat |
| --- | --- |
| `VERCEL_OBSERVABILITY_ENABLED` | Event emission stops. No request-path change. |
| `VERCEL_SPEED_INSIGHTS_ENABLED` | Script unmounted on next page load. |
| `VERCEL_WEB_ANALYTICS_ENABLED` | Script unmounted; no product events. |
| `VERCEL_AI_SDK_ENABLED` | Next request uses the legacy adapter. In-flight generations finish on the adapter they started with — by design, so nothing is billed twice. |
| `VERCEL_AI_GATEWAY_ENABLED` | Upstream reverts to OpenRouter. The Lifemark gateway boundary (auth, attribution, credit deduction) is unchanged either way. |
| `VERCEL_WORKFLOW_ENABLED` | New builds run in-request. **In-flight workflow runs must be drained or explicitly cancelled** — flipping the flag does not kill them. |
| `VERCEL_SANDBOX_ENABLED` | New sessions go to Modal. Existing Vercel sessions keep reconnecting until they expire. |
| `VERCEL_QUEUE_ENABLED` | New jobs go to BullMQ. **Already-enqueued Vercel messages must be drained**, not abandoned. |

The three flags with caveats are the ones that own state. Their rollback is "stop
sending new work", never "assume the old path is instantly authoritative".

## Verifying Phase 0

```bash
node --experimental-strip-types --test src/lib/config/features.test.ts src/lib/observability/correlation.test.ts
```

(`node --import tsx` fails on a Linux host against a Windows checkout — the
installed esbuild binary is win32. `--experimental-strip-types` needs no
transform and works on both.)

Manual check: send one chat build and confirm `[ai-worker] ctx chat
requestId=… buildRunId=…` appears in the worker log with the same
`x-lifemark-build-run-id` the browser saw on the response.

## Acceptance criteria

- [x] Every build has a stable `buildRunId` (minted once at the chat/agent
      entrypoint, reused by verify and repair).
- [x] Logs can be correlated across AI, verification, sandbox and persistence.
- [x] Existing tests and the production build are unchanged — no behaviour is
      gated on a flag yet.
- [x] Baseline metrics recorded from live data where they exist pre-Phase-1 (table above); remaining rows unlock once observability flags are on.
