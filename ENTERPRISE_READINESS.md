# LifemarkAI — Enterprise Readiness Runbook

*Last updated: July 22, 2026. Owner: Maqsood. Companion to `DEEP_COMPARISON_LOVABLE_FINAL_JULY_2026.md` and `docs/SHIP-CHECKLIST.md`.*

## 1. Deploy pipeline

- **Source of truth:** GitHub `master` → Coolify (Hostinger VPS) auto-deploy. Work merged to side branches is INVISIBLE until on master.
- **Gotchas:** dependency changes need a synced `package-lock.json` (`npm ci` in Docker); "build skipped / same SHA" means force-deploy **without cache**; confirm the import log shows the expected commit SHA.
- **Healthcheck:** point Coolify's healthcheck at `GET /api/health` (200 = app + DB round-trip OK, 503 = degraded). Also usable by UptimeRobot/BetterStack.
- **CI gate:** `.github/workflows/ci.yml` runs type-check, unit tests, routing/intelligence/preview verifications, lint on every push/PR to master. Do not merge red.

## 2. Migrations discipline

- Last CONFIRMED applied in prod: **082**. Files exist through **091** — verify 083–090 against the Supabase dashboard (`select * from supabase_migrations.schema_migrations` or project home "last migration") BEFORE assuming, then apply in order. All are written additive/idempotent.
- Apply via SQL editor: beware the "destructive operation" modal — the run isn't executed until the modal's own **Run query** is clicked. Verify with `to_regclass()` reads afterward.

## 3. Environment matrix (prod)

| Var | Purpose | State |
|---|---|---|
| NEXT_PUBLIC_SUPABASE_URL / ANON_KEY | app DB | set |
| SUPABASE_MANAGEMENT_TOKEN + SUPABASE_ORG_ID | Lifemark Cloud provisioning | set |
| LIFEMARK_GATEWAY_URL + SECRET | AI gateway | set |
| MODAL_TOKEN_ID / SECRET | live preview sandboxes | set locally — confirm prod |
| PREVIEW_JWT_SECRET + PREVIEW_REQUIRE_TOKEN=true | signed previews | **pending** |
| PLAYWRIGHT_ENABLED=true (+ playwright installed) | self-verify rendering | **pending** |
| VISION_REVIEW=true (+ VISION_REVIEW_MODEL) | visual QA | optional |
| SERPER_API_KEY or BRAVE_SEARCH_API_KEY | agent web search (keyless DDG fallback otherwise) | optional |
| RESEND_API_KEY | platform + app emails, sign-in alerts | set |
| SENTRY_* | error monitoring | set (verify DSN in prod) |
| TELEGRAM_BOT_TOKEN + webhook secret | platform bot | per TELEGRAM_BOT_SETUP.md |
| STRIPE_SECRET_KEY + WEBHOOK_SECRET | billing (+ packs, domains) | set |
| LIFEMARK_APPS_DOMAIN + wildcard DNS `*.apps.lifemarkai.com` | clean publish URLs | **DNS pending** |

## 4. Security posture

- Headers: CSP, X-Frame-Options SAMEORIGIN, cache rules in `next.config.mjs`.
- Rate limits: 41/46 API route groups behind `RATE_LIMITS` presets — including `/api/mcp` (per-identity) and `/api/auth/device-check` (per-user). New routes MUST adopt a preset.
- AuthN: email+GitHub OAuth, TOTP 2FA (+ login challenge), sign-in alert emails (migration 091), SSO/SAML + SCIM v2 code present (**needs live IdP verification before selling it**).
- Secrets: never in chat/source — secret-paste redaction in composer; app secrets in env panel / Supabase edge secrets; scoped `lmk_` API keys (SHA-256 hashed, per-tool scopes).
- Data: RLS on every user table; audit log immutability (077); daily Cloud backups + restore w/ schema dry-run; scans nightly + publish gate.
- SOC 2: NOT attained. Prep items in order: access reviews (People/roles export), change management (CI + this runbook), vendor list (Supabase/Stripe/Resend/OpenRouter/Modal/Coolify/Upstash/Sentry), incident process (§6), then engage an auditor (Vanta/Drata shortcut).

## 5. Observability

- `/api/health` — LB/uptime probe (DB round-trip).
- Sentry (`@sentry/nextjs`) — confirm prod DSN + source maps upload in Coolify build.
- AI Metrics dashboard (`/dashboard/ai-evals`) — per-request model/latency/tokens/success; watch after deploy for routing-heuristic misfires.
- `health_findings` — the self-healing + learned-rules substrate; review Security Center weekly.

## 6. Incident basics

1. `GET /api/health` → 503 = app/DB issue; Coolify logs → container; Supabase status page → DB.
2. Bad deploy: Coolify → previous deployment → redeploy (or revert commit on master). DB migrations are additive — rollback of code is safe without schema rollback.
3. AI provider outage: model routing degrades across providers automatically (provider fallback + budget guard); if OpenRouter account depleted, balance guard already blocks negative spend — top up.
4. Runaway costs: check AI Metrics + `lifemark_cloud_usage`; pause offending project's Cloud from its panel; rate limits cap per-user abuse.
5. Communicate: status note on landing page; postmortem in `docs/` within 48h (blameless, root-cause, action items).

## 7. Definition of "enterprise-ready" — remaining checklist

- [ ] Batch deployed to master + Coolify (everything above assumes this)
- [ ] Migrations 083–091 verified applied
- [ ] `/api/health` wired into Coolify healthcheck + external uptime monitor
- [ ] Sentry receiving prod events (throw a test error)
- [ ] SSO + SCIM exercised against a real IdP (Okta dev tenant is free)
- [ ] Wildcard DNS + PREVIEW_JWT env
- [ ] proxy_read_timeout ≥300s (long builds)
- [ ] SOC 2 program started (§4)
- [ ] Load sanity: VPS is 2vCPU/8GB — plan upgrade or horizontal move before real enterprise traffic
