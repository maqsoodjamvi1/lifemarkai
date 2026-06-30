# 08 — Phased Roadmap

> How to build Editor Intelligence on top of LifemarkAI without a rewrite. Each phase is
> shippable on its own and de-risks the next. Effort is relative (T-shirt), not a
> calendar commitment.

## Phase 0 — Foundation (shipped in this change set)

Already in the repo:

- Design source of truth: `docs/editor-intelligence/00–07`.
- Database: `supabase/migrations/068_editor_intelligence_lenses.sql` (5 internal lens/run tables + RLS + indexes).
- Orchestrator core: `lib/ai/editor-lenses/{types,roles,orchestrator}.ts` — 10 roles, the
  debate protocol, wave scheduler, CTO review — wired to existing `generateAI` +
  `MODEL_TIERS`.

Shipped runtime wiring:

- `app/api/editor-intelligence/initiative/route.ts` streams `runInitiative()`, persists durable events/checkpoints, and resumes interrupted runs by `runId`.
- `app/api/editor-intelligence/initiative/[id]` returns durable run status plus replayable event history.
- `app/api/editor-intelligence/review/route.ts` wraps `ctoReview()`.
Remaining to make P0 fully typed (small):

- Add the `project_ai_*` tables to `types/database.ts`.

## Phase 1 — Editor Intelligence MVP  (M)

- Editor Intelligence Console UI (editor tab): live agent statuses, plan tree, debate threads
  (Realtime over `agent_messages`).
- Wire the QA step to the existing `lib/ai/self-verify.ts` loop.
- Autonomy gates (`database`/`deploy`/`spend`) reusing the `cloud_tool_permissions`
  JSON pattern; enforce `423` live-env lock on every Editor Intelligence code-writing path.
- Multimodal P1: voice (`/api/ai/transcribe`), screenshot
  (`SCREENSHOT_TO_CODE_SYSTEM_PROMPT`), PDF (`pdf` skill) → Spec → build.

## Phase 2 — Autonomy + Quality + Platform basics  (L)

- Parallel task waves + resumability across the 300s `maxDuration` boundary
  (re-enter from first non-`done` wave, like `job_queue`).
- Self-Healing scheduled scans → `health_findings`; Security Center deps+code scans
  → `security_findings`; approval-gated auto-fix.
- Testing Lab: unit/integration/E2E generation + sandbox runs.
- Multimodal P2: Figma import + URL reverse-engineering (clean-room).
- Marketplace + AI App Store (catalog, Stripe Connect commissions, install).
- Sandbox (E2B first) + server-code live preview; BYOM key vault via the gateway.
- Observability Center as an auto-refreshing live artifact.

## Phase 3 — Enterprise + Scale  (XL)

- White-label tenancy (`organizations`, custom domains, per-org branding/models).
- AI Cloud Architect: multi-cloud IaC (Terraform/Helm/K8s) executed against
  user-connected cloud creds.
- Model Training Center: dataset upload + fine-tune jobs (`training_jobs`),
  fine-tuned models registered into the gateway.
- Video → app; mobile-screenshot reverse engineering.
- Global scale-out: read replicas, autoscaled Firecracker sandbox pool,
  multi-region, edge CDN — validated by the Testing Lab's load tests.

## Dependency graph (build order)

```mermaid
flowchart LR
  P0["P0 Foundation\n(schema + orchestrator)"] --> P1["P1 Intelligence MVP\n(console + gates + multimodal P1)"]
  P1 --> P2A["P2 Autonomy\n(waves + resumability)"]
  P1 --> P2B["P2 Quality\n(self-heal + security + testing)"]
  P1 --> P2C["P2 Platform\n(marketplace + sandbox + BYOM)"]
  P2A --> P3["P3 Enterprise + Scale"]
  P2B --> P3
  P2C --> P3
```

## What stays unchanged (leverage, don't rebuild)

Credits/billing (migrations 063–065), the AI gateway + usage logging, the
self-verify loop, the connector gateway, managed-backend provisioning, the
preview engines, Stripe/Resend/GitHub integrations, and the Supabase
client/RLS discipline. Editor intelligence is **internal**.

## Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Multi-agent cost/latency blow-up | bounded debates, risk-gated debate convening, parallel-wave caps, per-initiative credit budget |
| Runaway autonomous loops | `MAX_WAVES`, per-task `maxIterations`, idempotent tasks |
| Live-data damage | `423` env lock on all code-writing paths; approval gates for db/deploy |
| Reverse-engineering IP concerns | clean-room provenance; behavior-only reconstruction; no source/asset copying |
| Scope (100M users) | treated as target architecture, sequenced last, gated on load testing |
