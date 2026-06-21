# Lovable-Parity Work — Change Summary

Consolidated record of the Lovable.dev parity push. Use as a PR description / review checklist. All changes type-check clean; remaining steps are deployment-side (migrations + env vars).

## Migrations to run (`supabase db push`)
- `063_fractional_credits.sql` — NUMERIC credits, daily-credit grant, rollover RPCs
- `064_cloud_managed_backend.sql` — `cloud_project_ref` / `cloud_supabase_url` / `cloud_anon_key` / `cloud_service_key`
- `065_cloud_usage_billing.sql` — free-allowance tracking + `bill_cloud_usage` RPC

## New env vars (all optional — graceful fallback without them)
| Var | Enables |
|-----|---------|
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini 3 Flash chat tier + Nano Banana 2 image gen |
| `PLAYWRIGHT_ENABLED=true` | Real-browser self-verification (needs `playwright` installed) |
| `CRON_SECRET` | Daily backup + Cloud-billing crons |
| `SUPABASE_MANAGEMENT_TOKEN` + `SUPABASE_ORG_ID` | Dedicated per-app Supabase provisioning |

## Stripe dashboard
- Enable the `invoice.paid` webhook event (drives monthly credit rollover).

---

## What changed, by area

### AI model stack (`lib/ai/model-defaults.ts`, `editor-intelligence.ts`, `provider.ts`, `gateway/src/index.ts`)
- Per-task model tiers (`MODEL_TIERS`): coding → Claude Opus 4.8, planning → GPT-5.2, chat/patch → Gemini 3 Flash, balanced → Sonnet 4.6.
- `resolveSmartModel` routes by mode + prompt length; provider layer degrades OpenRouter → Claude when a key is absent.
- GPT-5 family uses `max_completion_tokens` (would have errored on `max_tokens`).
- Gateway `TOKEN_COST_MAP` updated with real 2026 prices for the new models.

### Native image generation (`app/api/ai/image/route.ts`)
- Nano Banana 2 (`gemini-3.1-flash-image`) primary, DALL-E 3 fallback.

### Credit system (migration 063, `lib/ai/credit-cost.ts`, `lib/credits.ts`, billing webhook)
- Fractional costs (0.5–5, 0.05 steps); 5 free daily credits (30/mo free, 150/mo paid); monthly rollover.
- Every credit-gated AI route claims daily credits before the balance check.
- Webhook bug fixed: `subscription.updated` no longer wipes balance; upgrades add the difference.

### Managed backend / Lifemark Cloud (`lib/cloud/management.ts`, `auto-wire.ts`, `/api/cloud/*`, migrations 064/065)
- Real Supabase project provisioning via Management API; status route polls + stores keys + sets auth redirects.
- Instance tiers map to real compute add-ons; daily usage billed against the Cloud wallet, pause/resume on empty.
- **Backend auto-wiring**: backend-intent builds auto-enable Cloud, inject `VITE_SUPABASE_*`, scaffold `src/lib/supabase.ts`, apply generated migrations. AI gets a "Connected Backend" prompt block.
- Backup Restore button (dry-run schema warning → restore).

### Self-verification loop (`lib/ai/self-verify.ts`)
- After build/agent: renders the app (headless Chromium or static checks), auto-fixes runtime errors (≤2 rounds, 55s), streams `verify_status`. Never fails a build.

### Connector gateway (`/api/projects/[id]/connector-proxy`, `lib/integrations/connector-registry.ts`)
- 15-connector server-side proxy; credentials injected server-side; AI taught to route generated-app calls through it.

### In-app payments (`/api/embed/*`, `public/embed/paywall.js`, webhook)
- Stripe Checkout for monetized apps, paywall embed, `app_subscriptions` lifecycle.

### Visual edits (`lib/preview/veb-bridge.ts`, `lib/editor/apply-visual-edit.ts`, `visual-edit-overlay.tsx`)
- Works in both preview engines (srcdoc + cross-origin WebContainer via postMessage bridge); multi-file matcher with AI-prompt fallback.

### Generation quality (`lib/ai/build-intent.ts`, `system-prompts.ts`)
- 11 app-type blueprints (added booking, marketplace, education, social).
- Admin/ERP design language + shared `src/components/ui/` kit mandate.
- Agent auto-routing for complex edits to existing apps.

### Editor UX + infra
- Test/Live 423 lock in chat + agent routes; fractional-credit display; post-build status line in chat.
- ESLint 9 flat config (`eslint.config.mjs`) — `npm run lint` was broken; fixed + 2 real hook violations resolved.

---

## Verification done
- Full-repo `tsc --noEmit`: 0 source errors (only disposable `.next/dev` cache artifacts, deleted).
- `verify-editor-intelligence.ts`: 15/15 routing assertions pass at runtime.
- Dev server boots clean; API routes respond live.

## Verification still owed (your machine)
- `npm run type-check && npm run lint` from Windows.
- Run migrations + set env vars, then the `DEPLOY_CHECKLIST.md` smoke list.
- Generate one ERP + one booking app; compare output quality to lovable.dev.

> Commit from your machine, not the dev sandbox (its mount can serve stale copies of modified files). Discard any `.next/` changes — that's build cache.
