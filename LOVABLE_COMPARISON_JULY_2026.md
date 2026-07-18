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
| Pause Cloud manually / auto-pause idle (Jul 8) | ◑ Auto-pause exists on credit exhaustion (`bill-usage`); **manual pause + idle auto-pause missing** |
| Resize instance from chat w/ approval card (Jul 8) | ◑ Tier resize exists in Cloud panel (`setManagedComputeTier`); **not offered from chat** |
| Paste API key in chat → auto-secret (Jun 26) | ❌ Env panel exists; **no key auto-detection in composer** |
| Reference exact code lines in chat (`file.tsx:42` pills) (Jun 10) | ❌ @file mentions exist; **no line-level references** |
| Reference a connector via `@` in chat (Jul 8) | ❌ @-mentions are file-only |
| Connector action approval cards in chat (Jul 9) | ❌ DB writes have allow/ask/never; **generic connector writes don't pause for approval** |
| Build with URL (`html=` page references) (Jun 16) | ❌ Not present |
| Unpublished-changes dot on Publish (Jun 16) | ❌ Not present (cheap win) |
| Project monitoring beta (scheduled checks + email) (Jun 30) | ◑ Health scans + cron exist; **no per-project schedule opt-in / owner email digest** |
| TTS/STT models in AI gateway for built apps (Jun 18) | ❌ Editor has voice input; **generated apps get no voice API via gateway** |
| DB export (5 GB dump, emailed link) (Jul 3) | ◑ Snapshots/backups exist; **no user-facing full-dump export** |
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
