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

## Configuration

Add these to the shell or a private `.env.local` file:

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

Run:

```bash
npm run verify:core-loop
```

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
- the exact failed stage and error for each unsuccessful attempt.

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
