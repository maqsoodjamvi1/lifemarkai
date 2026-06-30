# Deploy Checklist — Lovable-parity release (June 2026)

## 1. Database migrations (in order, via `supabase db push` or SQL editor)

- [ ] `063_fractional_credits.sql` — NUMERIC credits, daily credits, rollover RPCs
- [ ] `064_cloud_managed_backend.sql` — managed-backend columns on `projects`
- [ ] `065_cloud_usage_billing.sql` — free allowance + `bill_cloud_usage` RPC

> 063 converts `profiles.credits` / `credit_logs.amount` to NUMERIC and **drops/recreates** `deduct_credits` + `add_credits`. Run during low traffic; old integer calls keep working (numbers coerce).

## 2. Environment variables

| Var | Required? | Purpose |
|---|---|---|
| `CRON_SECRET` | Yes (prod) | Auths `/api/cloud/daily-backups` + `/api/cloud/bill-usage` crons |
| `SUPABASE_MANAGEMENT_TOKEN` | Optional | Real per-app backend provisioning (Management API) |
| `SUPABASE_ORG_ID` | Optional | Org for provisioned projects |
| `STRIPE_WEBHOOK_SECRET` | Already set | Webhook now also handles `invoice.paid` + app subscriptions |
| `OPENROUTER_API_KEY` | Recommended | Primary AI routing for editor, agent, chat, and model catalog |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Optional | Direct Gemini/image generation fallback |
| `PLAYWRIGHT_ENABLED=true` | Recommended | Real-browser self-verification after builds (`playwright` must be installed) |
| Direct provider keys | Optional | Fallback/self-hosted mode when not routing through OpenRouter |

Without the two Management vars, Cloud falls back to local mode (previous behaviour) — nothing breaks.

## 3. Stripe dashboard

- [ ] Add `invoice.paid` to the webhook's enabled events (rollover refills depend on it).
- [ ] Confirm `customer.subscription.created/updated/deleted` and `checkout.session.completed` are still enabled.

## 4. Crons (vercel.json already registers both)

- [ ] `/api/cloud/daily-backups` — 03:00 UTC
- [ ] `/api/cloud/bill-usage` — 03:30 UTC
- [ ] If not on Vercel: call both nightly with header `x-cron-secret: $CRON_SECRET`.

## 5. Post-deploy smoke tests

- [ ] Send a small chat message → message cost shows fractional (≤1) credits; `credit_logs` has a `daily_credits` entry for a fresh user.
- [ ] Toggle Visual Edits in a WebContainer preview → click an element → popover appears; a class change updates the source file.
- [ ] Enable Cloud on a test project (managed mode) → status flips provisioning → active; keys present on the project row.
- [ ] Cloud panel → backups list shows a Restore button after first nightly run.
- [ ] Monetization panel → enable + set price → open deployed app → paywall appears → test-mode checkout completes → row in `app_subscriptions`.
- [ ] Connector test: save a Slack token in App Connectors, then `POST /api/projects/<id>/connector-proxy` with `{"connector":"slack","path":"/auth.test","method":"POST"}` → Slack responds.
- [ ] Set a project to Live → build prompt returns 423 lock message; chat/plan still work.

## ⚠️ Committing this work

The sandbox's view of **modified** files is stale (sync bug) — do NOT `git add`/`commit` from any tool reading that mount. Commit from your own machine, where the files on disk (D:\Projects\lifemarkai) are correct.
