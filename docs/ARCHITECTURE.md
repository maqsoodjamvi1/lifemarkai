# LifeMarkAI Architecture

This is the canonical architecture document. Historical Lovable comparisons,
migration notes, and one-off repair reports are not production architecture.

## Product boundary

LifeMarkAI is an independently built AI application platform. It uses its own
name, interface, prompts, source code, and product language. Similarities to
other app builders are limited to general capabilities and interoperability.

## Core product loop

The production milestone is one reliable transaction:

1. Supabase Auth creates a user and the profile trigger grants credits.
2. The dashboard creates a project.
3. `/api/ai/chat` generates files through the isolated AI worker/provider layer.
4. Candidate files are staged, verified, automatically repaired when possible,
   and atomically committed.
5. Preview renders the committed project in an isolated runtime or fallback.
6. `/api/deploy` publishes through the configured primary provider and records a
   deployment only after the provider reports it live.
7. A public HTTP request proves the deployed URL is reachable.

`npm run verify:core-loop` exercises and measures this complete loop.

### Deterministic release-proof lane

Reliability campaigns set `coreLoop: true`. That lane cannot be auto-routed to
Chat, Plan, Patch, clarification, scope questionnaires, or smart model tiers. It
uses the canonical policy in `src/lib/reliability/core-loop-policy.ts`: TanStack
Build mode, one primary model with one safe fallback, server-verified preview,
and one deployment provider. Reports embed the policy used for reproducibility.
Normal editor sessions retain every advanced mode and provider.

## Runtime boundaries

- `src/routes`: TanStack pages and HTTP APIs.
- `src/lib/ai`: model routing, generation, verification, repair, and accounting.
- `src/lib/preview`: preview normalization, isolation, diagnostics, and fallback.
- `src/lib/deploy`: production build and publishing contracts.
- `supabase`: authentication, data, RLS, credits, revisions, and telemetry.
- `scripts/ai-http-worker.mjs`: optional process isolation for long AI streams.
- `gateway`: optional Cloudflare gateway for provider secrets, usage, and routing.

The AI worker stays separate because a failed or memory-heavy generation must
not take down the web process. Local development may run providers directly.

## Product phases

### Phase 1 — reliability gate

Auth, dashboard, project creation, Chat/Plan/Build, React/TanStack generation,
file editing, isolated preview, automatic repair, Supabase, GitHub, one primary
deployment provider, credits, and Stripe.

### Phase 2 — growth

Templates, custom domains, collaboration, image generation, Figma, analytics,
email, and additional deployment providers remain secondary until the core-loop
campaign reaches its release threshold.

### Phase 3 — enterprise

SSO, SCIM, audit logs, white-labeling, enterprise security, and device packaging
must not block or complicate the core-loop release gate.

## Reliability release gate

Run 50 attempts during development and 100 before a public release. Review:

- generation, preview, deployment, and public URL success rates;
- average generation duration;
- automatic repair success;
- AI and sandbox cost per project;
- manual-intervention rate and failure-stage distribution.

Missing cost telemetry is reported as `null`; it is never treated as zero. A
campaign is not release evidence until cost telemetry is complete and failures
have reproducible issue records.
