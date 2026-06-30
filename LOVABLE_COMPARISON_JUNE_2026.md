# LifemarkAI vs Lovable.dev — Feature Comparison (June 2026)

> Based on a full codebase review of LifemarkAI and Lovable's official documentation (docs.lovable.dev). Supersedes the May 2026 `LOVABLE_COMPARISON.md` — WebContainers preview, GitHub two-way sync, and Netlify hosting flagged as gaps there are now implemented.

## TL;DR

LifemarkAI covers ~85% of Lovable's core surface (AI modes, GitHub two-way sync, deploy, custom domains, collab, security scanning, enterprise SSO/SCIM) and beats it in a few areas (multi-model support, native app packaging, transparent token-cost accounting). The biggest remaining gaps: **no managed backend equivalent to Lovable Cloud**, **no working visual edits (WYSIWYG)**, **~50 app connectors on Lovable vs stubs in LifemarkAI**, and **no fractional/sub-1-credit billing**.

---

## 1. Core AI Building Experience

| Feature | LifemarkAI | Lovable |
|---|---|---|
| Chat mode | ✅ Streaming, MCP context injection | ✅ Chat mode (no code writes) |
| Plan mode | ✅ 1 credit | ✅ Plan mode for thinking/debugging |
| Build mode | ✅ Multifile generation, package allowlist | ✅ Default mode |
| Agent mode | ✅ ReAct loop, file tools, max 20 iterations, subagent investigation | ✅ Agent mode with end-to-end verification |
| Auto-fix on build errors | ✅ Recursive fix loop (2–3 iterations) | ✅ "Try to fix" |
| Design previews before build | ❌ | ✅ Pick from 3 design previews (Design guidance) |
| Visual edits (WYSIWYG) | ⚠️ Panel exists, no element picker | ✅ Full visual edits — click element, change style/layout, free |
| Image generation | ✅ DALL-E 3 only (3 credits) | ✅ Built into builder |
| Voice input | ✅ Whisper transcription (60s max) | ⚠️ Not a headline feature |
| File generation / data analysis in chat | ❌ | ✅ Generate files & analyze data |
| Browser testing | ⚠️ Panel stub only | ✅ Clicks buttons, fills forms, tests flows, responsive checks |
| Frontend tests + edge function verification | ❌ | ✅ |

**Models:** LifemarkAI is stronger — 50+ curated OpenRouter models exposed in the editor, with router defaults (`openrouter/pareto-code`, `openrouter/fusion`), smart per-task routing, and auto-fallback on quota/billing errors. Lovable abstracts model choice more tightly.

## 2. Code, Preview, Editing

| Feature | LifemarkAI | Lovable |
|---|---|---|
| Code editor | ✅ Monaco, full edit on all plans | ✅ Code mode — but **paid plans only** |
| Live preview | ✅ WebContainers (in-browser Vite) + HTML fallback | ✅ Preview mode |
| Diff view | ✅ Snapshot compare | ✅ |
| Version history / rollback | ✅ Snapshots + deploy rollback | ✅ Version control + revert |
| npm packages | ✅ Allowlist (Tailwind, Radix, Recharts, Zod, etc.) | ✅ Broader npm support |
| Frameworks | React, Next, Vue, Svelte | React/Vite only |

## 3. Backend — the biggest architectural difference

**Lovable Cloud** is a fully managed backend (Supabase under the hood): auto-generated DB schemas, no-SQL data admin UI, daily backups with ~14-day restore, built-in auth (email/phone/Google managed OAuth or BYOK, SAML SSO for end users of built apps), storage buckets (2 GB files, public-bucket blocking by default), edge functions with logs, built-in AI ("Lovable AI", at-cost LLM pricing), secrets manager with reserved prefixes, usage dashboards, instance sizing (Tiny→Large), region selection (Americas/EU/APAC), DB health checks from chat. Every workspace gets **$25/mo free Cloud + $1 AI balance**.

**LifemarkAI** instead has a *bring-your-own* Supabase wizard (validate credentials, read schema, inject into AI context), a secrets vault, and the AI gateway (Cloudflare Worker billing to `lifemark_cloud_usage` via `debit_ai_balance()`). The gateway matches Lovable's AI wallet concept, but there is no managed DB/auth/storage/edge-function provisioning, no backups/restore, no data admin UI, no instance management.

→ This is the single largest product gap.

## 4. Deployment & Domains

| Feature | LifemarkAI | Lovable |
|---|---|---|
| One-click publish | ✅ `lifemark-{id}.lifemarkai.app` | ✅ `*.lovable.app` |
| External targets | ✅ Netlify (working), Vercel (unclear) | Via GitHub sync (any host) |
| Custom domains | ✅ CNAME + TXT verification, www | ✅ Can also buy domains in-product |
| Branded workspace URLs | ✅ | ✅ |
| Badge removal | ✅ Paid plans | ✅ Paid plans |
| Test/Live environments | ❌ | ✅ (Beta) |
| Published-app analytics | ⚠️ Minimal | ✅ Visitors, pageviews, bounce, sources, devices |
| SEO tooling | ⚠️ Semrush stub | ✅ SEO/AEO review + live Semrush data |

## 5. Integrations

| | LifemarkAI | Lovable |
|---|---|---|
| GitHub | ✅ Two-way sync, branches, PRs, commit history | ✅ Plus GitHub Enterprise Cloud/Server |
| GitLab | ✅ Read/sync | ✅ Including self-managed |
| Stripe payments in built apps | ❌ (Stripe is platform billing only) | ✅ Stripe + Paddle, chat-driven setup |
| App connectors | ⚠️ Panel plumbed, nothing hooked up | ✅ ~50: Slack, Notion, Linear, HubSpot, Airtable, Google Workspace, Microsoft 365, Snowflake, BigQuery, Databricks, Twilio, ElevenLabs, Firecrawl, Shopify, AWS S3, etc. |
| MCP | ⚠️ Context injection only (Linear/Notion/GitHub/PostHog/Sentry read) | ✅ Chat connectors + Lovable MCP server (build apps programmatically) |
| Public API | ❌ | ✅ Lovable API + Build-with-URL (beta) |
| Desktop | ✅ Electron packaging *of generated apps* | ✅ Lovable itself as a desktop app |
| Mobile | ✅ Capacitor packaging of generated apps | ✅ Lovable mobile app (build from phone) |
| ChatGPT / Telegram entry points | ❌ | ✅ @Lovable in ChatGPT, Telegram bot |
| Custom email domains | ✅ Resend, per-workspace | ✅ Auto SPF/DKIM/DMARC setup |

Note the inversion: LifemarkAI packages *generated apps* as native apps (Capacitor/Electron/PWA) — Lovable doesn't. Lovable's desktop/mobile apps are clients for the builder itself.

## 6. Collaboration & Enterprise

| Feature | LifemarkAI | Lovable |
|---|---|---|
| Real-time collab | ✅ Yjs CRDT + Supabase Realtime, presence/cursors | ✅ |
| Roles & permissions | ✅ owner/editor/viewer | ✅ Workspace + project roles |
| Member groups | ✅ | ✅ |
| Per-member credit limits | ✅ | ✅ (Business+) |
| Project comments | ✅ | ✅ On-element comments |
| Cross-project referencing | ⚠️ Design systems linking only | ✅ Code, assets, files, chat history |
| Workspace knowledge / skills | ✅ Both | ✅ Knowledge + Skills |
| SSO (workspace) | ✅ Enterprise | ✅ Business plan (OIDC/SAML) |
| SCIM | ✅ Enterprise | ✅ |
| Audit logs | ✅ | ✅ Enterprise |
| Data training opt-out | ❌ | ✅ Business |
| Project folders / command-palette search | ❌ | ✅ |
| Compliance certs | — | SOC 2 Type II, ISO 27001, GDPR |

## 7. Pricing & Credits

| | LifemarkAI | Lovable |
|---|---|---|
| Free tier | 50 credits/mo, 3 projects, chat only | 5 daily credits (max 30/mo), unlimited members |
| Entry paid | Pro $20/mo → 500 credits | Pro $25/mo → 100 credits (+ up to 150 daily/mo) |
| Scale | Team $60 → 2,000 shared | Pro tiers to 10,000 cr ($2,250/mo); Business 2× price |
| Credit granularity | 1–5 scaling by complexity | **Fractional** — "make the button gray" = 0.5 credits |
| Top-ups | 50/$5 → 5,000/$300 | 50 credits = $15 (Pro) / $30 (Business), max 1,000 |
| Rollover | ❌ | ✅ Unused monthly credits roll over |
| Daily free credits | ❌ | ✅ 5/day on all plans |
| Auto-topup | ✅ | ✅ (Cloud/AI wallet) |

LifemarkAI credits are dramatically cheaper per unit; Lovable monetizes harder but offers fractional billing, rollover, and daily freebies — better perceived fairness.

## 8. Security

Both have secret scanning, RLS analysis, dependency checks, and security dashboards (LifemarkAI: `/api/security/scan` + Security Center; Lovable: project security view + workspace security center). Lovable adds third-party scanning (Wiz CVE scans, Aikido AI pen-tests) and a public trust center with SOC 2 / ISO 27001. LifemarkAI has Upstash rate limiting and MCP API tokens.

## 9. What LifemarkAI has that Lovable doesn't

- Multi-model choice: 50+ curated OpenRouter models, OpenRouter auto-fallback, per-model token cost map in the gateway
- Native app output: Capacitor (iOS/Android), Electron (desktop), PWA scaffolding
- Multiple frameworks (Vue, Svelte, Next) vs Lovable's React/Vite only
- Voice input transcription in the builder
- Much cheaper credits and bulk credit packs
- Self-hostable (gateway optional; direct provider calls in local dev)
- BullMQ deploy queue + Netlify as a first-class deploy target

## 10. Parity work completed (June 11, 2026 session)

| Gap | Status | Where |
|---|---|---|
| Fractional credits + rollover + 5 daily credits | ✅ Done | Migration 063, `lib/ai/credit-cost.ts`, webhook `invoice.paid` rollover, `claimDailyCredits` in AI routes |
| Webhook bug: balance wiped on every `subscription.updated` | ✅ Fixed | Upgrade adds difference; downgrade keeps balance |
| Visual edits in WebContainer (cross-origin) preview | ✅ Done | `lib/preview/veb-bridge.ts` postMessage bridge, `VebBridgePopover`, multi-file matcher `lib/editor/apply-visual-edit.ts` with AI-prompt fallback |
| Real managed-backend provisioning | ✅ Done | `lib/cloud/management.ts` — Supabase Management API (set `SUPABASE_MANAGEMENT_TOKEN` + `SUPABASE_ORG_ID`); migration 064; status route polls + stores keys; falls back to local mode without creds |
| Backup restore | ✅ Done | Restore button in Cloud panel → snapshot restore with schema-change dry-run warning |
| Test/Live environment lock | ✅ Done | Chat + Agent routes return 423 when `environment = 'live'` |
| Connector gateway for built apps | ✅ Done | `/api/projects/[id]/connector-proxy` + 15-connector registry; secrets injected server-side; AI taught via system-prompt block |
| Real in-app payments | ✅ Done | `/api/embed/checkout` (lazy Stripe product/price), `/api/embed/status`, `public/embed/paywall.js`, webhook records `app_subscriptions` |
| Browser testing | ✅ Already real | `/api/projects/[id]/browser-test` runs Playwright (or fetch-engine fallback) |
| Data-training opt-out, project folders, MCP server | ✅ Already real | Verified in audit — earlier gap claims were wrong |

| Instance tiers → real compute | ✅ Done | Tier change applies a Supabase compute add-on via Management API (`setManagedComputeTier`); tiny = default nano |
| Cloud usage billed to wallet | ✅ Done | `/api/cloud/bill-usage` daily cron (vercel.json): records instance cost, consumes the $25/mo free allowance first (`bill_cloud_usage`, migration 065), debits `cloud_balance_cents`, pauses projects when funds run out and resumes after top-up |

Run migrations 063 + 064 + 065 via `supabase db push`. New env vars (optional): `SUPABASE_MANAGEMENT_TOKEN`, `SUPABASE_ORG_ID` for dedicated-backend provisioning; `CRON_SECRET` must be set for the daily-backup and billing crons.

## 10b. Original priority gaps (pre-session)

1. **Managed backend ("Lifemark Cloud")** — auto-provision Supabase projects: DB + auth + storage + edge functions, backups/restore, data admin UI. The gateway + `debit_ai_balance` wallet is already half the billing story.
2. **Visual edits** — element picker + style editing; the panel exists but is empty. Lovable gives this away free, so it's table stakes.
3. **Fractional credit billing + rollover + daily credits** — pricing fairness perception.
4. **App connectors** — wire up the plumbed connectors panel (Stripe-in-app payments first, then Slack/Notion/Google Workspace).
5. **Browser testing** — execution is stubbed; Lovable verifies user flows end-to-end and ties it into Agent mode.
6. **Design previews before build** (pick 1 of 3) — cheap to build, high perceived value.
7. **Published app analytics** — visitors/pageviews/sources/devices.
8. Smaller: Test/Live environments, project folders + command palette, data-training opt-out, public API/MCP server.

---

### Sources

- [Welcome to Lovable](https://docs.lovable.dev/introduction/welcome)
- [Plans and credits](https://docs.lovable.dev/introduction/plans-and-credits)
- [Lovable Cloud](https://docs.lovable.dev/integrations/cloud)
- [Lovable docs index](https://docs.lovable.dev/llms.txt) — agent mode, visual edits, browser testing, design guidance, analytics, environments, and the full integrations catalog
