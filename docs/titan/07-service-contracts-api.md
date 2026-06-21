# 07 — Service Contracts & API Specification

> HTTP + SSE contracts for the Titan subsystems. All routes are Next.js App
> Router route handlers under `app/api/titan/`, authenticated with the existing
> Supabase server client, credit-gated with `claimDailyCredits()` +
> `deduct_credits`, and environment-locked (`423`) on Live where they write code.

## 1. Conventions (inherited from the existing API)

- **Auth**: `createClient()` from `@/lib/supabase/server`; 401 if no session.
- **Credits**: call `claimDailyCredits()` then check balance before AI work;
  debit fractional credits via `computeCreditCost()` (migration 063).
- **Env lock**: code-writing routes return `423 { environment_locked: true }`
  when `projects.environment = 'live'` (migration 046).
- **Streaming**: long routes set `export const maxDuration = 300` and stream SSE
  events `data: {json}\n\n`, ending with a final payload — same shape as
  `app/api/ai/chat` (which already emits `verify_status`, `wiring_status`).
- **Billing attribution**: every `generateAI()` call passes
  `ctx: { projectId, userId, agentRunId }` so the gateway logs `ai_cents`.

## 2. Route map

| Method | Path | Purpose | Writes code? |
|--------|------|---------|--------------|
| POST | `/api/titan/company` | Create/refresh the 10-agent company for a project | no |
| GET  | `/api/titan/company?projectId=` | Get company + agents | no |
| POST | `/api/titan/initiative` | Submit a goal/Spec; **streams** the full run | yes |
| GET  | `/api/titan/initiative/[id]` | Initiative status + task graph + transcript | no |
| GET  | `/api/titan/initiative/[id]/graph` | Live task DAG | no |
| POST | `/api/titan/initiative/[id]/pause` · `/resume` | Control autonomy | no |
| POST | `/api/titan/initiative/[id]/approve-gate` | Approve a db/deploy/spend gate | no |
| POST | `/api/titan/debate/[id]/resolve` | Human override of a debate/CTO ruling | no |
| POST | `/api/titan/cto` | "Act as CTO" review (recommendations) | no |
| POST | `/api/titan/heal/scan` | Run self-heal analyzers → `health_findings` | no |
| POST | `/api/titan/heal/fix/[findingId]` | Generate+apply a fix (approval-gated) | yes |
| POST | `/api/titan/security/scan` | Run security scanners → `security_findings` | no |
| POST | `/api/titan/test/generate` · `/run` | Testing Lab | no/runs |
| POST | `/api/titan/multimodal/compile` | Any modality → normalized Spec (doc 04) | no |
| GET/POST | `/api/titan/marketplace/listings` | Browse / publish | no |
| POST | `/api/titan/marketplace/checkout` | Buy a listing (Stripe) | no |
| POST | `/api/titan/marketplace/install` | Install into a project | no |
| GET  | `/api/titan/observability` | Costs/errors/deploys/revenue rollup | no |

## 3. Key payloads

### POST `/api/titan/initiative` (request)

```jsonc
{
  "projectId": "uuid",
  "goal": "Build Uber",
  "spec": { /* optional pre-compiled Spec from /multimodal/compile */ },
  "autonomy": { "database": "ask", "deploy": "ask", "spend": "budget" },
  "budgetCredits": 200
}
```

### SSE event stream (response)

```jsonc
// discovery + planning
{ "type": "initiative_status", "status": "planning" }
{ "type": "agent_status", "role": "ba", "state": "running", "summary": "Market analysis" }
{ "type": "plan", "epics": [ { "title": "...", "tasks": [ ... ] } ] }

// debate
{ "type": "debate_status", "topic": "DB: SQL vs NoSQL", "round": 1 }
{ "type": "agent_message", "from": "security", "channel": "debate", "content": "..." }
{ "type": "decision", "topic": "...", "decision": "Postgres", "decidedBy": "cto" }

// execution waves
{ "type": "wave_start", "wave": 1, "taskIds": ["t1","t2"] }
{ "type": "task_status", "taskId": "t1", "role": "database", "status": "in_progress" }
{ "type": "file_change", "path": "supabase/migrations/00x.sql" }
{ "type": "task_status", "taskId": "t1", "status": "done" }

// gates + verification
{ "type": "gate", "kind": "deploy", "needsApproval": true }
{ "type": "verify_status", "ok": true }   // reuses self-verify.ts event

// terminal
{ "type": "done", "initiativeId": "uuid", "filesChanged": [ ... ],
  "verification": { ... }, "creditsUsed": 42.5 }
```

### POST `/api/titan/cto` (response)

```jsonc
{
  "recommendations": [
    { "lens": "scalability", "impact": "high", "effort": "med",
      "finding": "...", "action": "...", "adr": "## ADR ..." }
  ],
  "costSummary": { "aiCents": 1234, "instanceCents": 500 }
}
```

### POST `/api/titan/multimodal/compile` (request)

```jsonc
{ "projectId": "uuid",
  "inputs": [ { "kind": "voice|screenshot|figma|pdf|video|url", "ref": "<upload-id|url>" } ] }
// → returns the normalized Spec (doc 04 §7)
```

## 4. Internal service interfaces (TypeScript)

The orchestrator (`lib/ai/titan/orchestrator.ts`) exposes:

```ts
runInitiative(opts: InitiativeOptions): AsyncGenerator<TitanEvent>
ctoReview(projectId: string): Promise<CtoReport>
compileSpec(inputs: ModalInput[]): Promise<Spec>
```

…and depends only on existing primitives: `generateAI` (gateway-aware),
`MODEL_TIERS`/`pickModel`, the `agent.ts` run loop, `self-verify.ts`, and the
Supabase admin client for persistence. See `lib/ai/titan/types.ts` for all types.

## 5. Error model

Standard JSON errors `{ error, code }` with HTTP status: `401` unauthorized,
`402` insufficient credits, `403` permission denied (autonomy gate `never`),
`423` environment locked, `429` rate limited (`RATE_LIMITS.ai`), `500` internal.
