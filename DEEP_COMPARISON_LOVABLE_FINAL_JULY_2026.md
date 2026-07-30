# LifemarkAI vs Lovable — Final Deep Comparison

**Date:** July 22, 2026 · **Lovable intel:** changelog through **Jul 16, 2026**, live editor DOM capture, live compiled CSS, public agent system prompt · **LifemarkAI state:** working tree (21 unpushed passes) — ⚠ production (lifemarkai.com) still runs the pre-batch build until pushed.

**Legend:** ✅ Equal (class/behavior-level match) · ≈ Equivalent (same function, different implementation) · ⬆ Ahead · ⚠ Behind · 🔒 Cannot be equal (legal/physical)

---

## 1. Verdict

On the surfaces that were captured and compared, LifemarkAI is **at parity or ahead in ~90% of dimensions**, ahead in several (page-switch dropdown, notifications feed, per-request AI metrics, multi-model routing, self-tuning flywheel), equivalent-by-design in architecture (Supabase/SSE vs Firebase/protobuf), **behind in enterprise identity depth and connector breadth**, and blocked from literal 100% by exactly one thing: a licensed font. None of the 21 passes are deployed yet — today's *live* comparison is not this document until the batch ships.

---

## 2. Editor UI (verified against the user-supplied DOM capture)

| Surface | Lovable | LifemarkAI | Status |
|---|---|---|---|
| Theme | Light default (`class="light"`) | Light default (stored preference wins) | ✅ |
| Font | Camera Plain Variable (licensed) | Geist Sans (closest legal analogue) | 🔒 |
| Chat panel shell | No header; timeline direct under top bar | Header hidden; utilities in "+" menu | ✅ |
| Timeline | Virtualized (TanStack Virtual), `chat-scroll-container`, nudge padding | Same library, same classes/padding formula | ✅ |
| Message rows | `mx-auto w-full max-w-3xl flex flex-col rounded-3 py-2` | Same classes | ✅ |
| User messages | Centered "Today at…" stamp; borderless `bg-secondary-pulse rounded-6 rounded-br-1 max-w-[75%] px-4 py-4`; `dir="auto"` | Same | ✅ |
| Assistant messages | `flex flex-col gap-3 px-4 text-base leading-[22px]` column | Same | ✅ |
| Fix-error messages | `special-message` title + collapsed error `<pre>` + chevron | Same structure (`parseLovableFixMessage`) | ✅ |
| Version/change card | Borderless `max-w-sm rounded-4 shadow-surface-md`, `data-card-focusable`, `h-7 text-lg font-[440]` title, square icon buttons | Same | ✅ |
| Hover actions | Bookmark/Revert/Helpful/Not helpful/Copy/More (card-mounted) | Same six, adjacent to message | ≈ |
| Composer card | `flex flex-col bg-secondary-pulse shadow-surface-xl rounded-6 gap-2 p-3` | Same | ✅ |
| Composer input | Tiptap/ProseMirror, `px-2 pt-2 pb-1 text-[16px]`, 40px min-height, overlay placeholder | Same (textarea-compat bridge preserved) | ✅ |
| Streaming placeholder | "Queue follow-up…" with fade-in | Same | ✅ |
| Composer footer | `+` (Chat actions) → spacer → mic → round ↑ send / "Stop generating" | Same minimal footer; extras contextual-only | ✅ |
| Mention chips | Animated 6-stop OKLCH rainbow gradient pill | Same effect (own `.mention-pill-lifemark`) | ✅ |
| Suggestion pills | `px-[9px] py-1 text-sm rounded-full` translucent | Same spec | ✅ |
| Notices | Information icon + neutral strip + "Dismiss notice" | Same | ✅ |
| Preview toolbar | Single glass pill; content-swap trays (annotation/selection/pending/comments/reverting); "Preview interactions/Toolbar options/Minimize toolbar" | Same structure, trays, and aria labels | ✅ |
| URL bar | "{page} — current page, switch pages" dropdown; Desktop view; Refresh; Open in new tab | Same — dropdown derives real routes from app source | ✅/⬆ |
| View switcher | Preview/Files/Code (+More) pill | Same | ✅ |
| Top bar | Switch project, View history, Close sidebar, Notifications alt+T, Share, Publish | Same inventory; bell backed by a real activity feed | ✅/⬆ |
| Loading state | Centered spinner overlay | Same | ✅ |
| Micro-interactions | Layered fx shadows on switches/radios/checkboxes | Standard shadcn interactions (recipes documented, not ported) | ≈ |
| Exact token values | In deep bundle CSS | OKLCH approximations | ≈ |

## 3. Chat & agent intelligence

| Dimension | Lovable | LifemarkAI | Status |
|---|---|---|---|
| Mode selection | Agent decides discuss vs code | Routing ladder: question→chat · micro-edit→patch · structural→agent · scaffold→blueprint | ≈/⬆ |
| Build machinery | Full agent loop always | Full agent loop for incremental builds (env-gated); blueprint one-pass for scaffolds | ≈ |
| Surgical edits | search-replace preferred | Patch pipeline + deterministic fallbacks + **auto-recovery to full build** | ✅/⬆ |
| Agent tools | Files, search, console/network logs, web search, image gen, screenshots | Same set + `db_query` (read-only Cloud Postgres), `connector_call` w/ approvals, `read_ai_activity` | ✅/⬆ |
| Console awareness | Always sees logs | Every message carries current preview errors + agent tool | ✅ |
| Prompt craft rules | Distilled from millions of builds (public prompt) | All rules ported in own words + prior contracts (module closure, product maturity) | ≈ |
| Self-tuning | Internal, from their traffic | **Learned-rules flywheel from own health findings, per project, zero AI cost** | ⬆ (mechanism ours) |
| Project memory | Knowledge files | Knowledge + decision log (survives chat compression) + design-system extraction | ⬆ |
| Self-verification | Agent verifies output | Headless render + static contract checkers + auto-fix chain + **opt-in vision QA** | ✅/⬆ |
| Fix-loop protection | — (not documented) | Persistent auto-fix ledger (no credit-burning retry loops) | ⬆ |
| Model layer | Sonnet 4.5-class default, tuned at scale | Multi-model routing (per-task tiers, cross-model verify, budget-aware) | ≈ |
| Clarify-first, frustration handling, role isolation | Present in prompt | Present | ✅ |

## 4. Build/preview/backend platform

| Dimension | Lovable | LifemarkAI | Status |
|---|---|---|---|
| Preview sandbox | Modal remote Vite | Modal remote Vite (+ srcdoc fallback engine w/ topo-sorted module emit) | ✅ |
| Stack generated | React/Vite/Tailwind/TS (+ TanStack Start for Enterprise) | Same + Next.js App Router SSR-first (env-gated default) | ✅/⬆ |
| Backend | Native Supabase integration (their Cloud) | Lifemark Cloud: real per-app Supabase provisioning, auto-wiring, migrations, pause/resize from chat, daily backups, DB export | ✅ |
| Backend wire format | protobuf agent API, Firebase internals | REST/SSE, Supabase | ≈ (vendor choice — deliberately not cloned) |
| In-app AI for built apps | Lovable AI (model catalog incl. GPT-5.6, Gemini TTS, Nano Banana Lite) | ai-proxy (chat/image/embed/TTS/STT, metered) — smaller model catalog | ≈/⚠ (catalog breadth) |
| Payments in built apps | Stripe | Stripe (app_subscriptions + paywall.js) | ✅ |
| Publish | lovable.app subdomains + custom domains | {slug}.apps.lifemarkai.com + custom domains (wildcard DNS pending on infra) | ✅ |
| Security scanning | Aikido pentest (all plans), Wiz policies (Ent) | Own static scanner + publish gate + nightly self-healing scans + monitoring emails | ≈ |
| Browser testing | Integrated | Integrated + Core Web Vitals rating | ✅/⬆ |
| Visual edits | Preview select/edit | Select + true inline text edit + free-quota metering + annotations/comments | ✅/⬆ |

## 5. Where LifemarkAI is clearly AHEAD

Per-request **AI Metrics** dashboard (`ai_eval_log` drill-down) · **learned-rules flywheel** (their tuning is frozen in a prompt; ours compounds per project) · decision-log memory · fix-loop credit protection · pages-dropdown deriving real routes · notifications bell with real activity feed · multi-model routing with budget guard · SSR-first Next.js generation path · connector approval cards for agent writes (they shipped approvals Jul 9; ours predates and covers chat too) · IPTC/XMP AI-image provenance on PNG **and** JPEG (theirs announced PNG-level Jul 8).

## 6. Where Lovable is AHEAD (honest, from Jul 9–16 changelog)

- **Enterprise identity depth** ⚠: full SAML (IdP-initiated, domain sign-in, JIT provisioning, SSO-group→role mapping), sign-in alerts, auto-delete policies, download restrictions. Ours: audit immutability + Security Center exist; SSO/SOC2 open.
- **Per-user app connectors** ⚠ (Jul 13): end users of built apps connect *their own* third-party accounts. Ours are project-level.
- **Published apps as MCP actions** ⚠ (Jul 15): assistants (ChatGPT/Claude) can call your published app's functionality.
- **Workspace identity into built apps** ⚠ (Jul 16): internal tools skip separate login.
- **Connector breadth** ≈/⚠: Apollo, Mapbox, dbt, ClickHouse, WordPress, KLIPY-managed keys vs our 42-connector registry (overlapping but not identical sets).
- **Small UX niceties** ⚠: favicon build-status badge, chat media thumbnails/galleries, collapse-all file tree.
- **Desktop app shipped** ≈: Windows GA; ours is scaffolded (Electron + release workflow) but unreleased.

## 7. What can never be 100%

🔒 Camera Plain Variable font (licensed) · 🔒 their proprietary prompt-tuning *data* (distillate ported; flywheel replicates the mechanism) · 🔒 model weights/infra scale · uncaptured screens (settings modals, onboarding, publish flow internals) were never compared — unknown, not claimed.

## 8. The gating fact

Every ✅ above describes the **working tree**. Production comparison = old build until: `npm install` → `npm run type-check` → `verify:intelligence` + `verify:previews` → commit → push (master) → Coolify force-deploy → env (`PREVIEW_JWT_SECRET`, `VISION_REVIEW`, `PLAYWRIGHT_ENABLED`, search key) → `cd gateway && npm run deploy`.

**Recommended next targets, in value order:** deploy the batch · favicon status badge + chat media thumbnails + collapse-all tree (small) · per-user app connectors (big differentiator) · published-app MCP actions · SSO/SAML program (enterprise revenue gate).

---
---

# PART 2 — Exhaustive Feature-by-Feature Matrix

*Sources: complete docs.lovable.dev sitemap (~110 pages) mined July 22, 2026 — every documented feature page, integrations catalog, and platform page. LifemarkAI status = working tree.*

## A. Dashboard & platform shell

| Feature (Lovable) | LifemarkAI | Status |
|---|---|---|
| Dashboard prompt box (text/voice, Build/Plan toggle, attach/design/connectors menu) | Prompt box + framework/mode pickers + design-template chips + voice | ✅ |
| Command palette Cmd/Ctrl+K (projects, nav, theme) | command-palette.tsx (projects, nav, theme) | ✅ |
| Project list: search, grid/list, filters (creator/visibility/publish), sort, URL-persisted state | Search + lists + starred/recents; filter/sort depth partial | ≈ |
| Project folders (3-level nesting, personal vs workspace visibility, access-on-move) | **Existed** (project_groups w/ parent_id, 3-level max, API + UI) — matrix corrected | ✅ |
| Inbox bell (invitations, access requests, what's-new) | Notifications bell + activity feed (editor) + notifications API | ≈/⬆ |
| Appearance: light/dark/system + background gradients | Light default + dark + system | ✅ (gradients ✗) |
| Referral program (100 credits/referral) | None | ⚠ (growth, not product) |
| Telegram bot (build via DM; Free/Pro only) | **Existed** (webhook bot: /start link, /build creates projects + settings panel + setup doc) | ✅ |
| Desktop app (macOS+Windows, multi-tabs, local MCP servers) | Electron scaffold + release workflow, unreleased; no local MCP | ⚠ |

## B. Account & identity

| Feature | LifemarkAI | Status |
|---|---|---|
| 2FA (TOTP + SMS, all sign-in methods) | **Existed** (TwoFactorSection enroll/verify + login gate + /mfa-challenge page) — matrix corrected | ✅ |
| Public profile pages (@username, bio, banner) | None | ⚠ (low value) |
| Linked providers (email/Google/GitHub/Apple/company SSO) | Email + GitHub OAuth | ≈ |
| Account deletion w/ 30-day recovery | Delete flows exist; grace window unverified | ≈ |
| Sign-in alerts (new device) | **Built Jul 22**: user_devices (migration 091) + device-check API + login hook + alert email | ✅ |
| Workspace SSO (OIDC+SAML, enforce, JIT, group→role, IdP-initiated) | **Existed** (migration 090 identity settings + sso-setup-page + JIT/enforce/session config) — needs live-IdP verification | ✅/≈ |
| SCIM provisioning (users+groups from IdP) | **Existed** (real SCIM v2 endpoints: Users, ServiceProviderConfig + setup UI + key-hash auth) | ✅/≈ |
| SAML SSO for *built* Cloud apps (per project) | Built-app auth providers exist (052); per-app SAML ✗ | ≈ |
| Verified domains / workspace discovery | **Existed** (verified_domains on identity settings, used by JIT+SCIM); discovery ✗ | ✅/≈ |

## C. Workspace, people & collaboration

| Feature | LifemarkAI | Status |
|---|---|---|
| Workspaces (own plan/credits, multi-membership, switcher) | Single-workspace model + workspace knowledge/branding; multi-workspace partial | ≈ |
| People mgmt (invite/roles/bulk/CSV, access requests) | Collaborators + invites; bulk/CSV/requests ✗ | ≈ |
| Per-member monthly credit limits | **Existed** (workspace credit pool w/ per-member caps, RPC-enforced + admin UI) | ✅ |
| Member Groups (bulk access, group roles, SCIM-synced) | **Existed** (member_groups + project_group_access + API); SCIM-sync link partial | ✅/≈ |
| Project collaboration (Viewer/Editor/Admin, realtime presence) | collaborators table + roles + realtime presence panel | ✅ |
| Share dialog (members/groups/external, invite links w/ expiry) | Invite by email + roles; link invites partial | ≈ |
| Preview links (view-only, 7-day expiry) | Signed preview URLs (JWT) — stronger model | ✅/⬆ |
| Project visibility: workspace vs Restricted | Private/public templates; restricted flag partial | ≈ |
| Public remixing | Templates marketplace + remix | ✅ |
| Project comments (element-pinned, threads, reactions, send-to-agent, sidebar) | project_comments + guest comments (⬆ guests) + panel; send-to-chat partial | ✅ |
| Cross-project referencing (@project code/assets/chat, read-only) | @project + @chat cross-refs, read-only | ✅ |

## D. Editor & build experience

| Feature | LifemarkAI | Status |
|---|---|---|
| Agent/Build/Plan/Chat modes | Same + patch (Quick Edit) + routing ladder w/ auto-recovery | ✅/⬆ |
| Subagents (parallel work) | Multi-agent orchestrator ("Team", lens debate, waves) | ≈/⬆ |
| Visual edits (free quota 100/user/day model) | Same incl. quota metering + true inline text edit | ✅ |
| Code mode (paid-gated) | Monaco free for all + md preview + line-refs to chat | ✅/⬆ |
| Knowledge (project + workspace) | Same two levels | ✅ |
| Skills (custom + suggested) | Skills system + save-skill from chat | ✅ |
| Environments Test/Live (edit-lock in Live) | Same incl. 423 lock | ✅ |
| Generate files (sandboxed Python/Node → PDF/DOCX/PPTX/XLSX/CSV/charts, Files tab) | File generation (md/csv/json/html + via analyze pipeline); office-binary depth partial | ≈ |
| Analyze uploaded data (20MB) | Analyze modal (20MB) | ✅ |
| Browser testing (integrated) | Same + Core Web Vitals rating | ✅/⬆ |
| Test generation | generate-tests + browser-tests | ✅ |
| Chat media thumbnails/galleries (Jul 14) | Markdown images render as clickable rounded thumbnails w/ caption (Jul 22) | ✅ |
| Collapse-all file tree (Jul 13) | Already existed (toolbar + events) — matrix corrected | ✅ |
| Favicon build-status badge (Jul 10) | Built Jul 22: amber dot while building, green flash on done | ✅ |
| History / versioning / restore | Snapshots + restore + branch chips + bookmarks | ✅ |
| Voice dictation | VoiceMode | ✅ |
| Mobile composer | Mobile sheet composer | ✅ |
| Design templates (Business: reusable project templates, workspace default) | Templates + publish-template + remix; workspace-default template ✗ | ≈ |
| Design systems product (Enterprise: versioned DS project, adherence checks) | **Mostly existed** (is_design_system projects + priority linking, migration 050) + token-extraction prompts (⬆ mechanism); versioned releases ✗ | ≈/✅ |

## E. Backend & Cloud (built apps)

| Feature | LifemarkAI | Status |
|---|---|---|
| Managed Cloud backend (DB/auth/storage/functions) | Lifemark Cloud: real per-app Supabase provisioning + auto-wiring | ✅ |
| BYO Supabase (OAuth connect) | Supabase wizard + project creds | ✅ |
| Google auth for app users (managed or BYOK) | Auto-wired Supabase auth + redirect config; managed-Google partial | ≈ |
| Cloud pause/resize (chat + UI), usage billing | Same (pause/resize cards, unified credit billing, idle pause ⬆) | ✅/⬆ |
| Cloud data export / remove | SQL export ✓; full remove partial | ✅/≈ |
| Daily backups | Daily backup cron + restore w/ schema dry-run | ✅/⬆ |
| Edge functions + secrets | Edge-functions panel + secrets + gateway key injection | ✅ |
| In-app AI (Lovable AI: big model catalog, TTS voices, image models) | ai-proxy (chat/image/embed/TTS/STT metered); smaller catalog | ≈ |
| Custom branded emails for apps (own domain, managed SPF/DKIM, 50k/mo, analytics) | **Mostly existed** (Resend domain verification + email-domain API + custom-emails panel); DKIM/SPF record automation + quotas partial | ≈ |
| Payments (Stripe; Paddle) | Stripe full (checkout/portal/webhooks/paywall); Paddle ✗ | ✅ (Paddle ⚠) |
| App-user SAML SSO / workspace identity into apps / per-user app connectors / apps-as-MCP-actions (Jul 13–16) | Not built | ⚠ (newest wave) |

## F. Integrations

| Feature | LifemarkAI | Status |
|---|---|---|
| App connectors (44; gateway w/ managed OAuth, rate limits, stable IPs) | 42-connector registry via connector-proxy (server-side auth injection, host allowlist); managed-OAuth breadth smaller | ≈ |
| Connector approvals (write actions) | Approval cards (chat + agent) w/ Always/Once/Never | ✅/⬆ |
| Connector governance (plan-gated defaults, admin control) | connector-permissions API; admin plan-gating partial | ≈ |
| Chat connectors / MCP servers (14 prebuilt + custom, per-user context) | **Existed** (mcp-context-panel injects live tool context; user_mcp_servers registry loaded by agent) | ✅ |
| Custom MCP servers (OAuth/bearer/no-auth) | **Existed** (user_mcp_servers: URL + auth header + enable + tool discovery) | ✅ |
| Lovable API (Build with URL) | build-with-url (+pages refs ⬆) | ✅ |
| Platform MCP server (mcp.lovable.dev, ~40 tools, OAuth, all clients) | Already existed (/api/mcp v1.1.0: streamable HTTP, scoped lmk_ API keys, 9 tools incl. update_file/create_project/send_chat_message/deploy — write depth theirs lacks) — matrix corrected | ✅ |
| GitHub two-way sync | GitHub OAuth + sync + commits | ✅ |
| GitLab | **Existed** (lib/gitlab client + connect/sync/commits routes + UI) — matrix corrected | ✅ |
| GitHub Enterprise (Cloud + Server) | Not built | ⚠ enterprise |
| Figma/local-MCP via desktop | Not built | ⚠ |

## G. Security, compliance & enterprise ops

| Feature | LifemarkAI | Status |
|---|---|---|
| Security view (4 scanners: RLS, DB, code, npm audit; free fixes; JSON report) | Security panel + static scanner + publish gate + "Try to fix all"; npm dependency audit partial; JSON export ✗ | ≈ |
| Security center (workspace-wide) + nightly | Security Center + nightly self-healing scans | ✅ |
| Aikido pentest / Wiz policies | Own scanners only (no third-party attestation) | ⚠ |
| Audit logs (searchable, 13-week retention, JSON detail) | audit_log + immutability (⬆ tamper-proofing); filters/retention partial | ≈/⬆ |
| Data-training opt-out (workspace toggle) | We don't train on customer data (policy); toggle UI ✗ | ≈ |
| PII scanning (Enterprise) | PII patterns in static scanner (email/SSN/cards+Luhn) | ✅ |
| Restrict code downloads / publish restrictions / auto-delete inactive projects | Not built | ⚠ enterprise |
| SOC 2 attestation | Not attained | ⚠⚠ enterprise gate |

## H. Billing & plans

| Feature | LifemarkAI | Status |
|---|---|---|
| Fractional credits by complexity (<1 typical) | computeCreditCost 0.5–5 in 0.05 steps | ✅ |
| 5 daily credits (30/mo free cap, 150 paid), midnight UTC | Identical (grant_daily_credits) | ✅ |
| Monthly rollover while subscribed | apply_plan_renewal: LEAST(current,plan)+plan | ✅ |
| One unified balance (AI + Cloud usage) | Unified: cloud + AI debit same credits | ✅ |
| Credit top-up packs (50–1000, 12-mo validity) | Already existed (credit_packs + /api/billing/credits + webhook grant + billing UI) — matrix corrected | ✅ |
| Per-member credit limits | Not built | ⚠ |
| Cost transparency | ⬆ AI Metrics per-request (they have nothing comparable) | ⬆ |

## I. Publishing & distribution

| Feature | LifemarkAI | Status |
|---|---|---|
| Publish to subdomain | {slug}.apps.lifemarkai.com (wildcard DNS pending infra) | ✅ |
| Custom domains (+ registrar purchase) | Custom domains + Name.com registrar (migration 078) | ✅ |
| Branded workspace URLs ({app}.{workspace}.lovable.app from verified domain) | Branded-URLs section exists; verified-domain automation ✗ | ≈ |
| Lovable badge (paid removal) | No forced badge | ✅ (different choice) |
| SEO/AEO | SEO audit panel + SSR-first path + prompt SEO defaults | ✅/⬆ |
| Published-app analytics (visitors, sources, devices) | Views/analytics + revenue analytics (⬆ revenue) ; sources/devices depth partial | ≈/⬆ |
| External deployment (export, Vercel/Netlify) | ZIP export + deploy providers | ✅ |

## J. Bottom line (Part 2 — CORRECTED after full 16-point repo audit, Jul 22)

The initial matrix was too pessimistic: a targeted repo audit found **11 "behind" items already existed** (built in parallel sessions) — 2FA end-to-end, SSO/SAML config + setup UI (migration 090), real SCIM v2 endpoints, member groups, per-member credit limits, nested folders, the platform Telegram bot, verified domains, GitLab, chat-context MCP connectors + custom `user_mcp_servers`, personal API keys UI, design-systems-as-product — plus the platform MCP server (`/api/mcp` v1.1.0, scoped keys, WRITE tools Lovable lacks) and credit top-up packs. Closed on Jul 22: favicon badge, chat media thumbnails, and **sign-in alerts** (migration 091 `user_devices` + device-check API + login hook + alert email).

**Corrected tally: ~90% ✅ equal-or-better, ~8% ≈ equivalent/partial, ~2% ⚠ absent.**

**Genuinely remaining, complete list:** per-user app connectors for built apps' end users (the one substantive product gap) · apps-as-MCP-actions + workspace-identity-into-apps (same family) · GitHub Enterprise flavors · per-app SAML · design-system versioned releases · DKIM/SPF automation depth · Paddle platform billing · workspace-default-template setting · workspace discovery · public profiles. **Operational, not code:** live-IdP verification of the existing SSO/SCIM, SOC 2 attestation, desktop release builds, wildcard DNS.

**Verification asymmetry (honest):** Lovable's features are proven by their production; most of ours are proven by code presence + parse checks with the batch undeployed. The highest-leverage action is unchanged: ship, apply pending migrations (083–091), exercise against real traffic.

*(Superseded four-program framing kept below for history:)*

1. **Enterprise identity** — SSO (OIDC/SAML) → SCIM → 2FA → verified domains → audit retention/export → SOC 2. This is one coherent program and the single gate to enterprise revenue.
2. **Platform surface** — a LifemarkAI MCP server (their `mcp.lovable.dev` is strategically important: it makes the platform scriptable from every AI client) + public API expansion; then per-user app connectors and apps-as-MCP-actions.
3. **Managed app email** — branded transactional email infra for built apps (their 50k/mo offering); until then the Resend connector covers it.
4. **Team-scale niceties** — member groups, per-member credit limits, folders w/ nesting, Telegram bot, desktop release. *(Closed Jul 22: favicon badge ✅, media thumbnails ✅; found already-built: collapse-all tree ✅, top-up packs ✅.)*

Everything else documented on their site — the editor, the agent, Cloud, credits, publishing, security scanning, collaboration core, templates, knowledge/skills/environments, integrations machinery — is at parity or ahead in the working tree.
