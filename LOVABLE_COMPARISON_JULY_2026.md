# LifemarkAI vs Lovable.dev — Deep Comparison (July 2, 2026)

> Full codebase review of LifemarkAI + fresh read of docs.lovable.dev (fetched July 2, 2026).
> Supersedes `LOVABLE_COMPARISON_JUNE_2026.md`. Both sides moved since June: LifemarkAI shipped
> Lifemark Cloud provisioning/billing, fractional credits, connector gateway, self-verification,
> and the Editor Intelligence lens system; Lovable renamed its modes (Chat→Plan, Agent→Build),
> switched new projects to **TanStack Start + SSR**, unified all billing into one credit balance,
> shipped built-in Payments (Paddle/Stripe MoR), subagents, prompt queue, browser perf tools,
> a desktop app — and **killed Test/Live environments and public remixing**.

## TL;DR

LifemarkAI now covers **~80–85%** of Lovable's surface and *exceeds* it in a few places
(multi-model choice, multi-framework output, native app packaging, self-hostability, Test/Live
environments — which Lovable withdrew in March 2026). The biggest remaining gaps are in the
**agent workflow layer** (prompt queue, task visibility, subagents, cross-project referencing,
code execution in chat), the **preview toolbar** interaction tiers (draw annotations, free inline
text edits, pinned comments), **generated-app stack modernity** (Lovable is SSR-first now),
**connector breadth** (15 vs ~40 app connectors + MCP chat connectors), and **billing UX**
(Lovable's single unified credit balance vs LifemarkAI's credits + separate cloud wallet).

---

## 1. Modes & the core building loop

Lovable renamed Chat mode → **Plan mode** (1 credit flat, never writes code, produces an
editable plan saved to `.lovable/plan.md`) and Agent mode → **Build mode** (default,
usage-based pricing, up to 15 min per request).

| Feature | LifemarkAI | Lovable (July 2026) |
|---|---|---|
| Chat/conversational mode | ✅ `/api/ai/chat`, streaming SSE, BM25 file-context ranking | ✅ Folded into Plan mode |
| Plan mode | ✅ `plan-panel.tsx`, 1 credit | ✅ 1 credit flat, plan persisted to repo, approve→Build handoff |
| Build | ✅ 2 credits flat (fractional 0.5–5 via `computeCreditCost()`) | ✅ Usage-based per message (0.5–2.0 typical) |
| Agent loop | ✅ ReAct loop (`lib/ai/agent.ts`), file tools, max iterations | ✅ Build mode: explores code, reads logs/console/network, fetches docs |
| Self-verification | ✅ `lib/ai/self-verify.ts` — headless Chromium render, pageerror/console capture, 2 auto-fix rounds, 55s budget | ✅ Browser testing: navigates, clicks, fills forms, screenshots, multi-viewport |
| Task visibility | ⚠️ Stream events (`verify_status`, `wiring_status`) but no structured task UI | ✅ Tasks panel showing each step/files/tools |
| Prompt queue | ❌ | ✅ Queue/pause/reorder/edit, repeat up to 50× |
| Subagents | ⚠️ Different shape: Editor Intelligence lenses (10 roles + AI CTO, debate protocol, wave scheduler — wired into chat/agent/plan/fix routes) | ✅ Read-only parallel investigators (generic + Explore) |
| Cross-project referencing | ❌ | ✅ `@other-project` read-only code/assets/history reuse |
| Chat history search | ❌ | ✅ Keyword + semantic search of project conversation |
| Code execution / file gen in chat | ❌ | ✅ Analyze uploads, run code, emit PDF/XLSX/PPTX |
| "Try to fix" | ✅ `/api/ai/fix` recursive fix loop | ✅ Free, no credits |
| Design previews before build | ❌ | ✅ Pick 1 of 3 design directions |
| Voice input | ✅ Whisper transcription | ✅ Voice mode (Oct 2025) |
| Image generation | ✅ DALL-E 3 panel | ✅ In-agent image + video generation |
| Knowledge files | ✅ Project + workspace knowledge | ✅ Project + workspace (10k chars each) + reads `AGENTS.md`/`CLAUDE.md` |
| Skills | ✅ | ✅ Workspace skills/playbooks |

**Models:** LifemarkAI is structurally stronger — OpenRouter-first per-task tiers (Pareto Code
router for coding, Fusion for planning/reasoning, DeepSeek V4 Flash fast tier), env overrides,
invalid-slug safety net, cascading provider fallback, Anthropic prompt caching. Lovable hides
model choice (Opus 4.7-class in the agent as of Apr 2026) — users can't pick.

**Testing depth:** Lovable goes further than LifemarkAI's Playwright smoke pass — Vitest +
React Testing Library frontend tests, Deno edge-function tests, authenticated edge calls, and
browser performance profiling (Core Web Vitals, CPU, memory). LifemarkAI has
`/api/projects/[id]/browser-test` (Playwright or fetch fallback) + self-verify only.

## 2. Generated apps: stack & preview

| | LifemarkAI | Lovable |
|---|---|---|
| Default stack | React (also Next, Vue, Svelte) | **TanStack Start + SSR** (new projects since May 13, 2026); older = Vite+React with prerendering |
| Preview engine | srcdoc fallback (Babel + Tailwind CDN, ~60 package stubs) — default; WebContainer engine (`@webcontainer/api` ^1.3.0) + optional real Vite build | Hosted preview, full toolchain |
| Visual edits | ✅ `VisualEditOverlay` (srcdoc) + `veb-bridge.ts` postMessage bridge (WebContainer), persisted via `apply-visual-edit.ts` multi-file matcher w/ AI fallback | ✅ **Preview toolbar**: select elements (→prompt), inline text edit (free ≤100/day), **draw annotations**, pinned comments (@Lovable) |
| Code editor | ✅ Monaco, all plans | ✅ Code mode — direct edit **paid only**; ZIP download paid |
| Version history | ✅ Snapshots + restore + deploy rollback | ✅ Per-edit versioning, revert, edit-past-message branching, bookmarks |
| npm packages | ⚠️ Allowlist in srcdoc engine | ✅ Broad (real toolchain) |

The srcdoc-first preview remains LifemarkAI's most visible architectural compromise: fast and
free, but package-stubbed. Lovable's SSR move also means its generated apps ship with better
SEO out of the box.

## 3. Managed backend: Lifemark Cloud vs Lovable Cloud

This gap — "the single largest" in the June doc — has substantially closed.

| | Lifemark Cloud | Lovable Cloud |
|---|---|---|
| Provisioning | ✅ Real dedicated Supabase project per app via Management API (`lib/cloud/management.ts`, migration 064); local-mode fallback without creds | ✅ Managed Supabase-style backend, enabled by default |
| Auto-wiring | ✅ `lib/cloud/auto-wire.ts`: detects backend need, injects env, scaffolds client, applies AI-generated migrations (permission-gated) | ✅ Schema generation from plain language |
| Auth | ✅ Managed auth redirects configured on health (`configureManagedAuthRedirects`) | ✅ Email/phone/Google (managed OAuth or BYOK)/Apple + **SAML SSO for end users** + HIBP leak check |
| Data admin UI | ⚠️ Cloud panel (basic) | ✅ No-SQL data grid, health checks, slow-query finder + auto-indexing |
| Backups | ✅ Daily cron + restore w/ schema dry-run warning | ✅ Daily, ~14-day retention, self-serve restore |
| Storage / Edge functions / Jobs | ⚠️ Partial (via Supabase project itself) | ✅ First-class tabs incl. cron Jobs, private-by-default buckets |
| Secrets | ✅ Env panel + gateway `/inject-secret` | ✅ Encrypted, auto-detected, reserved prefixes |
| Instance tiers | ✅ Real compute add-ons (`setManagedComputeTier`) | ✅ Tiny→Large + resource alerts |
| Billing | ✅ `/api/cloud/bill-usage` daily cron → `bill_cloud_usage` RPC; $25/mo free allowance, pause/resume on wallet empty | ✅ Metered "Run credits" from the **unified balance**; 20 credits/mo Cloud grant; pause at zero |
| Tool permissions | ✅ `cloud_tool_permissions` (allow/ask/never) | ✅ Per-tool Always/Ask/Never (auto-approve default since Mar 2026) |
| Regions | ❌ | ✅ Americas/EU/APAC at enable time |
| Custom app emails | ✅ Resend per-workspace | ✅ Own-domain auth + transactional emails, managed DNS/SPF/DKIM/DMARC |

Remaining Cloud deltas: region selection, richer data-admin UI (grid, slow-query/auto-index),
first-class Jobs/Storage tabs, and end-user SAML SSO.

## 4. AI inside generated apps

| | LifemarkAI Gateway | Lovable AI |
|---|---|---|
| Architecture | ✅ Cloudflare Worker at `ai.gateway.lifemarkai.app`; routes OpenAI/Anthropic/Google/OpenRouter by prefix; `LIFEMARK_API_KEY` injected into Cloud project secrets | ✅ Edge-function gateway; per-project `LOVABLE_API_KEY` (rotatable) |
| Billing | ✅ `TOKEN_COST_MAP` → `ai_cents` → `debit_ai_balance()` fire-and-forget | ✅ Usage-based credits from unified balance; 4 credits/mo AI grant; 402 when empty |
| Catalog | Whatever the gateway routes (broad) | Curated: Gemini 3.x/GPT-5.5 chat, GPT Image 2/Nano Banana image, embeddings, TTS, STT |
| Observability | ⚠️ Usage rows only | ✅ Per-request dashboard (status/model/tokens/cost/duration), 90-day request retention, agent reads it to debug |

Parity is close on plumbing; Lovable wins on the **AI activity dashboard** and the agent's
ability to read it when debugging the app's AI features.

## 5. Deployment, domains, publishing

| | LifemarkAI | Lovable |
|---|---|---|
| One-click publish | ✅ Branded fallback URL; Netlify + Vercel targets (verified in `app/api/deploy/route.ts`, env-token gated) | ✅ `*.lovable.app` snapshot publish; publish-from-chat ("ship it") with security checks |
| Custom domains | ✅ CNAME + TXT verification | ✅ Plus **in-app domain purchase** (auto DNS/SSL), transfers, CDN CNAME mode |
| Test/Live environments | ✅ Migration 046, 423 lock on Live — **now a differentiator** | ❌ **Pulled for new projects Mar 24, 2026** |
| Internal/workspace-only publishing | ⚠️ | ✅ Business+: people/group scoping, branded workspace URLs |
| Published-app analytics | ⚠️ Minimal | ✅ Visitors/pageviews/bounce/sources/devices |
| SEO tooling | ⚠️ Semrush stub | ✅ SEO/AEO review, llms.txt, Search Console + sitemap, Semrush live data |

## 6. Payments in built apps

LifemarkAI: `/api/embed/checkout` (lazy Stripe product/price from `app_monetization`),
`paywall.js` overlay, webhook → `app_subscriptions`. Real and working, but user brings the
Stripe account.

Lovable (Apr 24, 2026): **built-in Payments** — creates the provider account for you, Paddle
as merchant of record (5% + 50¢) or Stripe (optional Managed Payments MoR), auto products/
prices/webhooks, revenue analytics tab, go-live KYC checklist, customer portal. Requires Pro+
and Lovable Cloud. This is now a full tier above LifemarkAI's paywall.

## 7. Integrations & connectors

| | LifemarkAI | Lovable |
|---|---|---|
| GitHub | ✅ Two-way sync verified (`createTree/createCommit/updateRef` push, `pullFiles`, PR create in `lib/github/client.ts`) | ✅ Two-way, workspace GitHub App, branch switching, GH Enterprise Cloud/Server |
| GitLab | ✅ `lib/gitlab/client.ts` + sync route | ✅ Incl. self-managed (Apr 2026) |
| App connectors | ⚠️ **15** in `connector-registry.ts` (server-side auth injection via connector-proxy — solid architecture) | ✅ **~40** (Google Workspace, M365, Snowflake, Databricks, BigQuery, Salesforce, HubSpot, Shopify full-store, Twilio, ElevenLabs, Wiz, Aikido…) |
| MCP | ⚠️ Context injection only | ✅ Chat connectors (Atlassian, Notion, Linear, PostHog, Sentry…) + **custom MCP servers on all paid plans** + Lovable MCP server (external agents build apps) |
| Public API | ❌ | ✅ Lovable API "Build with URL" (open beta) |
| Builder clients | Web only | ✅ Desktop app (macOS, local MCP), mobile app, @Lovable in ChatGPT, Telegram bot |
| Figma | ❌ | ❌ (removed Nov 2025; local MCP via desktop app only) |
| Native output of *generated* apps | ✅ Capacitor/Electron/PWA packaging | ❌ (web only; suggests PWA/Capacitor DIY) |

## 8. Collaboration & enterprise

Broad parity: both have realtime collab (LifemarkAI: Yjs CRDT + Supabase Realtime), roles,
groups, per-member credit limits, comments, knowledge/skills, SSO/SCIM, audit logs. Lovable
adds: unlimited free workspace members, invite links w/ expiry, access requests, project
transfer, folders w/ visibility inheritance, design templates (Business+), profiles/community
feed — and **removed public remixing** (owner must opt in; Supabase/payments projects can't be
remixed at all). Lovable holds SOC 2 Type II + ISO 27001; LifemarkAI has no certs.

## 9. Credits & pricing — biggest philosophical divergence

| | LifemarkAI | Lovable |
|---|---|---|
| Balance model | Credits (NUMERIC 12,2) **plus** separate `cloud_balance_cents` wallet | **One unified credit balance** for Build + Cloud + AI (2026 rollout) |
| Message pricing | Fractional 0.5–5 in 0.05 steps (`computeCreditCost()`) | Plan = 1 flat; Build usage-based (0.50 "gray button" → 2.00 landing page) |
| Daily free credits | ✅ 5/day, capped 30/mo free / 150/mo paid (lazy grant RPC) | ✅ 5/day; 30/mo cap on Free; **paid cap dropped** per newer docs |
| Rollover | ✅ `apply_plan_renewal`: LEAST(current, plan) + plan | ✅ Roll over while subscribed; expire 2 mo after issue (monthly) |
| Entry price | Pro $20/mo → 500 credits | Pro $25/mo → 100 credits (tiers to 10k/$2,250); Business exactly 2× |
| Top-ups | ✅ Cheap packs | Pro $15/50, Business $30/50; auto top-up w/ threshold + spend limit; 12-mo validity |
| Free-action goodwill | ⚠️ Little explicitly free | ✅ Free: Try-to-fix, security scans/fixes, inline text edits (100/day), image gen in visual edits |

LifemarkAI is far cheaper per credit. Lovable monetizes harder but wins on *perceived
fairness*: one balance, visible per-message cost, and an explicit list of free actions. Note:
LifemarkAI's daily-credit design (150/mo paid cap) was modeled on Lovable's older docs — Lovable
has since dropped the paid cap.

## 10. Security

Both: RLS analysis, dependency checks, secret handling, security dashboards. Lovable adds free
auto-fix scans, Basic scan on publish + agentic Deep scan (~4 min), publishing gates ("block
publish on critical findings"), sensitive-data (PII) scanning across chat/DB/storage, Wiz/
Aikido integrations, and a compliance program (SOC 2 II, ISO 27001). LifemarkAI has Upstash/
in-memory rate limiting, RLS across core tables, SECURITY DEFINER RPCs for atomic money ops,
and a security-scan panel.

## 11. Where LifemarkAI is *ahead*

1. **Model freedom** — 50+ curated OpenRouter models, per-task tier routing, env overrides, provider fallback. Lovable users get zero model choice.
2. **Multi-framework** — React/Next/Vue/Svelte vs Lovable's single stack.
3. **Native packaging of generated apps** — Capacitor/Electron/PWA. Lovable ships web only.
4. **Test/Live environments** — Lovable withdrew theirs; LifemarkAI's 423-lock works today.
5. **Self-hostable** — gateway optional, direct provider calls locally; Lovable is SaaS-only.
6. **Editor Intelligence** — 10-role lens system + AI CTO with debate protocol is a deeper multi-agent architecture than Lovable's read-only subagents (though Lovable's shipped UX is more polished).
7. **Price per credit** — dramatically cheaper at every tier.

## 12. Gap list — status after the July 2 parity session

A code audit found several "gaps" already built before this session (prompt queue,
draw annotations, cross-project referencing, design previews, AI request logs/dashboard,
region selection, Paddle provider option, per-message cost display, site analytics,
SEO/AEO panel). The July 2, 2026 session closed the rest:

1. **Unified billing** — ✅ Done. Migration 074 converts both cent wallets into `profiles.credits` (1 credit = 4¢); `bill_cloud_usage` + `debit_ai_balance` rewritten to debit credits (signatures unchanged, $25/mo free allowance intact, `credit_logs` audit rows); gateway Worker + bill-usage cron read credits; free-actions note on the billing page.
2. **Chat history search** — ✅ Done. Search toggle (⌘F) with match count and amber `<mark>` highlighting in `chat-panel.tsx`.
3. **File generation in chat** — ✅ Done. `/api/ai/generate-file` (md/csv/json/txt/html, 1 credit, daily-credit claim + rate limit) + composer affordance with download cards; never touches project source.
4. **Free inline text edits** — ✅ Done. First 100/day free (UTC, counted via `credit_logs` action `inline_edit` with 0-cost rows), 1 credit after.
5. **Cloud polish** — ✅ Slow-query finder (`/api/cloud/slow-queries`: pg_stat_statements top-10 + AI index suggestions + permission-gated apply) and **Jobs tab** (`/api/cloud/jobs`: pg_cron list/create/delete) embedded in the Cloud panel. Remaining: richer data grid, region *move* (choice exists).
6. **Connector breadth** — ✅ 31 → 42 (added snowflake, bigquery, salesforce, algolia, sentry, posthog, semrush, linkedin, tiktok, twitch, granola); panel UI mirrored and env keys reconciled with the proxy registry.
7. **Revenue analytics** — ✅ `/api/projects/[id]/revenue` (MRR, active/new/churned, 6-month series) + Revenue section with Recharts bar chart in the monetization panel.
8. **Closed later on July 2 (second parity session):** publish-from-chat ("ship it" → deploy pipeline, zero credits), free "Try to fix" (20/day), repo instruction files (AGENTS.md/CLAUDE.md) injected into AI context, structured agent Tasks view (phase-grouped, Lovable-style), Database Manager data grid (🗃️ tab — the "richer data grid" Cloud delta), Lovable project import (code + tooling cleanup + database schema/data migration — something Lovable itself doesn't offer in reverse), automatic free-model routing for lightweight work, simplified one-row composer.
9. **SSR-first — CLOSED (July 2, third session):** new projects default to **Next.js App Router** (env-revertable via DEFAULT_NEW_PROJECT_FRAMEWORK / NEXT_PUBLIC_DEFAULT_FRAMEWORK). Real `buildNextJSPrompt` + `NEXT_APP_GENERATION_SYSTEM_PROMPT` (server components by default, explicit use-client criteria, full scaffold contract), Next-aware validators + enrichment, Next starter files, and — the hard part — the srcdoc preview engine now renders App Router projects as SPA approximations (`lib/preview/next-app-preview.ts`: route table from `app/**/page.tsx` incl. groups/dynamic segments, layout chains, next/link+navigation+image+font shims, async-server-component boundary, html/body flattening; PREVIEW_ENGINE_REV 26). Also fixed en route: the chat panel never sent the project's framework (`buildNextJSPrompt` was dead code) and "next"/"nextjs" value mismatch. Note vs Lovable: they moved to TanStack Start; Next.js was chosen here for existing plumbing (Vercel deploy, prompt infra) — equivalent SSR outcome.
10. **Custom MCP chat connectors — CLOSED (July 2):** users register remote Streamable-HTTP MCP servers (migration 076 `user_mcp_servers`, applied; owner-only RLS, auth headers never echoed back), zero-dependency JSON-RPC client (`lib/ai/mcp-client.ts` — initialize/tools-list/tools-call, SSE-or-JSON responses, session IDs, 15s timeouts), CRUD + test-connection API, and Agent-loop integration: enabled servers' tools join agent runs as namespaced `mcp_*` tools (≤25, failures become readable observations, output flagged untrusted in the prompt). Managed in the MCP panel's new "Chat Connectors" section.
11. **Still open** — Paddle provider-account *creation* (option UI exists), SOC 2 (organizational, not code). That's the entire list.

**Migration note:** run `supabase db push` for `074_unified_credit_balance.sql`. It is additive; old wallet columns are zeroed and kept. Prior wallet *debt* (negative balances) is forgiven by the conversion.

---

### Sources

- [Plan mode](https://docs.lovable.dev/features/plan-mode) · [Build/Agent mode](https://docs.lovable.dev/features/agent-mode) · [Subagents](https://docs.lovable.dev/features/subagents)
- [Browser testing](https://docs.lovable.dev/features/browser-testing) · [Testing](https://docs.lovable.dev/features/testing)
- [Lovable Cloud](https://docs.lovable.dev/integrations/cloud) · [Lovable AI](https://docs.lovable.dev/integrations/ai) · [Custom emails](https://docs.lovable.dev/features/custom-emails)
- [Credits & usage](https://docs.lovable.dev/introduction/credits-and-usage) · [Plans & credits](https://docs.lovable.dev/introduction/plans-and-credits)
- [Preview toolbar](https://docs.lovable.dev/features/preview-toolbar) · [Code mode](https://docs.lovable.dev/features/code-mode) · [Design guidance](https://docs.lovable.dev/features/design-guidance)
- [Payments](https://docs.lovable.dev/features/payments) · [Publish](https://docs.lovable.dev/features/publish) · [Custom domains](https://docs.lovable.dev/features/custom-domain)
- [GitHub](https://docs.lovable.dev/integrations/github) · [GitLab](https://docs.lovable.dev/integrations/gitlab) · [Integrations](https://docs.lovable.dev/integrations/introduction)
- [Security](https://docs.lovable.dev/features/security) · [Security center](https://docs.lovable.dev/features/security-center) · [SEO/AEO](https://docs.lovable.dev/features/seo-aeo)
- [Knowledge](https://docs.lovable.dev/features/knowledge) · [Skills](https://docs.lovable.dev/features/skills) · [Environments](https://docs.lovable.dev/features/environments)
- [Collaboration](https://docs.lovable.dev/features/collaboration) · [Enterprise](https://docs.lovable.dev/introduction/lovable-for-enterprise) · [Changelog](https://docs.lovable.dev/changelog) · [FAQ](https://docs.lovable.dev/introduction/faq)
