# 07 — Service Contracts & API Specification

> HTTP + SSE contracts for the editor intelligence subsystems. All routes are Next.js App
> Router route handlers under `app/api/editor-intelligence/`, authenticated with the existing
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
| POST | `/api/projects/[id]/editor-intelligence` | Create/refresh the internal lens roster for a project | no |
| GET  | `/api/projects/[id]/editor-intelligence?projectId=` | Get intelligence lenses | no |
| POST | `/api/editor-intelligence/initiative` | Submit a goal/Spec; **streams** the full run | yes |
| GET  | `/api/editor-intelligence/initiative/[id]` | Initiative status + task graph + transcript | no |
| GET  | `/api/editor-intelligence/initiative/[id]/graph` | Live task DAG | no |
| POST | `/api/editor-intelligence/initiative/[id]/pause` · `/resume` | Control autonomy | no |
| POST | `/api/editor-intelligence/initiative/[id]/approve-gate` | Approve a db/deploy/spend gate | no |
| POST | `/api/editor-intelligence/debate/[id]/resolve` | Human override of a debate/CTO ruling | no |
| POST | `/api/editor-intelligence/review` | "Act as CTO" review (recommendations) | no |
| POST | `/api/editor-intelligence/heal/scan` | Run self-heal analyzers → `health_findings` | no |
| POST | `/api/editor-intelligence/heal/fix/[findingId]` | Generate+apply a fix (approval-gated) | yes |
| POST | `/api/editor-intelligence/security/scan` | Run security scanners → `security_findings` | no |
| POST | `/api/editor-intelligence/test/generate` · `/run` | Testing Lab | no/runs |
| POST | `/api/editor-intelligence/multimodal/compile` | Any modality → normalized Spec (doc 04) | no |
| GET/POST | `/api/editor-intelligence/marketplace/listings` | Browse / publish | no |
| POST | `/api/editor-intelligence/marketplace/checkout` | Buy a listing (Stripe) | no |
| POST | `/api/editor-intelligence/marketplace/install` | Install into a project | no |
| GET  | `/api/editor-intelligence/observability` | Costs/errors/deploys/revenue rollup | no |

## 3. Key payloads

### POST `/api/editor-intelligence/initiative` (request)

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

### POST `/api/editor-intelligence/review` (response)

```jsonc
{
  "recommendations": [
    { "lens": "scalability", "impact": "high", "effort": "med",
      "finding": "...", "action": "...", "adr": "## ADR ..." }
  ],
  "costSummary": { "aiCents": 1234, "instanceCents": 500 }
}
```

### POST `/api/editor-intelligence/multimodal/compile` (request)

```jsonc
{ "projectId": "uuid",
  "inputs": [ { "kind": "voice|screenshot|figma|pdf|video|url", "ref": "<upload-id|url>" } ] }
// → returns the normalized Spec (doc 04 §7)
```

## 4. Internal service interfaces (TypeScript)

The orchestrator (`lib/ai/editor-lenses/orchestrator.ts`) exposes:

```ts
runInitiative(opts: InitiativeOptions): AsyncGenerator<Editor IntelligenceEvent>
ctoReview(projectId: string): Promise<CtoReport>
compileSpec(inputs: ModalInput[]): Promise<Spec>
```

…and depends only on existing primitives: `generateAI` (gateway-aware),
`MODEL_TIERS`/`pickModel`, the `agent.ts` run loop, `self-verify.ts`, and the
Supabase admin client for persistence. See `lib/ai/editor-lenses/types.ts` for all types.

## 5. Error model

Standard JSON errors `{ error, code }` with HTTP status: `401` unauthorized,
`402` insufficient credits, `403` permission denied (autonomy gate `never`),
`423` environment locked, `429` rate limited (`RATE_LIMITS.ai`), `500` internal.
