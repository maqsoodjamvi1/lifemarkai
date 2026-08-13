# Core-loop reliability campaign

This campaign proves the workflow that matters before adding more product
breadth: registration/profile → credits → prompt → generated files → verified
preview → deployment → reachable public URL.

## Prerequisites

- A deployed or locally running LifeMarkAI instance.
- A dedicated test user whose registration created a `profiles` row.
- Enough credits for the selected number of attempts.
- One configured deployment provider (`netlify` is the default).
- `SUPABASE_SERVICE_ROLE_KEY` if AI and compute cost telemetry is required.

Never use a real customer's account. Campaigns create real projects, consume AI
credits, start sandboxes, and publish real URLs.

When the service-role key is configured, the runner also creates a unique
plus-addressed Supabase user, waits for the profile trigger to grant credits,
records the result, and deletes that probe user immediately. Full 50+ attempt
campaigns require this registration proof.

## Configuration

Create the private configuration from the committed placeholder template, then replace every placeholder:

```bash
cp .env.core-loop.example .env.local
```

Never commit `.env.local` or paste its secret values into chat. Add these to the shell or that private file:

```dotenv
CORE_LOOP_BASE_URL=http://localhost:3001
CORE_LOOP_EMAIL=reliability-test@example.com
CORE_LOOP_PASSWORD=use-a-dedicated-secret
CORE_LOOP_ATTEMPTS=50
CORE_LOOP_DEPLOY_PROVIDER=netlify
CORE_LOOP_DEPLOY_TIMEOUT_MS=180000

VITE_SUPABASE_URL=https://example.supabase.co
VITE_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

The runner also accepts the legacy `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` names already used by older environments.

The release-proof lane is intentionally narrow:

```dotenv
CORE_LOOP_AI_MODEL=qwen/qwen3-coder
CORE_LOOP_FALLBACK_MODEL=deepseek/deepseek-v4-flash
CORE_LOOP_DEPLOY_PROVIDER=netlify
CORE_LOOP_MAX_REPAIR_ROUNDS=2
CORE_LOOP_REQUIRE_REGISTRATION_PROOF=true
```

These values are embedded in the JSON report. Campaign requests always use
TanStack Build mode and bypass smart routing, Patch mode, clarification, scope
questionnaires, and auxiliary editor workflows.

Run the complete local workflow with one command. It starts Vite, waits for
LifeMarkAI to become ready, runs 50 attempts, writes the report, and stops Vite:

```bash
npm run verify:core-loop:one-flow
```

First use the one-attempt smoke command:

```bash
npm run verify:core-loop:smoke
```

If LifeMarkAI is already running, the campaign-only command remains available:

```bash
npm run verify:core-loop
```

Set `CORE_LOOP_STARTUP_TIMEOUT_MS` if startup needs more than three minutes.
Use `CORE_LOOP_ATTEMPTS=1` only as a pipeline smoke check. Use 50 for a
stabilization campaign and 100 for release evidence. The default prompt suite is
`tests/core-loop-prompts.json`; override it with `CORE_LOOP_PROMPTS`.

## Output

The runner checkpoints after every attempt to
`artifacts/core-loop/latest.json`, so an interrupted campaign retains evidence.
A timestamped final report contains every attempt and these aggregates:

- generation, preview, deployment, and public-URL success rates;
- average generation time and credits;
- automatic-repair success rate;
- average AI and sandbox/compute cost;
- manual-intervention rate;
- the exact failed stage and error for each unsuccessful attempt;
- fresh-registration and initial-credit proof;
- an explicit release-gate decision with failure reasons.

Reports are intentionally ignored by Git because they may contain project IDs,
URLs, prompts, and operational cost data. Attach the sanitized report to the
release record or reliability issue instead.

## Interpreting costs

AI cost comes from `lifemark_cloud_usage.ai_cents`. Sandbox cost uses the same
ledger's `compute_cents`. When the service-role key or gateway billing telemetry
is unavailable, the values are `null` and `costTelemetryComplete` is false.
Missing observations are not silently converted to zero.

## Release decision

Do not hide failed attempts or rerun only favorable prompts. Classify each first
failure, add a deterministic regression test, fix it, and rerun the full suite.
The public release gate should be chosen explicitly; a strong initial target is
at least 95% generation/preview/deployment success, below 5% manual intervention,
and complete cost telemetry, followed by a path to 99%.
