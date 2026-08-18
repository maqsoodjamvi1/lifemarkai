# Deployment safety — Phase 3 of the Vercel adoption plan

The app deploys through Coolify on the VPS, not through Vercel — so this phase
implements the plan's *pipeline guarantees* (a broken build cannot be promoted,
rollback is minutes, migrations stay forward-compatible) on the stack we
actually run.

## Pipeline

```
push to branch
  → GitHub Actions CI:
      type-check → lint → unit tests → production build
      → boot built server → deploy-safety smoke (scripts/verify-deploy-smoke.mjs)
  → merge to main only when CI is green
  → Coolify builds the image from main (this build is the final type gate)
  → post-deploy: run BOTH smoke suites against the live URL
      node scripts/verify-production-smoke.mjs https://<live-host>   # pages render
      node scripts/verify-deploy-smoke.mjs   https://<live-host>     # protections hold
```

Make the CI job a **required status check** on `main` in GitHub → Settings →
Branches: that is the "broken preview cannot be promoted" guarantee.

## What the safety smoke asserts

Every check asserts a *rejection*, so the suite needs no credentials and is
safe to point at production: project creation / chat / agent / credits /
sandbox boot all demand a session; the Stripe webhook rejects missing **and
wrong** signatures (the check that catches a misconfigured
`STRIPE_WEBHOOK_SECRET`); the telemetry sink answers 204 to garbage; unknown
API paths 404; error bodies never contain env-var names.

## Rollback (minutes, no rebuild)

Coolify keeps previous images. To roll back: Coolify → the app →
Deployments → previous successful deployment → **Redeploy**. No git operation
is needed; fix forward on a branch afterwards. Then re-run both smoke suites
against the live URL to confirm the restored state.

Feature-flagged integrations (Phases 1–9) roll back *without even that*: set
the flag's env var to `false` in Coolify and restart — see the rollback matrix
in `docs/vercel-phase0-baseline.md`.

## Migration policy (forward-compatible with the previous deploy)

Migrations are applied to live Supabase manually / via the Management API —
never implicitly by a frontend deploy. Rules that keep a rollback safe:

1. **Additive first.** New columns are nullable or defaulted; new tables land
   before the code that writes them. Migration 173/174 follow this: the
   previous deploy simply ignores the new columns.
2. **Never drop or rename in the same release** as the code change. Drop only
   after the release that stopped using the object has been live and stable.
3. **Writes tolerate the old schema.** Optional-column inserts (see
   eval-log.ts) are spread conditionally so a missing migration degrades the
   row, not the request.
4. Record the applied range in the deploy notes; the rollback target must not
   require *reversing* a migration.

## Secrets separation

Coolify holds production runtime secrets. CI uses build-time placeholders only
(`sk_test_placeholder`, `whsec_placeholder`, placeholder Supabase URL) — the
safety smoke works entirely on rejections, so no real secret ever enters CI.
Preview/staging environments must use their own Supabase project and Stripe
test keys, never production values.
