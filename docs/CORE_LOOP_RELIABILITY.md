# Core-loop reliability campaign

This campaign proves the workflow that matters before adding more product
breadth: registration/profile → credits → prompt → generated files → verified
preview → deployment → reachable public URL.

## Prerequisites

- A deployed or locally running LifeMarkAI instance.
- A dedicated test user whose registration created a `profiles` row.
- Enough credits for the selected number of attempts.
- A reachable Docker daemon; Docker is the only release-gate preview backend.
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
CORE_LOOP_GENERATION_TIMEOUT_MS=300000

VITE_SUPABASE_URL=https://example.supabase.co
VITE_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...

# The one-flow runner enforces these values. Set DOCKER_HOST only when the
# daemon is not available at /var/run/docker.sock.
SANDBOX_PROVIDER=docker
SANDBOX_PUBLIC_HOST=localhost
# DOCKER_HOST=http://127.0.0.1:2375
```

For a remote runner, replace `localhost` with a host the runner can reach or
configure `SANDBOX_PREVIEW_DOMAIN`. The one-flow command sets
`CORE_LOOP_ACTIVE=1`, forces `SANDBOX_PROVIDER=docker`, and supplies the
core-loop host when `SANDBOX_PUBLIC_HOST` is omitted. It never falls back to
Modal. WebContainer remains an explicit editor-only fallback and is never valid
release-gate evidence.

The runner also accepts the legacy `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_ANON_KEY` names already used by older environments.

The release-proof lane is intentionally narrow:

```dotenv
CORE_LOOP_AI_MODEL=openai/gpt-5.6-luna
CORE_LOOP_FALLBACK_MODEL=deepseek/deepseek-v4-flash
CORE_LOOP_DEPLOY_PROVIDER=netlify
CORE_LOOP_MAX_REPAIR_ROUNDS=2
CORE_LOOP_REQUIRE_REGISTRATION_PROOF=true
```

The one-flow and campaign runners set `CORE_LOOP_AI_MODEL` to
`openai/gpt-5.6-luna` when it is unset. That keeps the gate on the production
coding tier even if the environment has a global
`OPENROUTER_CODING_MODEL=qwen/qwen3-coder` override. Policy resolution still
honors `CORE_LOOP_AI_MODEL` first, then other env overrides; the campaign pin
is intentional so a stalled provider stream cannot hang all 50 attempts.
Each campaign request also sends that model with `modelManuallySelected: true`,
and the chat route honors it for `coreLoop` so a long-lived server process
cannot silently re-select Qwen from process env.
`CORE_LOOP_GENERATION_TIMEOUT_MS` (default 300000) aborts the generation
fetch and turns a silent provider stall into a diagnosable attempt failure
instead of an infinite hang. After
`CORE_LOOP_STOP_AFTER_IDENTICAL_FAILURES` (default 3) consecutive failures
with the same normalized signature, the campaign exits early so one systemic
defect cannot burn the remaining attempts.

These values are embedded in the JSON report. Campaign requests always use
TanStack Build mode and bypass smart routing, Patch mode, clarification, scope
questionnaires, and auxiliary editor workflows. The campaign also rejects any
request outside this contract: project creation, AI chat, sandbox start/status,
sandbox stop, preview verification, deployment start, and deployment status.

Run the behavior-based infrastructure contract first:

```bash
npm run test:infrastructure-contracts
```

Then run the complete local workflow with one command. It starts Vite, waits for
LifeMarkAI to become ready, runs 50 attempts, writes the report, and stops Vite:

```bash
npm run verify:core-loop:one-flow
```

To enforce the required order in one command—one complete smoke run, followed
only on success by exactly 50 attempts—run:

```bash
npm run verify:core-loop:release
```

For diagnosis, the smoke phase remains available by itself:

```bash
npm run verify:core-loop:smoke
```

If LifeMarkAI is already running, the campaign-only command remains available:

```bash
npm run verify:core-loop
```

Set `CORE_LOOP_STARTUP_TIMEOUT_MS` if startup needs more than three minutes.
The smoke command must pass before starting the paid gate. Use
`CORE_LOOP_ATTEMPTS=1` only as a pipeline smoke check. The release command
defaults to exactly 50 attempts; do not count WebContainer previews or partial
runs as evidence. Use 100 for extended release evidence. The default prompt suite is
`tests/core-loop-prompts.json`; override it with `CORE_LOOP_PROMPTS`.

## Where to run it

The gate needs three things at once: a **Docker daemon** (the only supported
release-gate preview backend), the app itself on `CORE_LOOP_BASE_URL`
(`verify:core-loop:release` spawns `vite dev` for you), and the private
Supabase/OpenRouter credentials. A Codespace or your own machine satisfies all
three; environments without a Docker daemon cannot run it at all, however
complete the rest of the configuration looks.

Budget the wall-clock before starting: 50 attempts at up to
`CORE_LOOP_GENERATION_TIMEOUT_MS` (300s) each is several hours in the worst
case. The runner checkpoints `artifacts/core-loop/latest.json` after every
attempt, so an interrupted campaign still carries evidence — but a disconnected
terminal kills the run, so use `tmux`/`screen` on a remote host.

Sequence that avoids paying for a broken harness:

```bash
git pull
npm ci                     # not `npm install`
npm run verify:core-loop:smoke     # 1 attempt, proves the whole path
npm run verify:core-loop:release   # smoke again, then the 50-run gate
```

If `npm ci` leaves Rolldown's Linux binding missing — the runner checks for it
and says so — repair with `npm install --include=optional` rather than
reinstalling from scratch.

`CORE_LOOP_AI_MODEL` defaults to the campaign tier, so a stray
`OPENROUTER_CODING_MODEL` in a Codespace cannot quietly downgrade the gate. Set
it explicitly only to override that tier on purpose.

## When the campaign stops early

After `CORE_LOOP_STOP_AFTER_IDENTICAL_FAILURES` consecutive identical failures
(default 3, floor 2) the campaign exits non-zero and writes `earlyStop` into
the report and `latest.json`. This is the circuit breaker working: one systemic
defect would otherwise consume every remaining attempt and its credits.

Read `earlyStop.signature`. It is `<stage>:<message>`, normalized so volatile
detail (UUIDs, large numbers, container ids, per-attempt sandbox hosts) cannot
disguise one root cause as many. Diagnose that single cause, fix it, and rerun
the full suite. Do not rerun hoping for a better draw, and do not raise the
threshold to push past it.

One failure mode deserves its own reaction. If a campaign burned many attempts
on what is obviously the **same** defect and the breaker never fired, the
signatures were not identical — that is a bug in
`normalizeCoreLoopFailureSignature`, not a reason to lower the threshold. Add
the offending pair of errors to `core-loop-report.test.ts` as a case that must
collapse to one signature, then widen the normalizer until it does.

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
