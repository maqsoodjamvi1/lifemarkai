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
| Task visibility | ✅ Live tasks dock + agent trace + streamed build steps | ✅ Tasks panel showing each step/files/tools |
| Prompt queue | ✅ Queue/pause/reorder/edit/repeat (persisted via `project_chat_state`) | ✅ Queue/pause/reorder/edit, repeat up to 50× |
| Subagents | ⚠️ Different shape: Editor Intelligence lenses (10 roles + AI CTO, debate protocol, wave scheduler — wired into chat/agent/plan/fix routes) | ✅ Read-only parallel investigators (generic + Explore) |
| Cross-project referencing | ⚠️ `@other-project` files only (not chat history/assets) | ✅ `@other-project` read-only code/assets/history reuse |
| Chat history search | ✅ Keyword + semantic search + hit nav / filters | ✅ Keyword + semantic search of project conversation |
| Edit-past / regenerate | ✅ Durable DB truncate + branch chip + file snapshot | ✅ Edit-past branching |
| Code execution / file gen in chat | ⚠️ UI wired; analyze gated unless `ALLOW_UNSANDBOXED_ANALYZE` | ✅ Analyze uploads, run code, emit PDF/XLSX/PPTX |
| "Try to fix" | ✅ `/api/ai/fix` recursive fix loop | ✅ Free, no credits |
| Design previews before build | ✅ Pick design directions before build | ✅ Pick 1 of 3 design directions |
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
| Visual edits | ✅ Overlay + VEB bridge: multi-select (⌘/Ctrl), per-side margin/padding, image URL replace, AI image→composer, inline text, free quota | ✅ **Preview toolbar**: select elements (→prompt), inline text edit (free ≤100/day), **draw annotations**, pinned comments (@Lovable) |
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

## 13. Deep re-comparison — July 13, 2026

Method: (a) 30-point automated repo audit of every parity feature — **all 30 PRESENT**, none partial; (b) fresh read of Lovable's changelog through **July 9, 2026** and the current Cloud docs. This section supersedes the gap list above where they differ.

### 13a. Parity confirmed in code (audit highlights)

Version system (per-message revert + preview with after-state semantics, restore route, preview banner), follow-up suggestion chips, security bar above composer, publish-from-chat, Lovable import incl. database, DB manager, custom MCP connectors, self-verify + backend auto-wire, both visual-edit engines, connector proxy (**registry now at ~52 connectors** — ahead of the 42 noted in §12), OpenRouter balance guard + prompt-cache static-head split + free-model routing, SSR-first Next.js generation + preview, Test/Live lock, self-healing scans, embedded paywall, daily credits + rollover, unified billing, knowledge panel, prompt queue, domains/Figma/voice/analytics/collab/templates-remix/Monaco — all verified on disk.

### 13b. New at Lovable since the last pass (Jun 15 – Jul 9) — and where LifemarkAI stands

| Lovable ship | LifemarkAI status |
|---|---|
| One credit balance (Jun 18) | ✅ Equivalent (migration 074) — shipped the same week |
| Publish from chat (Jun 9) | ✅ Done |
| Slow-query finder (Jun 10) | ✅ Done |
| Manage scheduled jobs (Jun 24) | ✅ Done (Jobs tab, pg_cron) |
| Queued messages fixes (Jul 3) | ✅ promptQueue predates it |
| Connectors page in project (Jul 2) | ✅ Connectors panel exists |
| PWA support (Jun 3) | ✅ PWA panel |
| Comments in shared previews (Jun 26) | ✅ Comments panel |
| AI activity dashboard (Jun 18) | ✅ Gateway logs usage per project (`lifemark_cloud_usage` + AI overview); per-request drill-down with redacted request capture is thinner than theirs |
| Priority processing for speed (Jun 30) | ✅ Equivalent lever: `OPENROUTER_PROVIDER_SORT=throughput` |
| Browser testing integration (Jun 22) | ✅ e2e + testing panels |
| Aikido pentest all plans (Jun 22) | ◑ Analog: vuln-scan + nightly security scans; no third-party pentest brand |
| Pause Cloud manually / auto-pause idle (Jul 8) | ✅ Manual pause/wake API + idle auto-pause (see §14) |
| Resize instance from chat w/ approval card (Jul 8) | ✅ Cloud ops approval cards from chat (see §14) |
| Paste API key in chat → auto-secret (Jun 26) | ✅ TipTap + capture paste → `/env` + `{{TAG}}` / Secrets Vault for `NAME=value` |
| Reference exact code lines in chat (`file.tsx:42` pills) (Jun 10) | ✅ Line-ref chips, Monaco insert, open-at-line |
| Reference a connector via `@` in chat (Jul 8) | ✅ `@connector:id` mentions + chat-route system block |
| Connector action approval cards in chat (Jul 9) | ✅ `LovableConnectorApprovalCard` + connector-permissions API |
| Build with URL (`html=` page references) (Jun 16) | ✅ `build-with-url` + page-reference inject in chat |
| Unpublished-changes dot on Publish (Jun 16) | ✅ Dirty-dot; seeded from max file `updated_at` across reloads |
| Project monitoring beta (scheduled checks + email) (Jun 30) | ✅ Opt-in + cadence + email digest + history in Self-Heal |
| TTS/STT models in AI gateway for built apps (Jun 18) | ✅ ai-proxy + gateway speech endpoints (see §14) |
| DB export (5 GB dump, emailed link) (Jul 3) | ✅ Sync SQL download + **Email me the dump** (≤20 MB attach) |
| Domain buy/transfer/WHOIS via registrar (Jun 4–8) | ❌ Domains panel connects, doesn't sell — registrar integration is a business deal, not code |
| Desktop app (Windows, Jul 6) | ❌ Out of scope — web-only |
| Interface language picker (Jun 17) | ❌ Platform UI is English-only (generated-app i18n panel exists) |
| Private npm registry (Enterprise, Jun 18) | ❌ Enterprise infra, not started |
| New connectors: dbt, ClickHouse, GitHub API, WordPress, X, Calendly, Chargebee/Zoho/Wix/WooCommerce batch, Athena, Replicate… | ◑ Registry ~52 vs their continuous drops — treadmill, not a gap; add on demand |
| SSO groups/JIT/domain-login, workspace insights, region defaults, audit-log filters | ❌ Enterprise admin surface — LifemarkAI has none of the SSO/SCIM layer (known, unchanged) |
| IPTC AI-provenance metadata on generated images (Jul 8) | ❌ Trivial to add in image pipeline |
| TanStack Start default (Enterprise, Jun 22) | ✅ Different answer, same goal: SSR-first Next.js |

### 13c. Honest bottom line (July 13)

- **Core product loop: at parity or ahead.** Chat/plan/agent modes, versioning, visual edits, Cloud with real Supabase provisioning, unified credits, publish-from-chat, import-from-Lovable (they have no reverse), multi-model routing with cost guardrails (they have nothing user-visible like the balance guard/free-tier routing), custom MCP servers (their MCP is Lovable-as-server; ours lets users bring their own).
- **Behind on chat ergonomics (small, closeable):** line-level code references, @connector mentions, API-key paste-to-secret, unpublished-changes dot, connector approval cards, pause/resize from chat.
- **Behind on managed-platform depth (medium):** manual/idle Cloud pause, user-facing DB dump export, project monitoring as an opt-in scheduled product with email digests, TTS/STT for built apps.
- **Behind structurally (unchanged, acknowledged):** enterprise identity (SSO/SCIM/groups/insights), domain registrar resale, desktop app, private npm registry, SOC 2, Paddle account auto-creation, hosted per-project preview servers (ops).

## 14. July 13 close-out session — ALL closeable gaps from §13 shipped

Everything in §13c's "small" and "medium" tiers is now implemented; only the structural tier remains.

**Chat ergonomics — CLOSED:**

1. **Unpublished-changes dot** — `editor-top-bar.tsx`: amber dot on Publish when `lastSaved > deployedAt` (from `/api/deploy/status`), "Publish changes" label in the dropdown; cleared on successful deploy.
2. **Paste API key → secret** — `lib/security/detect-secret.ts` (24 conservative token patterns: OpenAI/Anthropic/OpenRouter/Stripe/GitHub/Slack/Resend/AWS/Notion/Shopify/GitLab/Linear/Figma/JWT…) + composer `onPasteCapture`: the raw key never enters the message — replaced with a `{{TAG}}`, value saved via the project env API, toast confirms. Better than Lovable's (they swap before send; we swap before it ever hits the input state).
3. **Line-level code references** — Monaco action "Reference Line(s) in Chat" (⌘⇧L + context menu + "Ref line" in the selection bar) dispatches `monaco-line-ref` → composer inserts `@path:12-34`; on send, files referenced with lines are sliced to the referenced range ±5 lines *with line numbers* instead of whole-file context (sharper + cheaper than Lovable's whole-file pills).
4. **@connector mentions** — mention picker now lists the 50+ app connectors (`CONNECTORS` catalog); inserts `@connector:stripe`; chat route detects it and injects a steering block that forces gateway-routed integration code.
5. **Connector approval cards** — NEW agent tool `connector_call` (agent can actually *use* the project's configured connectors): GETs run freely, writes gated by `decideConnectorWrite` over `projects.metadata` (`always`/`never`/10-min `once` grants — `lib/integrations/connector-exec.ts`, decision API `/api/projects/[id]/connector-permissions`). Blocked writes surface an approval card in chat (Allow once / Always allow / Never / Skip); approving re-runs the agent. Port-tested 6/6.
6. **Pause/resize Cloud from chat** — `lib/ai/cloud-intent.ts` (conservative detector, port-tested 8/8) + zero-credit chat-route branch that emits an approval card: resize shows the tiny→large size picker with current preselected (→ `PATCH /api/cloud/provision`), pause/wake confirm (→ `POST /api/cloud/pause`). Nothing executes without the click — same contract as Lovable.

**Managed-platform depth — CLOSED:**

7. **Manual pause + wake** — `/api/cloud/pause` flips `cloud_status` and, when the Management API is configured, pauses/restores the REAL Supabase project (`pauseManagedProject`/`restoreManagedProject` added to `lib/cloud/management.ts`). Cloud panel Advanced tab: real Pause/Wake card (replaces the dead "contact support" button).
8. **Idle auto-pause** — bill-usage cron pauses paid-tier Cloud projects untouched for 14 days (`cloud_paused_idle`); the top-up auto-resume now explicitly skips manually/idle-paused projects so it can't wake them by accident.
9. **DB export** — `GET /api/cloud/export`: portable SQL dump (CREATE TABLE from information_schema + data as INSERTs; 200 tables / 5 000 rows / 20 MB caps) via `queryManagedSql`, downloads as `.sql` from the Cloud panel.
10. **Project monitoring** — opt-in per project (`metadata.monitoring`, toggle + daily/weekly cadence in the Self-Heal panel, API `/api/projects/[id]/monitoring`). The nightly health-scan cron now also scans monitored projects regardless of recent edits and emails the owner (Resend) when critical/error findings are open, respecting cadence.
11. **TTS/STT for built apps** — turns out this was already live via `/api/projects/[id]/ai-proxy` (capabilities `tts`/`stt` with billing) + `aiSpeak`/`aiListen` scaffolded into generated apps. Added the same on the Cloudflare gateway (`/v1/audio/speech`, `/v1/audio/transcriptions` with credit billing: 2¢/1k chars TTS, 2¢/MB STT) so edge-function apps get voice too. §13's "gap" corrected.

**Also shipped:**

12. **IPTC/XMP AI-provenance** — `lib/ai/image-provenance.ts`: pure-TS PNG iTXt injection of `DigitalSourceType=trainedAlgorithmicMedia` XMP after IHDR (CRC32 correct — port-tested with full chunk-walk validation, 10/10); applied to all data-URL PNG outputs of `generateImage`.
13. **Build-with-URL `html=` page references** — handler + payload + prompt-create-box accept up to 10 combined image/page refs; chat route fetches referenced public pages server-side (SSRF-guarded: private/loopback/link-local/metadata ranges blocked — port-tested), strips to readable text with structural hints, and injects as layout/content reference.

**Port tests: 38/38 pass** (secret detection/redaction, cloud intents, PNG provenance incl. CRC chunk-walk + idempotency, page-ref extraction/SSRF guard/HTML stripping, connector write decisions).

**Remaining vs Lovable (structural only):** enterprise identity (SSO/SCIM/group mapping/workspace insights), domain registrar resale, desktop app, private npm registry, SOC 2, Paddle account auto-creation, hosted per-project preview servers (ops), platform UI language picker. Everything else is at parity or ahead.

## 15. July 13 — editor-surface deep audit + final closures

A strict 34-point audit of the editor components (UI render + wiring, not just state) found 21 features fully present and surfaced 6 real Lovable-editor gaps. All 6 closed same day:

1. **SVG previews in chat** (Lovable Jun 9) — new `SvgBlock` in `chat-panel.tsx`: any ```svg block (or bare `<svg>…</svg>` output) renders as a sanitized image on a checkerboard, with Preview/Source toggle, Copy, and Download.
2. **Markdown preview in the code editor** (Lovable Jun 8) — `code-panel.tsx`: a Preview/Source toggle appears for `.md/.mdx/.markdown` tabs; rendered via ReactMarkdown+GFM as a styled overlay, live against unsaved buffer content.
3. **Project media gallery** (Lovable Jul 9) — new `media-gallery-panel.tsx` (panel id `media`, 🖼️ in the panel catalog): every image in the project — image files (SVG rendered inline sanitized, data-URL/base64 rendered) plus image URLs referenced anywhere in code — in a real-proportions CSS-columns grid with hover actions: Reference in chat, Copy URL/source, Download, Delete (project files, confirm-gated).
4. **Click a `file.tsx:42` pill in a sent message → editor jumps to the line** (Lovable Jun 10) — `linkifyLineRefs` rewrites refs to pill-buttons (code fences excluded), clicking dispatches `lifemark-open-file-at-line`; `editor-layout` opens the file, switches to Code view, and reveals the line. Port-tested 7/7 (incl. fence exclusion, plain-@ non-matches, href round-trip).
5. **Compact "Show toolbar" toggle** (Lovable Jun 23) — preview toolbar gains a Hide button; collapsed state shows a floating "Show toolbar" pill; persisted in localStorage.
6. **True in-place inline text editing + free-quota counter** — double-click any text element in the srcdoc preview → edit it directly (`contenteditable=plaintext-only`, select-all on entry, Enter/blur commits to source via the visual-edit matcher, Escape cancels, empty commits rejected); the visual-edit popover now shows "Free today: N of 100 edits left" fed by a new `GET /api/ai/inline-edit` quota endpoint.

Polish en route: prompt-queue repeat cycle extended to Lovable's 50× (1→2→3→5→10→25→50); dead `repeatInputId` state removed.

**Editor-surface verdict:** at parity or ahead on all 34 audited points. Ours-ahead items confirmed in the audit: edit-past-message branching, per-message cost badges, DB-persisted message feedback, bookmarks + filter, draw-annotate modal, element-anchored preview comments, split-view Monaco + format-on-save, cross-file find-and-replace, deploy rollback, command palette + shortcuts modal, design-direction picker.

### 15a. Beyond-parity extras (July 13, second pass)

Items neither product strictly required but that push past Lovable:

- **Preview back/forward** — route-history stack in the address bar (Lovable's preview has no back/forward); back/forward navigate both engines via the existing `lifemark-preview-navigate` bridge, with iframe-echo suppression so clicks don't double-push history.
- **In-app fullscreen preview** — Maximize toggles the preview pane to fill the window (Esc exits); Lovable only opens a new tab.
- **File tree: Duplicate + drag-drop move** — Duplicate with `-copy`/`-copy-N` dedupe; drag any file onto a folder (violet drop highlight) or the tree background (move to root); conflicts rejected. Lovable's code mode has neither.
- **Settings search** (Lovable Jul 8 parity) — filter box over settings sections with synonym matching (`sso` → Security, `token` → API Keys), "No matching settings" empty state.
- **JPEG XMP provenance** — AI-provenance now also covers JPEG data-URLs (APP1 XMP segment after SOI/APP0, 64KB guard, idempotent) — port-tested 11/11 with full marker-walk validation; Lovable documents PNG-pipeline provenance only.

## 16. July 13 — depth batch (workflow-layer parity items from §1/§5/§10)

1. **Publishing gate** (§10 "block publish on critical findings" — was Lovable-only) — `handleDeploy` now runs the pre-publish check: CRITICAL static-scan findings (exposed keys etc., severity-filtered `criticalSecurityCount` from editor-layout) pause the publish with an explicit confirm; declining opens the Security panel. Warn-and-confirm rather than hard-block — the user stays in charge.
2. **Persisted agent work trace** (§1 "Task visibility" follow-through) — the agent route now stores a compact trace (≤40 thought/action steps, tool + path + 140-char content) and wall-clock `work_seconds` in the assistant message's metadata; chat renders a collapsible **"Worked for Xs · N steps"** disclosure on finished messages that survives reloads — Lovable's Tasks panel is ephemeral per-run; ours persists.
3. **Per-request AI activity** (§4 "thinner than theirs" — closed) — the AI Metrics dashboard gained a Requests drill-down: every `ai_eval_log` row with status/model/task/tokens/latency/route, All-vs-Failed filter, per-model filter, incremental "Show more".
4. **Browser performance profiling** (§1 testing-depth delta) — the Playwright browser-test engine now measures **Core Web Vitals** (TTFB/FCP/LCP/CLS/DCL via PerformanceObserver installed pre-navigation), rates them against Google's good/needs-improvement/poor bands, streams a `vitals` SSE event, and the Browser Tests panel renders color-coded metric chips.
5. Landing-page "Powered by GPT-4o…" stale-copy TODO — verified already fixed (hero reads Claude Fable/Opus/Codex/GPT-5).

## 17. July 13 — per-route model economics pass

Full audit of every `generateAI` call site (39 across app/api + lib), then right-sized the over-provisioned ones. Heavy paths (build, agent, fix, self-verify, health fixes, orchestrator) untouched — they already route through the smart-model/budget-aware chain.

**Downshifted (was → now):**

| Route | Task | Was | Now |
|---|---|---|---|
| `ai/sql` | NL→SQL one-shot | coding workhorse | fast tier |
| `ai/enhance` | prompt rewrite | frontier balanced | economy chat |
| `ai/inline-edit` | few-line selection edit | coding workhorse | economy coder (explicit model still wins) |
| `ai/analyze` | small script gen | frontier balanced | fast tier |
| `ai/design-directions` + `design-guidance` | design ideation/critique | coding workhorse | design tier (aesthetics-tuned, cheaper) |
| `ai/generate-email` | email templates | coding workhorse | content tier |
| `ai/generate-file` | md/csv/json/html docs | coding workhorse | content tier |
| `ai/generate-tests` + `generate-browser-tests` | single-file test gen | coding workhorse | balanced tier |
| `projects/[id]/generate-knowledge` + workspace variant | knowledge-doc summarization | frontier balanced | economy chat |

**Token caps added** (were uncapped → model-ceiling): review 1500, refactor 4000, docgen 2500, brainstorm 700, summarise 800.

Impact: the coding workhorse is now reserved for actual builds/fixes; a dozen everyday interactions (SQL helper, inline edits, design pickers, emails, docs, tests, knowledge) run 2–10× cheaper and faster on purpose-fit tiers, with provider.ts's free-tier congestion fallback and the balance guard still underneath. Everything remains env-overridable per tier.

## 18. DOM-capture clone pass (Jul 21, 2026)

Compared a fresh capture of the live Lovable editor DOM against the `components/editor/lovable/*` mirror. Same libraries confirmed on both sides (Tiptap/ProseMirror composer, TanStack Virtual timeline, Radix/Base-UI primitives, framer-motion, lucide, Sonner). One structural divergence found and fixed: the **preview interaction toolbar**. Lovable renders a *single* floating glass pill that swaps its inner content between the tools row (Select / Edit text / Draw annotation / Add comment / ⋯ / minimize) and contextual trays (Annotation with undo·redo·Clear·Done, "N selections", "Pending changes", unread comments, "Reverting to earlier version…"), animating the pill's width to fit. Ours previously stacked separate trays below the pill. `preview-interaction-toolbar.tsx` was refactored to the single-pill content-swap model: `activeTray` priority selector (reverting > pending > selection > annotation > comments), `scrollWidth`-measured width animation (200ms cubic-bezier(0.32,0.72,0,1)), matching glass styling (`bg-white/[0.48] dark:bg-black/40`, blur+saturate, #2F6FED/#5E89F2 accents). Verified live in Chrome: tools row → annotation tray swap → back, minimize → expand, drag persistence, zero console errors.

**Chat panel pass (same capture):** aligned the chat panel to the reference DOM. User messages now render a centered "Today at 1:38 PM" stamp above a right-aligned borderless bubble (`bg-secondary-pulse shadow-surface-xs rounded-6 rounded-br-1 max-w-[75%] px-4 py-4 text-base leading-[22px]`, container `items-end pr-4`); assistant messages are a full-width `flex flex-col gap-3 px-4 text-base leading-[22px]` column. The composer form card matches `group flex flex-col bg-secondary-pulse shadow-surface-xl rounded-6 gap-2 p-3` (border removed), the Tiptap editor + placeholder use the reference `px-2 pt-2 pb-1 text-[16px] md:text-base` with 40px min-height, the footer row is `flex flex-wrap items-center gap-1`, and the plus/mic/send controls are `h-7 w-7 rounded-full` with the send button now the round arrow-up. Verified live: bubbles, stamp, composer, round send — zero console errors.

**Error + suggestion pass (same capture):** Lovable renders fix requests as a *special message* inside the user bubble — `<div class="special-message">Fix error</div>` + a collapsed `<pre class="text-tertiary-pulse max-h-[300px] whitespace-pre-wrap">…raw error…</pre>` behind an `aria-expanded` chevron — instead of dumping the healing prompt as text. Implemented as `lovable/fix-error-message.tsx`: `parseLovableFixMessage()` recognises healing prompts ("Fix the preview/runtime errors…"), composer runtime fixes, auto-fix attempt notifications, and security sweeps, and `LovableFixErrorMessage` renders the title + collapsible raw error (`max-w-[300px]`, h-7 w-7 chevron toggle); wired first in the message-row content chain. Suggestion chips (in-timeline + above-composer follow-ups) restyled to the reference pill spec: `px-[9px] py-1 text-sm rounded-full` on `--bg-translucent` with `fg-primary`, borders removed. Preview error surfaces de-alarmed to the pulse system: the runtime-error card and the healing overlay are now neutral `bg-secondary-pulse shadow-surface-xl rounded-6` cards with a small red dot, reference-style error `<pre>`s, quiet "Show error"/"Refresh"/"Resume" text pills and a primary inverse round "Try to fix" button (was amber/red bordered panels with "Fix with AI"). Verified live: historical fix message renders as compact "Fix error" + chevron; expand shows the raw runtime error; zero console errors.

**Structural 100% pass (same capture):** aria-label inventory of the full capture proved three remaining divergences, all closed. (1) *No chat header* — Lovable's panel goes top bar → timeline directly; our header row (mode pill · credits · msg count · search/bookmark/menu icons) is now hidden, with every utility relocated into the composer "+" menu (mode switcher chat/plan/build/agent with checkmarks, Search chat, Bookmarks, Export chat, Clear chat — all via the existing chat-settings event bus). (2) *Minimal composer footer* — the captured footer is exactly `hidden file input → "+" → spacer → mic → send`; our Visual-edits chip, Build ▾ mode row, model menu and file-gen trigger are gone from the row (visual-edits chip shows only while active; clarify row only for empty build/agent projects; model menu only when manually engaged; file-gen picker only while open from the menu). (3) *Row wrapper* — message rows now use the captured `mx-auto w-full max-w-3xl flex flex-col rounded-3 py-2`, and the timeline scroller matches `chat-scroll-container` semantics: no own gutter (rows self-pad), `padding-bottom: max(4rem, nudge + 0.5rem)`, top-safe-padding spacer. Hover actions (Revert / Helpful / Not helpful / Copy message / More options / Bookmark) already matched the capture's inventory. Verified live: headerless panel, minimal footer, "+" menu carries all 22 actions, zero console errors.

**Card + notice pass (same capture):** the version/change card now mirrors the captured markup: borderless `max-w-sm rounded-4 shadow-surface-md bg-secondary-pulse` with `outline-2 outline-offset-2 outline-transparent focus-visible:outline-accent`, a `role="button" data-card-focusable` clickable body, header row `px-4 py-3 pr-3` with the title in the captured `h-7 truncate text-lg font-[440] md:text-base` span, square h-7 w-7 icon buttons (Bookmark in history + Preview this version), and Enter/Space keyboard activation — replacing the old bordered card with a Details/Preview tab row. Message bubbles gained `dir="auto"` (capture's RTL-safe direction). The "Context summarised" strip was restyled from the violet accent band to the capture's neutral notice pattern: Information icon, pulse-token colors, optional round "Dismiss notice" control. Toolbar aria-labels (Preview interactions / Toolbar options / Minimize toolbar) and the message hover-action inventory already matched. Verified live: neutral notice renders, timeline + scroll-to-bottom pill intact, zero console errors.

**Streaming + label polish (same capture):** while generating, the composer placeholder now swaps to the captured "Queue follow-up..." (was static "Ask LifemarkAI..."), the placeholder span carries the capture's `animate-in fade-in-0 duration-500`, and the stop control is labeled "Stop generating" (capture aria) instead of "Stop generation". The preview URL-bar route input adopted the capture's page-switch aria pattern (`{page} — current page, switch pages`); "Desktop view", "Refresh", "Open in new tab", "Switch project", "View history", "More" and the view-switcher Preview/Files/Code labels already matched. The chat panel's lazy-load state was replaced with Lovable's centered-spinner overlay (flex-col gap-2, bg-base) instead of the "Loading chat..." text line.

**Pages dropdown (capture: "Homepage — current page, switch pages"):** the preview URL bar's route is now a real page-switcher dropdown, not just a text input. New `lib/preview/derive-pages.ts` derives the app's navigable pages from its source (react-router `<Route path>` declarations, `src/pages/*` conventions with CamelCase→kebab, Next-style `app/**/page.tsx` with route-groups stripped; dynamic segments and 404 pages excluded) — port-tested 8/8. PreviewPanel broadcasts the list on every files change (`lifemark-preview-pages`), the top bar consumes it, and UrlBarPill renders the captured trigger (`{page} — current page, switch pages`) opening a menu of pages with a check on the current route plus "Custom route…" which falls back to the manual input. Verified live on the CargoMark project: dropdown lists its 9 real pages, clicking Contact navigates the preview and the bar updates to `/contact`.

**Agent intelligence audit (chat "smartness" vs Lovable):** inventoried our agent toolset — read/edit/write/delete/list files, glob_search, search_code, find_definition, analyze_code, generate_image, browse_preview, read_preview_console, read_preview_network, read_ai_activity, connector_call — plus BM25 context ranking, chat summarisation, knowledge files, clarify-first, self-verification with static contract checkers, auto-fix with a persistent attempt ledger, and multi-model routing. Two genuine capability gaps vs Lovable's agent were found and closed: (1) **web access** — new `lib/ai/agent-web-tools.ts` gives the agent `web_search` (Serper → Brave → keyless DuckDuckGo fallback, 6 results) and `fetch_url` (SSRF-guarded, reuses the reference-page fetcher, 6k-char cap); (2) **live database inspection** — `db_query` runs a single read-only SELECT/WITH/EXPLAIN against the project's managed Cloud Postgres via `queryManagedSql`, available only when Cloud is enabled + provisioned and the database permission isn't "never"; writes are rejected with guidance to propose migrations. The read-only guard is strict (single statement, no write keyword anywhere) and port-tested 12/12. All three registered through the agent route's `extraTools` (no changes to lib/ai/agent.ts).

**Deep agent behaviors (Lovable-agent decision-making):** two behavioral layers added on top of the tool parity. (1) *Question-vs-command routing* — Lovable's agent answers questions instead of rebuilding; ours now does too. `isInformationalQuery()` in `lib/ai/build-intent.ts` (conservative: any action verb keeps Build; interrogative openers or a trailing "?" downgrade) and the chat route downgrades Build→Chat for informational prompts on existing projects — "why is the cart empty?" now costs 1 credit and gets a prose answer; "why is the cart empty? fix it" still builds. Port-tested 16/16. (2) *Always-on preview console context* — the client now sends the current preview runtime errors (last 5, truncated) with every message, and the route injects a "Current Preview Console Errors" block into the system prompt with explicit guidance: unrelated request → mention + offer to fix; related request → treat as primary evidence and fix root cause. Previously the AI only saw console state inside explicit fix flows.

**Agent-route intelligence parity (closing a self-made gap):** routing builds to the agent loop made the agent route the primary build path — but the intelligence blocks lived only in the chat route. Ported all of them: on projects with >8 files the agent's knowledge context now includes the design-system block (extracted tokens/fonts/ui-kit), the decision-log memory ("do not undo these"), and the learned-rules flywheel (recurring failure-class prevention rules from `health_findings`); and successful agent runs now write their own decision-log entries (request, file count, key paths — capped 15), so agent builds both consume and feed the project memory exactly like chat builds. Every build path — chat JSON, patch, agent — now shares one intelligence spine.

**Prompt tuning parity (the "millions of builds" gap):** Lovable's training *data* cannot be copied, but its distilled output can be studied — their agent system prompt is public, and it encodes what those builds taught them. Audited every rule in it against our prompt layer: already covered were scope discipline, minimal-diff patching, batching, discussion-default, clarify-when-unsure, module closure, and SSR SEO. Eight rules we lacked were added — in our own words — to the `Craft Discipline` section of `BUG_FREE_GENERATION_CONTRACT` (which feeds all five generation prompts): reply in the user's language; absolute design-token discipline (no ad-hoc `text-white`-style utilities — extend the token system + component variants instead, verify contrast in both themes); SEO by default on every page including SPAs; debug from runtime evidence before proposing code; small in-scope refactors when a request exposes structural rot; no placeholders anywhere (real copy, generated images, wired buttons); pick a distinctive design direction before writing components on fresh builds; two-sentence post-edit summaries. And the part Lovable can't give us was built as a mechanism: `lib/ai/learned-rules.ts` — a zero-AI-cost flywheel that classifies this project's recent `health_findings` into seven failure classes (dangling-import, undefined-data, syntax, contrast, routing, env, hooks; port-tested 10/10) and injects "these exact patterns recurred here — do not repeat them" prevention rules into the next build prompt when a class recurs ≥2×. Our tuning now compounds from our own builds, automatically, per project.

**Builds run the full agent loop (Lovable machinery parity):** the last architectural divergence in the build pipeline is closed. On existing projects (>8 files), structural Build requests now execute the ReAct agent loop — the same machinery Lovable uses for every build: tool-driven surgical edits (read/edit/write, glob/code search), live preview + console introspection, db/web tools, verified steps — instead of a monolithic JSON regeneration. The routing ladder is now complete and client+server consistent: question → chat answer · micro-edit → surgical patch (auto-recovers) · structural edit → **full agent loop** · fresh scaffold → blueprint builder (the one place monolithic generation is genuinely better: 18–24 files in one pass). Opt out with `NEXT_PUBLIC_AGENT_BUILDS=false`. The patch-fallback retry (`forceBuild`) deliberately bypasses agent routing. What is NOT being cloned, deliberately: Firebase and protobuf. Those are vendor choices, not structure — swapping Supabase (82 migrations, RLS, billing, Cloud provisioning) for Firebase would demolish LifemarkAI's own product to imitate an implementation detail invisible to users, and protobuf-vs-SSE is a wire format with zero user-facing difference. Structure parity that matters — the agent loop — is what ships.

**Typography + signature micro-details (capture head + live CSS):** the capture preloads `CameraPlainVariable-*.woff2` — Lovable's editor face is **Camera Plain Variable**, a licensed commercial typeface we cannot legally bundle; our Geist Sans is the closest shipping analogue (modern neo-grotesque, comparable metrics) and stays. Reading Lovable's public compiled CSS (`app-shared-*.css`) surfaced their component-interaction recipes (layered inset shadows + gradient + glow-on-hover for switches/radios/checkboxes/selects) and one immediately portable signature: the **animated mention pill** — a 6-stop OKLCH rainbow gradient at 300% width drifting via an 8s `background-position` loop with a hairline inset ring. Ported as our own `.mention-pill-lifemark` (light + dark variants, `prefers-reduced-motion` respected) and applied to the composer's @mention chips, replacing the flat violet pill. CSS brace-balance and tsx parse verified.

**Light theme default (capture: `<html class="light">`):** the deepest re-read of the capture surfaced a root-level difference — Lovable's editor runs LIGHT by default (`color-scheme: light`), ours defaulted dark. The OKLCH class-based token layer already supported light; verified live that the dashboard and editor render correctly in light mode (top bar, headerless chat, bubbles, composer card, notices all adapt). Flipped `defaultTheme` to `"light"` in the ThemeProvider (users with a stored preference keep it; system detection still available) and converted the preview panel's seven hard-coded `bg-[#0a0a0a]` surfaces to `bg-[var(--bg-base,#0a0a0a)]` so the non-iframe preview chrome follows the theme. Also confirmed from the capture root: `overscroll-y-none md:overscroll-y-auto` behavior and the version-card-mounted action row (Bookmark/Revert/Helpful/Not helpful/Copy/More all ride the card — ours renders the same set adjacent to the message, equivalent inventory).

**Vision design review + intelligence regression suite:** (1) *The agent now looks at the result* — inside the existing Playwright self-verify loop, when the app renders with zero functional errors, an env-gated vision pass (`VISION_REVIEW=true`, model via `VISION_REVIEW_MODEL`, default gpt-4o-mini) screenshots the page and screens it for at most 3 CRITICAL visual defects (blank sections, unreadable contrast, overlap/clipping, raw "undefined"/lorem placeholder text) — taste is explicitly out of scope. Found defects enter the same fix loop as runtime errors. Off by default: zero cost/latency until enabled. (2) *The heuristics are now CI-tested* — `scripts/verify-intent-routing.ts` (`npm run verify:intelligence`) runs 65 assertions against the real modules: informational-query routing, surgical-edit detection, the db_query SQL write-guard, design-token extraction, decision-log capping, and pages derivation. Verified green against the live repo. Every judgment call the chat makes is now regression-locked.

**Patch→build auto-fallback (agent resilience):** the auto-routed surgical path can now never strand the user. The route tags auto-routed patches (`auto_routed`) on both failure surfaces — the zero-patches `patches_failed` event AND the parsed-but-all-missed `patch_failed` flag in the done payload — and accepts `forceBuild` to bypass the downgrade chain. When an auto-routed patch misses, the chat panel shows "Switching to full edit — rebuilding the change properly" and silently re-sends the same request as a full build after the stream closes (single retry, forceBuild guard prevents loops). Manually-chosen Quick Edit keeps the explicit failure message. Net behavior matches Lovable's agent: try the cheap surgical path first, recover to the thorough path automatically.

**Surgical-edit auto-routing (Lovable-agent depth):** Lovable's agent makes micro-edits surgically; ours regenerated the app for "change the title to X" (the #1 speed complaint — 5+ minutes, 23 files). New `isSmallSurgicalEdit()` in `lib/ai/build-intent.ts` detects text/copy/color micro-edits (small-verb + text-target/quoted-string/color-tweak, ≤220 chars) with a hard structural veto (page/section/layout/add/remove/menu/header/… all stay in Build — menu edits keep their dedicated machinery). The chat route now downgrades Build→Patch for these on projects with >8 files, landing in the existing surgical pipeline (find/replace patches + repair retry + deterministic menu/text fallbacks) — seconds and 1 credit instead of minutes and 2. Port-tested 17/17. Mode-decision chain is now: informational → Chat · micro-edit → Patch · everything else → Build, mirroring Lovable's agent choosing answer/surgical-edit/full-build per request.

**Design consistency + project memory (Lovable-agent depth):** two more behavioral layers. (1) *Design-system context* — Lovable keeps incremental edits visually coherent because the model always sees the project's real design language. New `lib/ai/design-system-context.ts` extracts it from the actual files — CSS custom properties (first/light theme wins, 36-token cap), fonts (Google-fonts links + font-family declarations), the `src/components/ui` kit inventory, and tailwind theme color keys — and injects a "reuse these tokens, don't invent ad-hoc styles, match existing components" block into every build/patch on projects with >8 files. Returns null on fresh projects (design-direction seeding handles those). (2) *Decision log* — long-horizon memory that survives chat summarisation: every successful build appends `{at, req, files, paths}` to `projects.metadata.decision_log` (capped 15, zero AI cost), and future build prompts see a "Recent Build Decisions — do not undo them unless explicitly told" block (last 10). Both port-tested 12/12; wired into the chat route next to the preview-console context.

**Notifications bell (capture: "Notifications alt+T"):** the last top-bar element from the capture we lacked. New `components/editor/notifications-bell.tsx` — bell button with the captured aria label, blue unread dot driven by a per-project last-seen timestamp (localStorage), Alt+T toggle shortcut, and a popover rendering the existing unified activity feed (`/api/projects/[id]/activity`): typed icons (deploy/AI/commit/security/comment), titles, two-line details, relative times. Opening marks seen. Wired into the top bar's right cluster before the environment switcher. Verified live: bell + unread dot render, popover lists real project activity (file modifications, snapshots, AI responses), zero console errors.

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
